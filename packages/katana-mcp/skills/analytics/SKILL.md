---
name: analytics
description: Activate when the user asks about token prices, gas costs, transaction status, or general Katana Network chain data.
allowed-tools: get_token_prices, get_gas_price, tx_lookup
model: opus
license: MIT
metadata:
  author: katana
  version: '1.0.0'
---

# Analytics — Katana Network

Read-only tools for market data, gas estimation, and transaction debugging on Katana.

## Katana Chain Facts

- Mainnet chain ID: **747474** / Testnet (Bokuto): **737373**
- Gas token: ETH
- 1-second block times, EIP-1559 gas pricing
- Explorer: katanascan.io (mainnet), bokuto.katanascan.io (testnet)

## Known Tokens

KAT, WETH, WBTC, USDC, USDT, USDS, AUSD, LBTC, weETH, wstETH, MORPHO, SUSHI

Decimals: USDC/USDT = 6, WBTC/LBTC = 8, all others = 18.

## Tools

### get_token_prices

Get USD spot prices for Katana tokens derived from Sushi V3 pool data.

- `tokens` (optional): comma-separated symbols or addresses (e.g. `"WETH,KAT"`). Defaults to all 12 known tokens.
- `network`: `"mainnet"` (default) or `"testnet"`

Prices are read from Sushi V3 pool `slot0` (sqrtPriceX96), selecting the most liquid pool across fee tiers. Tokens without a direct stablecoin pool are routed through WETH. Stablecoins (USDC, USDT, USDS, AUSD) are assumed $1.

**Note:** These are on-chain spot prices, not aggregated oracle prices. Thin pools may show significant deviation from CEX prices. If a token returns "No liquidity found," it simply has no Sushi V3 pool — it does not mean the token is worthless.

### get_gas_price

Get current gas prices and cost estimates for common transaction types.

- `network`: `"mainnet"` (default) or `"testnet"`

Returns EIP-1559 base fee, estimated max fee, priority fee, and gas cost estimates for: ETH transfer, ERC20 transfer, approve, V3 swap, Morpho supply, Morpho borrow. Useful for quoting gas costs before building transactions.

### tx_lookup

Look up a transaction by hash. Returns status, block, from/to, value, gas used, cost in ETH, log count, and explorer link.

- `txHash` (required): `0x`-prefixed transaction hash
- `network`: `"mainnet"` (default) or `"testnet"`

Statuses: `success`, `reverted`, or `pending`. On Katana with 1-second blocks, pending is very brief.

## Common Uses

| User request | Action |
|---|---|
| "What's the price of KAT?" | `get_token_prices` with `tokens: "KAT"` |
| "How much will gas cost?" | `get_gas_price` — includes estimates per tx type |
| "Did my transaction go through?" | `tx_lookup` with the tx hash |
| Show USD values for a portfolio | `get_token_prices` then multiply by balances from `get_balances` |

## Cross-References

- All other skills can use `get_token_prices` to add USD context to balances, positions, and rewards.
- Use `get_gas_price` before building expensive transactions (leverage loops, multi-token operations).
- Use `tx_lookup` after the user sends any transaction to verify success.
