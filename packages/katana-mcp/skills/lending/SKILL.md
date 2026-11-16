---
name: lending
description: Activate when the user asks about lending, borrowing, Morpho markets, vaults, positions, leverage, looping strategies, or yield farming on Katana Network.
allowed-tools: list_morpho_markets, list_morpho_vaults, get_morpho_markets, get_morpho_position, get_morpho_vault_detail, analyze_loop_strategy, build_morpho_supply, build_morpho_withdraw, build_morpho_borrow, build_morpho_authorize, build_morpho_loop, build_morpho_vault_deposit, build_morpho_vault_withdraw, build_approve, get_token_prices
model: opus
license: MIT
metadata:
  author: katana
  version: '1.0.0'
---

# Lending Advisor — Morpho on Katana

Lending, borrowing, leveraged loops, and vault deposits on Morpho Blue on Katana Network.

## Morpho Blue Overview

Morpho Blue is a permissionless lending protocol with two modes:

1. **Direct Markets** — isolated pairs with a specific collateral token, loan token, oracle, IRM (interest rate model), and LLTV (liquidation loan-to-value). Users supply loan tokens to earn interest or deposit collateral to borrow.
2. **Vaults** — ERC-4626 vaults managed by curators that allocate deposits across markets. Simpler: just deposit and earn. Two generations exist on Katana:
   - **MetaMorpho (v1)** — allocates directly across Morpho Blue markets.
   - **Vault V2** — allocates through *adapters* (e.g. a MorphoMarketV1 adapter = Morpho Blue markets) under per-adapter, per-collateral and per-market caps.

### Key Concepts

- **Market ID**: bytes32 hex string uniquely identifying a market (derived from its parameters)
- **LLTV**: Liquidation Loan-to-Value ratio. If `borrowValue / collateralValue > LLTV`, the position is liquidatable. Higher LLTV = more leverage capacity but more risk.
- **Health Factor**: `(collateralValue × LLTV) / debtValue`. Below 1.0 = liquidatable. **Keep above 1.5 for safety.**
- **Utilization**: `totalBorrow / totalSupply`. Higher utilization = higher borrow rates but less available liquidity.

### Contract Addresses (Mainnet)

| Contract | Address |
|----------|---------|
| Morpho Core | `0xD50F2DffFd62f94Ee4AEd9ca05C61d0753268aBc` |
| Bundler3 | `0xA8C5e23C9C0DF2b6fF716486c6bBEBB6661548C8` |
| GeneralAdapter1 | `0x916Aa175C36E845db45fF6DDB886AE437d403B61` |

## Tools

### Discovery

All read tools below use the **Morpho API** on Katana mainnet (see Data Sources) and fall back to on-chain reads if it is unavailable. Every response includes `source: "morpho-api"` or `"rpc"`. API-only fields (USD values, APYs, `listed`, `warnings`, Vault V2s) are absent on the `rpc` path — say so if you're answering from fallback data.

#### list_morpho_markets

Discover all Morpho Blue lending markets on Katana.

- `network`: `"mainnet"` | `"testnet"`
- `minSupplyUsd` (default 100): hide markets with less supply than this. `0` shows all.
- `listedOnly` (default false): only markets listed (curated) by Morpho.

Returns per market: ID, loan/collateral symbols, LLTV, total supply/borrow/liquidity, utilization, supply and borrow in USD, `supplyApy`/`borrowApy` and `netSupplyApy`/`netBorrowApy` (net = including rewards), `listed`, and `warnings`. Dead markets (0 supply and 0 borrow) are dropped; `filteredOut` counts what the filters removed.

#### list_morpho_vaults

Discover all Morpho vaults on Katana — MetaMorpho (v1) **and Vault V2**.

- `network`: `"mainnet"` | `"testnet"`
- `listedOnly` (default false): only vaults listed (curated) by Morpho.
- `includeV2` (default true): include Vault V2s.

Returns per vault, sorted by USD TVL: `version` (`v1`/`v2`), address, name, asset, TVL in tokens and USD, `apy`/`netApy`, fees (v1: `fee`; v2: `performanceFee`/`managementFee`), curator, owner, `listed`, `warnings`. V2 entries also include `liquidity`. Testnet / fallback returns v1 vaults only.

#### get_morpho_markets

Get detailed info for specific markets (one API call for all IDs).

- `marketIds` (required): comma-separated market IDs (bytes32 hex strings)
- `network`: `"mainnet"` | `"testnet"`

Returns: `params` (loan token, collateral token, oracle, IRM, LLTV) and `state` (supply, borrow, liquidity, utilization, fee, USD values, supply/borrow APYs with and without rewards), plus `listed` and `warnings`.

#### get_morpho_position

Check a user's position in a specific market.

- `marketId` (required): market ID
- `user` (required): user address
- `network`: `"mainnet"` | `"testnet"`

