---
name: kat
description: Activate when the user asks about the KAT token, staking KAT, the avKAT vault, avKAT rewards or KAT buybacks, unstaking or exiting avKAT, exit fees, the 7-day cooldown, converting vKAT to avKAT, legacy/sunset vKAT positions or gauge voting, or building applications that interact with the KAT token ecosystem on Katana Network.
allowed-tools: get_contract_reference, get_token_prices, get_balances, build_approve, get_swap_quote, build_swap, build_kat_deposit_vault, build_kat_convert_to_vault, build_kat_withdraw_vault, build_kat_begin_withdrawal, build_kat_withdraw, build_kat_cancel_withdrawal, get_kat_locks, build_kat_reset_votes, get_merkl_user_rewards, build_claim_rewards
model: opus
license: MIT
metadata:
  author: katana
  version: '2.0.0'
---

# KAT Token — Katana Network

The KAT token ecosystem on Katana Network: staking KAT into avKAT, how avKAT earns from revenue-funded KAT buybacks, exiting through the 7-day cooldown, and converting legacy vKAT positions.

> **vKAT staking, gauge voting and vote incentives were sunset on November 17, 2026.** avKAT is now the only way to stake KAT. Do not recommend creating new vKAT locks, voting on gauges, or claiming vote incentives. Existing vKAT holders should convert to avKAT (no deadline) or exit.

## KAT Token Overview

KAT is the native ERC-20 token of Katana, deployed on Katana Network (chain ID 747474). 18 decimals, fixed supply of 10 billion. KAT has been fully transferable since March 18, 2026.

## The Two Token Types

| Token | Standard | Transferable | Rewards |
|-------|----------|-------------|---------|
| **KAT** | ERC-20 | Yes | None |
| **avKAT** | ERC-4626 vault shares | Yes (liquid, tradeable, usable in DeFi) | Auto-compounded every epoch from KAT buybacks — nothing to claim |

**vKAT** (ERC-721 soulbound NFT in the VotingEscrow) still exists at the contract level, but it is **sunset** and **earns no rewards**. It now appears only as (a) legacy positions from before November 17, 2026, and (b) the temporary NFT created when unstaking avKAT through the vault.

### How avKAT earns

A share of the revenue from **Katana Swap** (built on Sushi), **Katana Perps**, **Vault Bridge**, and **sequencer fees** is used to buy KAT on the open market. **100% of that bought-back KAT is compounded into avKAT every epoch** via the CompoundStrategy.

- The avKAT balance stays the same; the amount of KAT each avKAT is redeemable for (`convertToAssets`) goes up.
- The exchange rate is measured in KAT — it says nothing about the market price of KAT or avKAT.
- Rewards depend on network usage (more trading, bridging and activity → more buybacks). They are variable and not guaranteed.
- Buybacks currently follow a scheduled process; fully automated onchain buybacks are planned.
- Rewards come from revenue-funded buybacks, **not** from token emissions, gauge voting, or vote incentives.

## Contract Addresses (Mainnet)

| Contract | Address | Purpose |
|----------|---------|---------|
| KAT Token | `0x7F1f4b4b29f5058fA32CC7a97141b8D7e5ABDC2d` | ERC-20 token |
| avKAT Vault | `0x7231dbaCdFc968E07656D12389AB20De82FbfCeB` | ERC-4626 staking vault |
| VotingEscrow | `0x4d6fC15Ca6258b168225D283262743C623c13Ead` | Holds the vault's KAT; exits (begin/withdraw/cancel) go through it |
| NFT Lock | `0x106F7D67Ea25Cb9eFf5064CF604ebf6259Ff296d` | ERC-721 contract for vKAT NFTs |
| Exit Queue | `0x6dE9cAAb658C744aD337Ca5d92D084c97ffF578d` | Withdrawal queue, cooldown & exit fee |
| CompoundStrategy | `0x60233D1c150F9C08D886906d597aA79a205b0463` | Compounds bought-back KAT into the vault |
| Clock | `0x17049d374A2bcdA70F8939C21ad92bcF6B2A95ab` | Epoch timing |

Legacy (sunset) contracts — only relevant for old vKAT positions: GaugeVoter `0x5e755A3C5dc81A79DE7a7cEF192FFA60964c9352`, Curve `0x38b8B74330b2F918C22F7936aCf773C6D963C73c`, Swapper `0x92D2e00b6D2BB50B87a9BE971a82B1F00ac44768`.

## Token Flows

