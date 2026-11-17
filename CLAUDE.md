# Katana AI — MCP Server Monorepo

## Katana MCP Tools — USE THESE FIRST

This project has a `katana-remote` MCP server connected with tools for Katana Network (DeFi L2, chain ID 747474) — wallet, Katana Swap, Morpho, Merkl, KAT staking, Katana Perps and analytics. **Before web searching for ANY Katana-related data, load and use the MCP tools.**

### Key tools to know:

| Tool | What it gives you |
|------|-------------------|
| `get_contract_reference` | All verified contract addresses — Katana Swap (Sushi), Morpho, Merkl, KAT, tokens, infra. **This is the source of truth.** |
| `get_balances` | Wallet token balances across all supported tokens |
| `get_token_prices` | Spot prices via on-chain Sushi V3 pools |
| `get_pools` | Live pool data — TVL, reserves, price, tick concentration |
| `get_swap_quote` | Exact swap quotes from Sushi V3/V2 |
| `list_markets` / `list_vaults` | All Morpho lending markets and vaults |
| `get_merkl_opportunities` | Incentivized yield opportunities with APRs |
| `get_merkl_user_rewards` | Claimable Merkl rewards for a wallet |

### Rules:
- **Never web search for Katana contract addresses** — `get_contract_reference` has them all
- **Never web search for Katana token addresses** — the tools resolve symbols automatically
- **All tools accept a `network` param** — use `"mainnet"` (default) or `"testnet"`, the tools handle chain config automatically
- Write tools return unsigned tx data — they never sign or hold private keys

## Network Details

- **Katana mainnet:** chain ID 747474
- **Bokuto testnet:** chain ID 737373
- **WETH on Katana** is a yield-generating vbToken (Vault Bridge ETH) that implements the WETH9 interface
- Core protocols: **Sushi** (DEX/AMM) + **Morpho** (lending) + **Merkl** (rewards)

## Repo Structure

```
katana-ai/
├── packages/katana-mcp/     # The MCP server (TypeScript, viem, MCP SDK)
│   ├── src/server.ts        # Entry point (stdio + Streamable HTTP)
│   ├── src/config/          # chains.ts, contracts.ts (all addresses)
│   ├── src/tools/           # wallet/, sushi/, morpho/, analytics/, merkl/
│   ├── src/abis/            # Contract ABIs
│   └── skills/              # 5 SKILL.md agent skill guides
├── docs/                    # Planning docs (PLAN.md, CONTRACTS.md)
└── README.md
```

## Development

Works with npm, yarn, or bun:

```bash
yarn install && yarn build       # build the server
yarn start:stdio                 # local/Claude Code transport
yarn start:http                  # Streamable HTTP on :3001
yarn eval                        # run all eval suites
```

## Commits & Pull Requests

Releases are automated: merging to `main` runs semantic-release, which reads each commit message to pick the version and tag, and the tag builds the `katana-mcp` Docker image. So every commit message **and** every PR title must follow [Conventional Commits](https://www.conventionalcommits.org/):

- Start with a type: `feat`, `fix`, `perf`, `revert`, `docs`, `chore`, `build`, `ci`, `refactor`, `style`, `test` (optional scope, e.g. `fix(morpho): …`)
- The subject after the colon must **not** start with an uppercase letter — `feat: add …`, not `feat: Add …` (CI's `validate-pr-title` enforces this)
- `feat` → minor release, `fix` / `perf` / `revert` → patch release; the other types don't release
