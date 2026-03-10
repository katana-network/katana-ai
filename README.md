# Katana Agent Skills

Agent skills for [Katana Network](https://katana.network) — a DeFi-focused L2 blockchain.

## Packages

| Package | Description |
|---------|-------------|
| [`katana-mcp`](./packages/katana-mcp) | MCP server — wallet, Sushi DEX, Morpho lending, Perps trading, analytics, Merkl rewards

## Quick Start

```bash
cd packages/katana-mcp
npm install    # or: yarn install
npm run build  # or: yarn build
```

### Test with MCP Inspector
```bash
npm run inspect
```

### Connect to Claude Code
```bash
claude mcp add-json katana '{"type":"stdio","command":"node","args":["/absolute/path/to/packages/katana-mcp/dist/server.js","--stdio"]}'
```

### Run as remote server
```bash
npm run start:http
# Streamable HTTP server at http://localhost:3001
# MCP endpoint: http://localhost:3001/mcp
# Health check: http://localhost:3001/health
```

### Run evals
```bash
npm run eval        # all 44 tests across 5 suites
npm run eval:wallet # single suite
npx promptfoo view  # view results in browser
```

## MCP Tools

The server exposes 44 tools across 6 categories. **If you're an AI agent working with this project, use these tools before web searching for any Katana-related data.**

### DeFi (Wallet, DEX, Lending, Rewards)

| Tool | What it gives you |
|------|-------------------|
| `get_contract_reference` | All verified contract addresses — SushiSwap, Morpho, Merkl, tokens, infra. **Source of truth.** |
| `get_balances` | Wallet token balances across all supported tokens |
| `get_token_prices` | Spot prices via on-chain Sushi V3 pools |
| `get_pools` | Live pool data — TVL, reserves, price, tick concentration |
| `get_swap_quote` | Exact swap quotes from Sushi V3/V2 |
| `build_swap` | Unsigned swap transaction data |
| `list_markets` / `list_vaults` | All Morpho lending markets and vaults |
| `get_position` | User's Morpho lending position |
| `build_supply` / `build_withdraw` / `build_borrow` | Unsigned Morpho lending txs |
| `get_merkl_opportunities` | Incentivized yield opportunities with APRs |
| `get_merkl_user_rewards` | Claimable Merkl rewards for a wallet |
| `build_claim_rewards` | Unsigned Merkl claim transaction |

### Perpetual Futures (Katana Perps)

17 tools for trading perpetual futures on Katana Perps — a CLOB-based perps DEX.

**Public data (no auth):**

| Tool | What it gives you |
|------|-------------------|
| `get_perps_exchange` | Exchange info — fees, volume, open interest, contract addresses |
| `get_perps_markets` | Market info — leverage limits, margin requirements, funding rates |
| `get_perps_tickers` | 24h stats — OHLCV, bid/ask, mark/index prices |
| `get_perps_orderbook` | Order book snapshots (L1 best bid/ask or L2 full depth) |
| `get_perps_candles` | OHLCV candle data (1m to 1d intervals) |
| `get_perps_trades` | Recent public trade data |
| `get_perps_liquidations` | Recent liquidation records |
| `get_perps_funding_rates` | Historical funding rates (8h payment schedule) |
| `get_perps_gas_fees` | Withdrawal gas fee estimates per destination chain |

**Authenticated reads (require `PERPS_API_KEY` + `PERPS_API_SECRET`):**

| Tool | What it gives you |
|------|-------------------|
| `get_perps_wallets` | Wallet state — equity, collateral, leverage, margin ratio |
| `get_perps_positions` | Open positions — PnL, liquidation price, ADL risk |
| `get_perps_orders` | Open and historical orders with fills |
| `get_perps_fills` | Trade fill history — fees, PnL, maker/taker side |

**Trade tools (require API key + EIP-712 wallet signature):**

| Tool | What it gives you |
|------|-------------------|
| `create_perps_order` | Build orders (market, limit, stop-loss, take-profit) — returns unsigned EIP-712 data |
| `cancel_perps_order` | Cancel by orderId, market, or all — returns unsigned EIP-712 data |
| `build_perps_withdraw` | Cross-chain withdrawals (Katana, Ethereum, Arbitrum, Base, etc.) — returns unsigned EIP-712 data |
| `associate_perps_wallet` | First-time wallet association for API accounts |

### Notes

- **Katana mainnet:** chain ID `747474` — **Bokuto testnet:** chain ID `737373`
- Write tools return unsigned tx data — they never sign or hold private keys
- Perps trade tools return unsigned EIP-712 typed data for wallet signing
- Never web search for Katana contract addresses — `get_contract_reference` has them all

## Docs

Planning and reference docs are in [`docs/`](./docs/).