```
KAT   ──approve vault──→ avKATVault.deposit(assets, receiver) ──→ avKAT

avKAT ──avKATVault.withdrawTokenId(assets, receiver, owner)──→ new vKAT NFT
      ──VotingEscrow.beginWithdrawal(tokenId)──→ [7-day cooldown]
      ──VotingEscrow.withdraw(tokenId)──→ KAT (0% fee after 7 days, up to 25% earlier)

avKAT ──swap on a DEX──→ KAT          (instant, market rate, trading fees + slippage)

legacy vKAT ──approve NFT to vault──→ avKATVault.depositTokenId(tokenId, receiver) ──→ avKAT
legacy vKAT ──beginWithdrawal → wait → withdraw──→ KAT
```

## Exit Fee Schedule

Unstaking starts a **7-day cooldown**. Waiting the full cooldown costs **no fee**. Withdrawing earlier costs a fee that starts at **25%** and decreases linearly to **0%**.

| Time left in cooldown | Fee | 1,000 KAT → receive |
|---|---|---|
| 7 days (instant exit) | 25% | 750 KAT |
| 6 days | 21% | 790 KAT |
| 5 days | 18% | 820 KAT |
| 4 days | 14% | 860 KAT |
| 3 days | 11% | 890 KAT |
| 2 days | 7% | 930 KAT |
| 1 day | 4% | 960 KAT |
| Cooldown complete | 0% | 1,000 KAT |

```
feeBps   = MAX_FEE_BPS - (MAX_FEE_BPS - MIN_FEE_BPS) × elapsed / COOLDOWN   (elapsed clamped to COOLDOWN)
MAX_FEE_BPS = 2500   MIN_FEE_BPS = 0   COOLDOWN = 604800 s (7 days)   BPS_DENOMINATOR = 10000
```

**The on-chain ExitQueue is the source of truth.** Its values are readable via `cooldown()`, `feePercent()` (max, bps) and `minFeePercent()` (min, bps), and are returned live as `exitFee` by `get_contract_reference` and as `exitParams` by `build_kat_begin_withdrawal` / `build_kat_withdraw`. Before quoting a fee or cooldown to a user, check the live values. If they differ from the schedule above (for example around the November 17, 2026 transition, or after a later parameter change), tell the user and compute the fee from the live values using the same linear formula.

**Each exit keeps the terms it was queued with.** `queue(tokenId)` stores the cooldown and fee parameters in effect when `beginWithdrawal` ran. An exit started under older terms (e.g. a 60-day cooldown with a 2.5% minimum fee) is not moved onto the new schedule — for a queued exit, use `calculateFee(tokenId)` rather than the table above.

| Exit path | Time | Fee |
|---|---|---|
| avKAT → full cooldown | 7 days | 0% |
| avKAT → early exit | 1–6 days | 21% down to 4% |
| avKAT → instant exit through vault | Instant | 25% |
| avKAT → swap on DEX | Instant | Market rate, trading fees, price impact, slippage |
| legacy vKAT | 7 days | 0% after cooldown (or convert to avKAT) |

**Cancel**: during the cooldown, `VotingEscrow.cancelWithdrawalRequest(tokenId)` stops the exit. This leaves the user holding a **vKAT NFT, which earns nothing** — deposit it back into the vault (`depositTokenId`) to resume earning.

## Workflows

### Check KAT position
1. `get_balances` — KAT and avKAT balances
2. `get_kat_locks` — any vKAT NFTs (legacy positions or NFTs mid-exit)
3. `get_token_prices` with `tokens: "KAT"` — KAT price for USD values
4. For avKAT → KAT value, read `avKATVault.convertToAssets(shares)` (exchange rate is > 1 KAT per avKAT)

### Stake KAT → avKAT
1. `build_approve` — approve the avKAT Vault (`0x7231dbaCdFc968E07656D12389AB20De82FbfCeB`) to spend KAT
2. `build_kat_deposit_vault` — calls `deposit(assets, receiver)`, returns avKAT shares
3. Optionally preview with `previewDeposit(assets)` — the user will receive fewer avKAT than KAT deposited because the exchange rate is above 1

