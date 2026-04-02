---
name: dex
description: Activate when the user wants to swap tokens, get trade quotes, check pool liquidity, or provide liquidity on SushiSwap on Katana Network.
allowed-tools: get_swap_quote, build_swap, get_pools, build_add_liquidity_v3, build_add_liquidity_v2, build_approve, get_token_prices
model: opus
license: MIT
metadata:
  author: katana
  version: '1.0.0'
---

# Swap Planner — SushiSwap on Katana

Token swaps, trade quoting, pool analysis, and liquidity provision on SushiSwap (V3 + V2) on Katana Network.

## SushiSwap Overview

SushiSwap on Katana offers both concentrated liquidity (V3) and full-range (V2) pools. V3 is generally preferred for better capital efficiency and tighter spreads.

### V3 Fee Tiers

| Fee | Bps | Tick Spacing | Typical Use |
|-----|-----|-------------|-------------|
| 100 | 0.01% | 1 | Stablecoin pairs |
| 500 | 0.05% | 10 | Correlated assets |
| 3000 | 0.3% | 60 | Most pairs (default) |
| 10000 | 1% | 200 | Exotic/volatile pairs |

### Contract Addresses (Mainnet)

| Contract | Address |
|----------|---------|
| V3 SwapRouter | `0x4e1d81A3E627b9294532e990109e4c21d217376C` |
| V3 PositionManager | `0x2659C6085D26144117D904C46B48B6d180393d27` |
| V2 Router | `0x69cC349932ae18ED406eeB917d79b9b3033fB68E` |

## Tools

### get_swap_quote

Get the best swap quote across all V3 fee tiers and V2. Read-only — no transaction built.

- `tokenIn` (required): token to sell — symbol or address
- `tokenOut` (required): token to buy — symbol or address
- `amountIn` (required): amount to sell in human-readable units (e.g. `"1000"` for 1000 USDC)
- `network`: `"mainnet"` | `"testnet"`

Returns quotes sorted best-first with expected output, price impact, fee tier, and route version. **Always call this before building a swap** to find the optimal fee tier and show the user expected output.

### build_swap

Build an unsigned swap transaction.

- `tokenIn` (required): token to sell
- `tokenOut` (required): token to buy
- `amountIn` (required): amount to sell
- `recipient` (required): address to receive output tokens
- `slippageBps` (default 50): slippage tolerance in basis points (50 = 0.5%)
- `fee` (default 3000): V3 fee tier — use the one from the best quote
- `version` (default `"v3"`): `"v3"` or `"v2"`
- `deadlineMinutes` (default 20): tx deadline from now
- `network`: `"mainnet"` | `"testnet"`

**Requires approval first.** The user must approve the router to spend `tokenIn` (use `build_approve` from wallet-manager).

### get_pools

Deep analysis of Sushi V3 pools for a token pair.

- `tokenA` (required): first token — symbol or address
- `tokenB` (required): second token — symbol or address
- `tickDepth` (default 5, max 20): tick bitmap words to scan each side. Higher = wider view, more RPC calls.
- `network`: `"mainnet"` | `"testnet"`

Returns per-fee-tier: pool address, current price, current tick, token reserves, TVL, active liquidity, and tick concentration map showing where liquidity is distributed. Essential for LP planning.

### build_add_liquidity_v3

Build an unsigned V3 concentrated liquidity position (mints an NFT).

- `tokenA`, `tokenB` (required): the token pair
- `amountA`, `amountB` (required): amounts to provide
- `fee` (default 3000): V3 fee tier
- `tickLower`, `tickUpper` (required): tick range boundaries
- `recipient` (required): address to receive the LP NFT
- `deadlineMinutes` (default 20)
- `network`: `"mainnet"` | `"testnet"`

**Tick ranges must be divisible by tickSpacing** (1 for 100 fee, 10 for 500, 60 for 3000, 200 for 10000). Invalid ticks will revert.

**Requires approval of BOTH tokens** for the PositionManager (`0x2659C6085D26144117D904C46B48B6d180393d27`).

### build_add_liquidity_v2

Build an unsigned V2 full-range liquidity add.

- `tokenA`, `tokenB` (required): the token pair
- `amountA`, `amountB` (required): desired amounts
- `slippageBps` (default 50): slippage tolerance
- `recipient` (required): address to receive LP tokens
- `deadlineMinutes` (default 20)
- `network`: `"mainnet"` | `"testnet"`

Simpler than V3 — no tick management. **Requires approval of BOTH tokens** for the V2 Router (`0x69cC349932ae18ED406eeB917d79b9b3033fB68E`).

## Workflows

