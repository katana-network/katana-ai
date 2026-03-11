# Katana MCP Server

An MCP server for Katana Network users that provides agent skills for DeFi operations across Sushi DEX, Morpho lending, Katana Perps, analytics, and Merkl reward campaigns.

## What is Katana
- **DeFi-focused L2 blockchain** built on Agglayer's CDK OP Stack with ZK proofs
- **Chain ID:** 747474 (mainnet) / 737373 (Bokuto testnet)
- **Gas Token:** ETH
- **Core Protocols:** Sushi (DEX) + Morpho (lending) + Katana Perps (perpetual futures) + Merkl (reward distribution)
- **Unique Features:** Vault Bridge (yield-generating bridge wrappers), Chain-Owned Liquidity, AUSD stablecoin
- **Block Time:** 1 second, EIP-1559 gas pricing

## Tech Stack
- **TypeScript** — package-manager agnostic (npm, yarn, or bun)
- **viem** — all blockchain interactions
- **@modelcontextprotocol/sdk** — MCP server framework
- **Merkl API** (https://api.merkl.xyz/v4) — reward campaign data
- **Katana Perps API** — CLOB-based perpetual futures exchange
- **Dual transport:** stdio (local Claude Code) + Streamable HTTP (external users)

## Design Principles
- **Read tools return data** (balances, quotes, positions, prices, rewards)
- **Write tools return unsigned tx data** (never sign, never hold keys)
- **Perps trade tools return unsigned EIP-712 typed data** for wallet signing
- **Dual transport** — stdio for local Claude Code, Streamable HTTP for external users
- **Dual network** — every tool accepts `network: "mainnet" | "testnet"`
- **Skills for reasoning** — SKILL.md teaches the agent when/why to use each tool
- **ABIs as TypeScript files** — const arrays with `as const`

## MCP Tools (44 total)

### DeFi (26 tools)

| # | Tool | Type | Category |
|---|------|------|----------|
| 1 | `get_balances` | Read | Wallet |
| 2 | `build_wrap_eth` | Write | Wallet |
| 3 | `build_unwrap_eth` | Write | Wallet |
| 4 | `build_transfer` | Write | Wallet |
| 5 | `build_approve` | Write | Wallet |
| 6 | `get_swap_quote` | Read | Sushi |
| 7 | `build_swap` | Write | Sushi |
| 8 | `get_pools` | Read | Sushi (reserves + tick concentration) |
| 9 | `build_add_liquidity_v3` | Write | Sushi |
| 10 | `build_add_liquidity_v2` | Write | Sushi |
| 11 | `list_morpho_markets` | Read | Morpho (event-based discovery) |
| 12 | `list_morpho_vaults` | Read | Morpho (event-based discovery) |
| 13 | `get_morpho_markets` | Read | Morpho |
| 14 | `get_morpho_position` | Read | Morpho |
| 15 | `analyze_loop_strategy` | Read | Morpho (loop simulation) |
| 16 | `build_morpho_supply` | Write | Morpho |
| 17 | `build_morpho_withdraw` | Write | Morpho |
| 18 | `build_morpho_borrow` | Write | Morpho |
| 19 | `build_morpho_authorize` | Write | Morpho (Bundler3 authorization) |
| 20 | `build_morpho_loop` | Write | Morpho (atomic flashloan leverage) |
| 21 | `get_token_prices` | Read | Analytics |
| 22 | `get_gas_price` | Read | Analytics |
| 23 | `tx_lookup` | Read | Analytics |
| 24 | `get_contract_reference` | Read | Analytics |
| 25 | `get_merkl_opportunities` | Read | Merkl (reward APRs) |
| 26 | `get_merkl_user_rewards` | Read | Merkl (unclaimed rewards) |
| 27 | `build_claim_rewards` | Write | Merkl (claim tx builder) |

### Perpetual Futures (17 tools)

| # | Tool | Type | Category |
|---|------|------|----------|
| 28 | `get_perps_exchange` | Read | Perps (public) |
| 29 | `get_perps_markets` | Read | Perps (public) |
| 30 | `get_perps_tickers` | Read | Perps (public) |
| 31 | `get_perps_orderbook` | Read | Perps (public) |
| 32 | `get_perps_candles` | Read | Perps (public) |
| 33 | `get_perps_trades` | Read | Perps (public) |
| 34 | `get_perps_liquidations` | Read | Perps (public) |
| 35 | `get_perps_funding_rates` | Read | Perps (public) |
| 36 | `get_perps_gas_fees` | Read | Perps (public) |
| 37 | `get_perps_wallets` | Read | Perps (authenticated) |
| 38 | `get_perps_positions` | Read | Perps (authenticated) |
| 39 | `get_perps_orders` | Read | Perps (authenticated) |
| 40 | `get_perps_fills` | Read | Perps (authenticated) |
| 41 | `create_perps_order` | Write | Perps (trade) |
| 42 | `cancel_perps_order` | Write | Perps (trade) |
| 43 | `build_perps_withdraw` | Write | Perps (trade) |
| 44 | `associate_perps_wallet` | Write | Perps (setup) |

## Environment Variables

| Variable | Required | Used by |
|----------|----------|---------|
| `PERPS_API_KEY` | For perps authenticated/trade tools | Katana Perps API |
| `PERPS_API_SECRET` | For perps authenticated/trade tools | Katana Perps API |

DeFi tools (wallet, Sushi, Morpho, Merkl, analytics) require no API keys — they read directly from on-chain RPC.

## Agent Skills

Skills are markdown guides (`SKILL.md`) that teach AI agents **when and how** to use the MCP tools. They live alongside the tools but serve a different purpose:

- **MCP tools** = what the server can do (structured inputs → structured outputs)
- **Skills** = how an agent should reason about using those tools (workflows, safety rules, common mistakes)

Each skill has a frontmatter header declaring its name, description, allowed tools, and activation trigger. When an agent framework loads the skills, it uses the `description` field to decide which skill to activate based on the user's request.

### Skill structure

```
skills/
├── wallet-manager/SKILL.md   # Balances, transfers, approvals, wrap/unwrap
├── dex/SKILL.md               # Swaps, quotes, pool analysis, LP provision
├── lending/SKILL.md           # Morpho markets, vaults, leverage loops
├── merkl/SKILL.md             # Reward discovery, claiming, yield optimization
├── analytics/SKILL.md         # Prices, gas, tx lookup, contract reference
└── perps/SKILL.md             # Perpetual futures trading, positions, orders
```

### How skills are registered

The `.claude-plugin/plugin.json` file declares which skills are available and points to the MCP server config:

```json
{
  "skills": ["./skills/wallet-manager", "./skills/dex", ...],
  "mcpServers": ["./.mcp.json"]
}
```

### What a SKILL.md contains

- **Frontmatter** — name, description (activation trigger), allowed tools list
- **Protocol overview** — key concepts the agent needs to understand
- **Tool reference** — parameters, return values, and usage notes per tool
- **Workflows** — step-by-step sequences for common tasks (e.g., "Swap tokens: quote → approve → swap")
- **Safety guidelines** — health factor thresholds, slippage guidance, approval targets
- **Common mistakes** — pitfalls that cause tool calls to fail (wrong IDs, missing approvals, bad precision)
- **Cross-references** — which other skills to use together

## Project Structure

```
katana-ai/
├── docs/
│   ├── PLAN.md                          # This file
│   └── CONTRACTS.md                     # All Katana contract addresses
├── packages/
│   └── katana-mcp/
│       ├── package.json
│       ├── tsconfig.json
│       ├── CLAUDE.md
│       ├── .mcp.json
│       ├── .claude-plugin/plugin.json   # Skill + MCP server registration
│       ├── skills/                      # SKILL.md files for agent reasoning
│       ├── evals/                       # Promptfoo test suites (44 tests)
│       ├── src/
│       │   ├── server.ts                # MCP server entry (stdio + Streamable HTTP)
│       │   ├── clients.ts               # viem public client factory
│       │   ├── config/
│       │   │   ├── chains.ts            # katana (747474) + bokuto (737373)
│       │   │   └── contracts.ts         # All addresses + token lists
│       │   ├── abis/                    # Contract ABI files
│       │   └── tools/
│       │       ├── wallet/              # 5 tools
│       │       ├── sushi/               # 5 tools
│       │       ├── morpho/              # 10 tools
│       │       ├── analytics/           # 4 tools
│       │       ├── merkl/               # 3 tools
│       │       └── perps/               # 17 tools
│       └── dist/                        # compiled output (gitignored)
├── package.json                         # Root workspace
└── README.md
```
