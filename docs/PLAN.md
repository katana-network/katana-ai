# Katana MCP Server

An MCP server for Katana Network users that provides agent skills for DeFi operations across Sushi DEX, Morpho lending, analytics, and Merkl reward campaigns.

## What is Katana
- **DeFi-focused L2 blockchain** built on Agglayer's CDK OP Stack with ZK proofs
- **Chain ID:** 747474 (mainnet) / 737373 (Bokuto testnet)
- **Gas Token:** ETH
- **Core Protocols:** Sushi (DEX) + Morpho (lending) + Merkl (reward distribution)
- **Unique Features:** Vault Bridge (yield-generating bridge wrappers), Chain-Owned Liquidity, AUSD stablecoin
- **Block Time:** 1 second, EIP-1559 gas pricing

## Tech Stack
- **TypeScript** — package-manager agnostic (npm, yarn, or bun)
- **viem** — all blockchain interactions
- **@modelcontextprotocol/sdk** — MCP server framework
- **Merkl API** (https://api.merkl.xyz/v4) — reward campaign data
- **Dual transport:** stdio (local Claude Code) + Streamable HTTP (external users)

## Design Principles
- **Read tools return data** (balances, quotes, positions, prices, rewards)
- **Write tools return unsigned tx data** (never sign, never hold keys)
- **Dual transport** — stdio for local Claude Code, Streamable HTTP for external users
- **Dual network** — every tool accepts `network: "mainnet" | "testnet"`
- **Skills for reasoning** — SKILL.md teaches the agent when/why to use each tool
- **ABIs as TypeScript files** — const arrays with `as const`

## MCP Tools (26 total)

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
| 24 | `get_merkl_opportunities` | Read | Merkl (reward APRs) |
| 25 | `get_merkl_user_rewards` | Read | Merkl (unclaimed rewards) |
| 26 | `build_claim_rewards` | Write | Merkl (claim tx builder) |

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
│       ├── .claude-plugin/plugin.json
│       ├── skills/                      # SKILL.md files for agent reasoning
│       ├── evals/                       # Promptfoo test suites (44 tests)
│       ├── src/
│       │   ├── server.ts                # MCP server entry (stdio + Streamable HTTP)
│       │   ├── clients.ts               # viem public client factory
│       │   ├── config/
│       │   │   ├── chains.ts            # katana (747474) + bokuto (737373)
│       │   │   └── contracts.ts         # All addresses + token lists
│       │   ├── abis/                    # 12 contract ABI files
│       │   └── tools/
│       │       ├── wallet/              # 5 tools
│       │       ├── sushi/               # 5 tools
│       │       ├── morpho/              # 10 tools
│       │       ├── analytics/           # 3 tools
│       │       └── merkl/               # 3 tools
│       └── dist/                        # compiled output (gitignored)
├── package.json                         # Root workspace
└── README.md
```