### Token Swap (3 Steps)
1. **Quote:** `get_swap_quote` — find best route and expected output
2. **Approve:** `build_approve` — approve the router to spend `tokenIn`
   - V3: spender = `0x4e1d81A3E627b9294532e990109e4c21d217376C`
   - V2: spender = `0x69cC349932ae18ED406eeB917d79b9b3033fB68E`
3. **Swap:** `build_swap` — use the best fee tier from the quote

Always show the user: expected output amount, minimum output (after slippage), and which fee tier/version is being used.

### Add V3 Concentrated Liquidity (4 Steps)
1. **Analyze:** `get_pools` — check current tick, price, and liquidity concentration
2. **Choose range:** Help the user pick `tickLower` and `tickUpper` based on current tick and desired price range. Tighter ranges earn more fees but risk going out of range.
   - Ticks must be divisible by tickSpacing for the chosen fee tier
   - Current tick from `get_pools` is the center point
3. **Approve x2:** `build_approve` for both tokens → PositionManager (`0x2659C6085D26144117D904C46B48B6d180393d27`)
4. **Mint:** `build_add_liquidity_v3`

### Add V2 Liquidity (3 Steps)
1. **Check price:** `get_swap_quote` or `get_pools` to determine current price ratio
2. **Approve x2:** `build_approve` for both tokens → V2 Router (`0x69cC349932ae18ED406eeB917d79b9b3033fB68E`)
3. **Add:** `build_add_liquidity_v2`

## Slippage Guidance

| Pair type | Suggested slippage |
|-----------|--------------------|
| Stablecoin-stablecoin (USDC/USDT) | 10-20 bps (0.1-0.2%) |
| Major pairs (WETH/USDC) | 50 bps (0.5%) — the default |
| Volatile/thin pairs | 100-200 bps (1-2%) |

## Warnings

- **Always quote before swapping.** The quote tells you which fee tier is best and what output to expect.
- **Approval is required** before every swap or liquidity add. The tool output includes the router address — use it as the spender in `build_approve`.
- **Check balances first** (`get_balances` from wallet-manager) to verify the user has sufficient tokens.
- **V3 token ordering:** Token0 < token1 by address. The tools handle sorting internally, but tick ranges are relative to the token0/token1 order, not the user's input order.
- **V3 tick validation:** tickLower and tickUpper must be divisible by tickSpacing. The tool will error if they're not.

## Common Mistakes

- **Using a fee tier without quoting first.** Always call `get_swap_quote` before `build_swap` — it returns the best fee tier across all V3 tiers and V2. Hardcoding `3000` may route through a worse pool.
- **Invalid tick ranges for V3 LP.** `tickLower` and `tickUpper` must be divisible by the fee tier's tickSpacing (1 for 0.01%, 10 for 0.05%, 60 for 0.3%, 200 for 1%). Non-divisible ticks will revert on-chain. Use `get_pools` to get the current tick and calculate valid boundaries.
- **Approving the wrong router.** V3 swaps need approval for SwapRouter (`0x4e1d81A3E627b9294532e990109e4c21d217376C`), V3 LP needs PositionManager (`0x2659C6085D26144117D904C46B48B6d180393d27`), V2 uses V2 Router (`0x69cC349932ae18ED406eeB917d79b9b3033fB68E`). Mixing these up means the tx will revert with an allowance error.
- **Forgetting to approve BOTH tokens for LP.** Adding liquidity (V3 or V2) requires approving both `tokenA` and `tokenB`. Missing one will revert.

## Data Sources

SushiSwap tools interact directly with on-chain contracts via Katana RPC:

- **V3 QuoterV2** — simulates swaps across all fee tiers for accurate quotes with price impact
- **V3 Factory** — discovers pools for token pairs, checks pool existence and liquidity
- **V3 Pool contracts** — reads current price, tick, reserves, and tick concentration maps for LP analysis
- **V2 Factory / V2 Router** — full-range pool discovery and routing

These on-chain reads provide real-time DEX data. Use `get_pools` to check exit liquidity for any token pair (e.g. assessing whether a collateral token can be liquidated efficiently). Use `get_swap_quote` to get real slippage estimates for any trade size.

## Cross-References

- **wallet-manager**: `build_approve` for router approvals, `get_balances` to check sufficient funds
- **analytics**: `get_token_prices` to show USD values, `get_gas_price` for cost estimates
- **merkl**: `get_merkl_opportunities` with `protocol: "sushi-swap"` to check if a pool has reward incentives before adding LP
- **lending**: swap tools are used internally by Morpho leverage loops (Sushi provides the swap leg)