### Unstake avKAT → KAT (7-day cooldown)
1. **Redeem to NFT:** `build_kat_withdraw_vault` with `amount`, `owner`, and `amountIn: "avKAT"` (default) or `"KAT"`. It calls `avKATVault.withdrawTokenId(assets, receiver, owner)` — the first argument is the **KAT (assets) amount**, not avKAT shares; the tool converts for you. This burns avKAT and mints a **new** vKAT NFT. Get the new token ID from the tx logs or `get_kat_locks`.
   - **Minimum:** the KAT value must be at least the VotingEscrow `minDeposit()` (230 KAT at time of writing; the tool reads it live). Smaller amounts revert with `AmountTooSmall()` — for small balances the only exit is a DEX swap.
2. `build_kat_begin_withdrawal` with that `tokenId` — starts the 7-day cooldown
3. Wait. Track it with `ExitQueue.queue(tokenId)` (entry incl. the cooldown and fee terms locked at queue time), `canExit(tokenId)` and `calculateFee(tokenId)` (fee in KAT if withdrawn now)
4. `build_kat_withdraw` — receive KAT (0% fee after 7 days; earlier = fee per schedule)

For an **instant exit through the vault** (25% fee), do steps 2 and 4 back to back. Always tell the user the fee in KAT before they choose this.

### Exit avKAT instantly via DEX
1. `get_swap_quote` with `tokenIn: "avKAT"`, `tokenOut: "KAT"` — check output and price impact
2. Compare against `convertToAssets(shares)`: if the DEX output is well below the redeemable KAT, the 7-day cooldown is likely better
3. `build_approve` (avKAT → router) then `build_swap`

### Convert legacy vKAT → avKAT
1. `get_kat_locks` — list the user's vKAT NFTs and locked amounts
2. Approve the vault for the NFT on NFT Lock (`0x106F...296d`): `approve(vault, tokenId)` or `setApprovalForAll(vault, true)`
3. `build_kat_convert_to_vault` — calls `depositTokenId(tokenId, receiver)`. One-way; the NFT is consumed
4. No deadline. Warn the user they will receive **fewer avKAT than the KAT in the lock** (because 1 avKAT > 1 KAT); the avKAT is backed by the same amount of KAT

### Exit legacy vKAT → KAT
1. `get_kat_locks` — check `isVoting` for the token
2. If it still has pre-sunset gauge votes, use `build_kat_begin_withdrawal` with `resetVotes: true` (calls `resetVotesAndBeginWithdrawal`), or `build_kat_reset_votes` first
3. Wait the 7-day cooldown, then `build_kat_withdraw`

### Legacy vote incentives
Vote incentives ended on November 17, 2026. If a user has unclaimed pre-sunset Merkl rewards, `get_merkl_user_rewards` → `build_claim_rewards` still works. avKAT has nothing to claim.

## Key Function Signatures

### avKAT Vault (ERC-4626)
```
deposit(uint256 assets, address receiver) → uint256 shares
depositTokenId(uint256 tokenId, address receiver) → uint256 shares     // vKAT → avKAT
withdrawTokenId(uint256 assets, address receiver, address owner) → uint256 tokenId   // avKAT → new vKAT NFT for exit; assets = KAT amount, must be ≥ VotingEscrow.minDeposit()
previewDeposit(uint256 assets) → uint256 shares
previewRedeem(uint256 shares) → uint256 assets
convertToShares(uint256 assets) → uint256 shares
convertToAssets(uint256 shares) → uint256 assets
totalAssets() → uint256
balanceOf(address) → uint256
```

### VotingEscrow
```
beginWithdrawal(uint256 tokenId)
withdraw(uint256 tokenId)
cancelWithdrawalRequest(uint256 tokenId)
resetVotesAndBeginWithdrawal(uint256 tokenId)   // legacy vKAT that still has gauge votes
isVoting(uint256 tokenId) → bool
locked(uint256 tokenId) → (uint256 amount, uint256 start)
ownedTokens(address owner) → uint256[]
minDeposit() → uint256                          // minimum KAT per lock (230 KAT at time of writing)
```