Returns: supply, borrow and collateral amounts — **read on-chain, exact and current**. When the position has debt (mainnet), a `risk` block from the Morpho API adds `healthFactor`, `priceDropToLiquidation` (how far the collateral price can fall before liquidation) and USD values. **Health factor < 1.0 means liquidatable.** Risk metrics are indexed and can lag a few blocks — near 1.0, tell the user to act now rather than wait for a fresher number.

#### get_morpho_vault_detail

Detailed breakdown of one vault — v1 or V2 (detected automatically).

- `vault` (required): vault address (from `list_morpho_vaults`)
- `network`: `"mainnet"` | `"testnet"`

Returns for **v1**: name, TVL (tokens and USD), fee, APY/net APY, curator, `listed`, `warnings`, per-market allocations (vault supply, supply cap, market utilization, market liquidity, withdrawable) and aggregate `withdrawalLiquidity`.
Returns for **V2**: TVL, APYs, performance/management fees, curator, owner, `listed`, `warnings`, `withdrawalLiquidity`, `idle` assets, `adapters` (type and assets) and `caps` (absolute/relative cap and current allocation).

### Reading listings, warnings and APYs

- **`listed`** means Morpho curates the market or vault in its app. Markets and vaults are permissionless, so unlisted ones can be legitimate — but on Katana most unlisted vaults are small personal or test vaults. Prefer listed ones when recommending, and say when something is unlisted.
- **`warnings`** are Morpho's risk flags, formatted `LEVEL:type`, RED first. Treat any RED (e.g. `oracle_unusable`, `bad_debt_unrealized`, `sustained_low_liquidity`, `deposit_disabled`, `short_timelock`) as a reason **not** to deposit or borrow without explicitly warning the user. YELLOW flags (e.g. `low_liquidity`, `unrecognized_collateral_asset`, `not_whitelisted`) should be mentioned.
- **`UNVERIFIED:implausible_apy`** is added when a vault's net APY is above 100%. These are almost always tiny personal vaults or broken accounting — never present that APY as a real yield.
- **APYs** are current rates and move with utilization. `net*` values include rewards (and vault fees for vaults).

### Lending & Borrowing

#### build_morpho_supply

Build an unsigned transaction to supply (lend) assets to a market.

