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

### Environment Variables

| Variable | Required | Used by |
|----------|----------|---------|
| `PERPS_API_KEY` | For perps authenticated/trade tools | Katana Perps API |
| `PERPS_API_SECRET` | For perps authenticated/trade tools | Katana Perps API |

DeFi tools (wallet, Sushi, Morpho, Merkl, analytics) require no API keys — they read directly from on-chain RPC.

### Notes

- **Katana mainnet:** chain ID `747474` — **Bokuto testnet:** chain ID `737373`
- Write tools return unsigned tx data — they never sign or hold private keys
- Perps trade tools return unsigned EIP-712 typed data for wallet signing
- Never web search for Katana contract addresses — `get_contract_reference` has them all

## Agent Skills

Skills are markdown guides (`SKILL.md`) that teach AI agents **when and how** to use the MCP tools. While MCP tools define what the server can do, skills define how an agent should reason about using them — workflows, safety rules, and common mistakes.

Each skill has a frontmatter header with a `description` field that tells the agent when to activate it. For example, the `dex` skill activates when a user asks about swaps, quotes, or liquidity.

| Skill | Activates when |
|-------|---------------|
| `wallet-manager` | Balances, transfers, approvals, wrap/unwrap ETH |
| `dex` | Token swaps, quotes, pool analysis, LP provision on SushiSwap |
| `lending` | Morpho markets, vaults, positions, leverage loops |
| `merkl` | Reward discovery, yield farming, claiming Merkl rewards |
| `analytics` | Token prices, gas costs, tx lookup, contract reference |
| `perps` | Perpetual futures — market data, orders, positions, withdrawals |

Skills are registered in [`.claude-plugin/plugin.json`](./packages/katana-mcp/.claude-plugin/plugin.json) and live in `packages/katana-mcp/skills/`.

## Docs

Planning and reference docs are in [`docs/`](./docs/).

## Disclaimer

Katana Agent Skills is an informational tool only. It and its outputs are provided on an "as is" and "as available" basis, without representation or warranty of any kind. It does not constitute investment, financial, trading, or any other form of advice, and does not represent a recommendation to buy, sell, or hold any digital assets. The accuracy, timeliness, or completeness of any data or analysis presented is not guaranteed. Your use of this tool and any information it provides is at your own risk — you are solely responsible for evaluating the information and for all decisions made based on it. AI-generated information or summaries should not be solely relied on for decision making and may include errors, biases, or outdated information. Digital asset prices are subject to high market risk and price volatility; the value of your investment may go down or up, and you may not get back the amount invested. You should carefully consider your investment experience, financial situation, investment objectives, and risk tolerance, and consult an independent financial adviser prior to making any investment. This tool is not responsible for any losses or damages incurred as a result of your use of or reliance on it.