### Exit Queue
```
cooldown() → uint256          // seconds, for new exits
feePercent() → uint256        // max fee, bps, for new exits
minFeePercent() → uint256     // min fee, bps, for new exits
queue(uint256 tokenId)        // exit entry: holder, queued timestamp, and the cooldown/fee params locked at queue time
canExit(uint256 tokenId) → bool
calculateFee(uint256 tokenId) → uint256   // fee in KAT (wei) if withdrawn now
```
There is **no** `getQueueEntry` function — calls to it revert (the katana-docs unstake guide shows it, but it doesn't exist on-chain).

### NFT Lock (ERC-721)
```
approve(address to, uint256 tokenId)
setApprovalForAll(address operator, bool approved)
```

## Common Mistakes

- **Recommending vKAT staking or gauge voting.** Both were sunset on November 17, 2026. `build_kat_stake`, `build_kat_vote`, `build_kat_merge`, `build_kat_split` and `get_kat_gauges` target sunset mechanics — do not suggest them for new activity. Stake into avKAT instead.
- **Telling users to claim avKAT rewards.** avKAT compounds automatically every epoch; there is nothing to claim or restake.
- **Describing rewards as emissions or vote incentives.** avKAT rewards come from revenue-funded KAT buybacks (Katana Swap, Katana Perps, Vault Bridge, sequencer fees).
- **Using `redeem()` to unstake.** The documented unstake path is `withdrawTokenId` → `beginWithdrawal` → wait → `withdraw` (`build_kat_withdraw_vault` → `build_kat_begin_withdrawal` → `build_kat_withdraw`).
- **Passing avKAT shares to `withdrawTokenId`.** Its first argument is the KAT (assets) amount. Passing a share count silently unstakes less than intended.
- **Unstaking less than the minimum.** Unstaking under `minDeposit()` (230 KAT at time of writing) of KAT value through the vault reverts with `AmountTooSmall()`. Swap on the DEX instead.
- **Calling `getQueueEntry`.** It doesn't exist on the ExitQueue. Use `queue`, `canExit` and `calculateFee`.
- **Quoting the new schedule for an exit already in progress.** Each exit keeps the terms it was queued with — use `calculateFee(tokenId)`.
- **Not mentioning the fee-free option.** Exiting before 7 days costs up to 25%. Always state the fee in KAT and that waiting the full cooldown is free.
- **Calling a DEX exit "free".** There's no protocol fee, but the swap is at the market rate and can be below the redeemable KAT value due to fees, price impact and thin liquidity. Quote first.
- **Leaving a cancelled exit as vKAT.** A cancelled withdrawal leaves a vKAT NFT that earns nothing — redeposit it with `depositTokenId`.
- **Surprise at fewer avKAT tokens.** Depositing KAT or converting vKAT returns fewer avKAT than KAT because each avKAT is worth more than 1 KAT. The underlying KAT is the same.
- **Approving the wrong contract.** Depositing KAT requires approving the avKAT Vault (`0x7231...CeB`) on the KAT token. Converting vKAT requires approving the vault on the NFT Lock (`0x106F...296d`), not the VotingEscrow.
- **Assuming the exchange rate is a price.** `convertToAssets` is measured in KAT; it says nothing about KAT's or avKAT's market price.
- **Relying on the block explorer.** `explorer.katana.network` sits behind Cloudflare and may return 403/1000 errors. Don't rely on it for ABI lookups — use this reference instead.

## Risks to Mention

- Smart contract risk in the vault and supporting contracts
- Variable rewards that depend on protocol revenue and network activity
- avKAT DEX liquidity risk (slippage, price below underlying KAT value)
- Exit fee of up to 25% before the 7-day cooldown completes
- The staking and buyback program may be modified or ended

## Legacy Reference: Gauge Voting (sunset)

Only needed to interpret or unwind pre-sunset vKAT positions. Katana's GaugeVoter uses non-standard names — do **not** assume Solidly/Velodrome ABIs:

```
reset(uint256 tokenId)
isVoting(uint256 tokenId) → bool
getAllGauges() → address[]
gauges(address gauge) → bool            // NOT isAlive/isGauge
gaugeVotes(address gauge) → uint256     // NOT weights
totalVotingPowerCast() → uint256        // NOT totalWeight
```

`weights()`, `totalWeight()`, `isAlive()`, `isGauge()`, `getActiveGauges()` and `poolForGauge()` do not exist. Gauge addresses are the pool addresses themselves (`token0()`, `token1()`, `fee()` work on them; `fee()` reverts on V2 pools).

LP incentives for Katana Swap pools are now allocated by the **Katana Foundation**, not by gauge votes.

## Cross-References

- **wallet-manager**: `build_approve` for the avKAT Vault, `get_balances` for KAT/avKAT balances
- **dex**: swap avKAT ↔ KAT on Katana Swap for an instant exit (quote first)
- **analytics**: `get_token_prices` for KAT price, `get_contract_reference` for KAT ecosystem addresses
- **merkl**: claim any leftover pre-sunset vote incentives; LP incentives on Katana Swap pools
- **lending**: Morpho markets may accept avKAT as collateral