- `marketId` (required): market ID
- `amount` (required): loan token amount (e.g. `"1000"`)
- `onBehalf` (required): address to credit (usually the user's own address)
- `network`: `"mainnet"` | `"testnet"`

**Requires approval:** User must approve Morpho Core (`0xD50F2DffFd62f94Ee4AEd9ca05C61d0753268aBc`) to spend the loan token.

#### build_morpho_withdraw

Build an unsigned transaction to withdraw supplied assets.

- `marketId` (required): market ID
- `amount` (required): loan token amount to withdraw
- `onBehalf` (required): address that owns the supply position
- `receiver` (required): address to receive tokens
- `network`: `"mainnet"` | `"testnet"`

May fail if insufficient liquidity in the market (totalSupply - totalBorrow < withdrawal amount).

#### build_morpho_borrow

Build an unsigned transaction to borrow assets.

- `marketId` (required): market ID
- `amount` (required): loan token amount to borrow
- `onBehalf` (required): address that owns the collateral and will owe the debt
- `receiver` (required): address to receive borrowed tokens
- `network`: `"mainnet"` | `"testnet"`

Requires sufficient collateral already deposited. The LLTV constrains maximum borrow. **Check health factor after borrowing.**

#### build_morpho_vault_withdraw

Build an unsigned transaction to withdraw from a MetaMorpho vault.

- `vault` (required): vault address
- `amount` (required): amount to withdraw or redeem (human-readable)
- `mode`: `"withdraw"` (specify asset amount to receive) or `"redeem"` (specify shares to burn). Default: `"withdraw"`
- `receiver` (required): address to receive the withdrawn assets
- `owner` (required): address that owns the vault shares
- `network`: `"mainnet"` | `"testnet"`

Returns: unsigned tx, preview of shares burned / assets received, max withdrawable amount. Warns if requested amount exceeds available liquidity.

### Leverage Loops

#### analyze_loop_strategy

Simulate a looping strategy with real swap slippage from Sushi QuoterV2.

- `marketId` (required): bytes32 market ID from `list_morpho_markets` (must be exactly 66 characters: `0x` + 64 hex chars). **Does NOT accept token symbols** — you must look up the market ID first.
- `amount` (required): initial collateral amount (e.g. `"10"` for 10 WETH)
- `loops` (default 5, max 10): number of loop iterations
- `network`: `"mainnet"` | `"testnet"`

Returns per-loop breakdown (supply, borrow, swap amounts, slippage), unwind analysis (cost to exit), effective leverage, final health factor, and total slippage cost. **Always run this before building a loop.**

#### build_morpho_authorize

Check and build the one-time authorization for GeneralAdapter1 on Morpho.

- `userAddress` (required): wallet address
- `network`: `"mainnet"` | `"testnet"`

Returns either "already authorized" or an unsigned `setAuthorization()` tx. This is a **one-time prerequisite** for `build_morpho_loop`. The adapter needs permission to act on behalf of the user in Morpho.

#### build_morpho_loop

Build an atomic leveraged loop using Morpho flashloans + Bundler3 + Sushi swap.

- `marketId` (required): market ID
- `userAddress` (required): wallet address
- `amount` (required): initial collateral amount
- `targetLeverage` (required): leverage multiplier (e.g. `3.0` for 3x). Min 1.1, max 20.
- `maxSlippageBps` (default 100): max swap slippage in bps (100 = 1%)
- `swapFeeTier` (default 3000): Sushi V3 fee tier for the swap
- `network`: `"mainnet"` | `"testnet"`

Builds a single atomic `Bundler3.multicall()` tx that executes: pull collateral → flashloan → swap on Sushi → supply collateral → borrow to repay flash.

Returns: prerequisites (authorization + approval status), unsigned tx, and position summary with health factor.

**Two prerequisites:**
1. Morpho authorization for GeneralAdapter1 (via `build_morpho_authorize`)
2. ERC20 approval for **Bundler3** (`0xA8C5e23C9C0DF2b6fF716486c6bBEBB6661548C8`) to pull initial collateral — **not Morpho Core**

## Workflows

### Explore and Supply (3 Steps)
1. `list_morpho_markets` — discover available markets with yields and utilization
2. `build_approve` — approve Morpho Core (`0xD50F2DffFd62f94Ee4AEd9ca05C61d0753268aBc`) to spend the loan token
3. `build_morpho_supply` — build the supply tx

### Passive Vault Deposit
1. `list_morpho_vaults` — find vaults by net APY, TVL and fees; prefer `listed` vaults with no RED `warnings`
2. `get_morpho_vault_detail` — inspect vault allocations, market utilization, and withdrawal liquidity before depositing
3. `build_approve` — approve the vault address to spend the underlying asset
4. `build_morpho_vault_deposit` — build the deposit tx (returns preview of shares received)

### Vault Withdrawal
1. `get_morpho_vault_detail` — check withdrawal liquidity (some markets may have high utilization locking funds)
2. `build_morpho_vault_withdraw` — build the withdrawal tx (withdraw by asset amount or redeem by shares)

### Vault Risk Analysis
1. `get_morpho_vault_detail` — inspect per-market allocations, utilization, and withdrawal liquidity
2. `get_pools` (from dex tools) — check DEX exit liquidity for each collateral token vs the loan token. If a collateral token has no Sushi pool or thin liquidity, liquidations may be difficult.
3. `get_swap_quote` (from dex tools) — estimate slippage for liquidation-sized trades to assess real exit costs

### Leverage Loop (5 Steps)
0. **Tell the user about the RPC requirement first.** Loop tools make dozens of swap-quote and on-chain requests per run. On the free public Katana RPC they can be rate-limited partway through, so say up front: *"Loop simulations and builds need many RPC requests. For reliable results, configure your own Katana RPC provider by setting `KATANA_RPC_URL` and restarting the MCP server. I can try on the public RPC, but it may be rate-limited."* Skip this if a response already shows `rpc` as custom (no `rpc.provider: "public"` note).
1. `list_morpho_markets` — find a suitable market (good LLTV, sufficient liquidity)
2. `analyze_loop_strategy` — **always simulate first** to see effective leverage, health factor, slippage costs, and unwind analysis
3. `build_morpho_authorize` — check/build one-time authorization for GeneralAdapter1
4. `build_approve` — approve **Bundler3** (`0xA8C5e23C9C0DF2b6fF716486c6bBEBB6661548C8`) to spend the collateral token
5. `build_morpho_loop` — build the atomic loop tx

### Monitor and Manage Position
1. `get_morpho_position` — check supply, borrow, collateral, health factor
2. If health factor is dropping: supply more collateral or repay debt
3. `build_morpho_withdraw` — withdraw supplied assets when ready to exit

## Safety Guidelines

- **Loop tools and the RPC:**
  - **`rpc.provider: "public"` on a success:** relay the note. The run worked, but it's on the free public RPC, and the user should set up their own provider for reliable use.
  - **`needsCustomRpc: true` on an error:** the public RPC rate-limited or dropped the requests even after retries. Explain that this is **not** a liquidity or market problem, and that running loop tools properly requires the user's own RPC provider. Give them the `howToFix` steps (set `KATANA_RPC_URL` and restart the MCP server). Do not retry in a tight loop; one retry after a minute is reasonable.
  - **`rpc: "custom"` with an error:** their own provider is limiting them. Suggest checking its plan limits.
  - **Never report a rate-limited quote as "no liquidity".** The tools only say a pair has no route when every quote genuinely reverts.
- **Health factor:** Always check after borrowing or looping. Keep above **1.5** for safety margin (1.0 = liquidation threshold). The tools enforce a 5% safety margin on max leverage: `maxSafeLeverage = 1/(1-LLTV) × 0.95`.
- **LLTV is NOT the recommended borrow ratio.** Borrowing at exactly LLTV means instant liquidation risk. Stay well below.
- **Analyze before looping.** `analyze_loop_strategy` shows real swap slippage and unwind costs. If `unwindDebtShortfall > 0`, warn the user that exiting the loop will cost extra due to slippage.
- **Market liquidity.** Available borrow = totalSupply - totalBorrow. The tools check this, but warn the user if utilization is very high (>90%) — they may have trouble withdrawing later.
- **Leverage loops are complex.** Make sure the user understands: they are taking a leveraged position that amplifies both gains and losses. Liquidation risk increases with leverage.

## Warnings

- **Approval targets differ by operation:**
  - Supply/borrow → approve **Morpho Core** (`0xD50F2DffFd62f94Ee4AEd9ca05C61d0753268aBc`)
  - Leverage loops → approve **Bundler3** (`0xA8C5e23C9C0DF2b6fF716486c6bBEBB6661548C8`)
- **Authorization is separate from approval.** `build_morpho_authorize` grants GeneralAdapter1 permission to act in Morpho on the user's behalf. `build_approve` grants ERC20 token spending. Both are needed for loops.
- **Vault V2 transactions.** `list_morpho_vaults` and `get_morpho_vault_detail` cover Vault V2s, and V2s use the same ERC-4626 `deposit`/`withdraw`/`redeem` interface, but `build_morpho_vault_deposit`/`build_morpho_vault_withdraw` were built and tested against MetaMorpho v1. Check `get_morpho_vault_detail` (liquidity, caps, warnings) before building a V2 transaction.
- **Fallback is slower and thinner.** If a response says `source: "rpc"`, the Morpho API was unreachable: the first discovery call scans events from genesis, and may hit public-RPC rate limits.

## Common Mistakes

- **Passing token symbols instead of market IDs.** `analyze_loop_strategy`, `build_morpho_loop`, `get_morpho_position`, and all market-specific tools require a `marketId` (bytes32 hex). To find the right market ID, first call `list_morpho_markets` and match by loan/collateral token pair and LLTV.
- **Truncated or malformed market IDs.** Market IDs must be exactly 66 characters (`0x` + 64 hex digits). A shorter string will fail with a viem bytes size mismatch error. Always copy the full ID from `list_morpho_markets` output.
- **Calling market-specific tools in parallel before having the market ID.** Use `list_morpho_markets` first, then pass the returned ID to `analyze_loop_strategy` or `build_morpho_loop`. Do not guess or construct market IDs.

## Data Sources

The MCP server uses two complementary data sources for Morpho data:

1. **Morpho API** (`https://api.morpho.org/graphql`, docs: https://docs.morpho.org/api) — Morpho's indexed data: markets, v1 vaults, Vault V2s, positions, USD values, APYs, rewards, listing status and risk warnings. Primary source for `list_morpho_markets`, `list_morpho_vaults`, `get_morpho_markets`, `get_morpho_vault_detail`, and the `risk` block of `get_morpho_position`. **Locked to Katana mainnet (chain 747474)** in code — the chain ID is never taken from tool input. Bokuto testnet is not indexed by Morpho, so testnet always uses RPC. Responses are cached for 60s. Rate limit: 750 requests/min per IP (keyless).
2. **Katana RPC** (`https://rpc.katana.network/`) — Direct on-chain reads via viem. Used for user balances in `get_morpho_position`, for every `build_*` tool and `analyze_loop_strategy` (transactions need exact, current values), on testnet, and as the automatic fallback when the Morpho API is unavailable.

The SushiSwap DEX tools provide additional on-chain data for swap quotes, pool discovery, and liquidity analysis via the Sushi V3/V2 router contracts.

## Cross-References

- **wallet-manager**: `build_approve` for Morpho Core or Bundler3 approvals, `get_balances` to check token balances
- **dex**: Sushi V3 provides the swap leg inside leverage loops. Use `get_swap_quote` to preview swap rates independently. Use `get_pools` to check DEX exit liquidity for vault collateral tokens — essential for assessing liquidation risk.
- **merkl**: `get_merkl_opportunities` with `protocol: "morpho"` to check reward incentives on Morpho markets/vaults
- **analytics**: `get_token_prices` for USD position values, `get_gas_price` for cost estimates on complex transactions
