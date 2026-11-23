# Katana MCP Server

This is an MCP (Model Context Protocol) server for Katana Network. Katana is an onchain financial markets company that operates a Layer 2 blockchain.

## Key Facts
- Katana mainnet Chain ID: 747474
- Bokuto testnet Chain ID: 737373
- Gas token: ETH
- Core apps: Katana Swap (DEX, built on Sushi), Katana Perps, Vault Bridge; lending through Katana's partner Morpho
- WETH on Katana is a yield-generating vbToken (Vault Bridge ETH) that implements the WETH9 interface

## Architecture
- TypeScript MCP server using `@modelcontextprotocol/sdk` and `viem`
- Dual transport: stdio (local) + Streamable HTTP (remote, multi-session)
- Read tools return on-chain data; write tools return **unsigned transaction data** (never sign, never hold private keys)
- Every tool accepts a `network` parameter: `"mainnet"` or `"testnet"`

## Project Structure
- `src/server.ts` — MCP server entry point
- `src/config/chains.ts` — viem chain definitions
- `src/config/contracts.ts` — all contract addresses
- `src/clients.ts` — viem public client factory
- `src/abis/` — contract ABIs as JSON
- `src/tools/wallet/` — balance, wrap, transfer, approve tools
- `src/tools/sushi/` — DEX swap, quote, pool, liquidity tools
- `src/tools/morpho/` — lending supply, withdraw, borrow, position tools
- `src/tools/analytics/` — price feeds, gas estimation, tx lookup

## Development

Works with npm, yarn, or bun — pick whichever you prefer:

```bash
# Install dependencies
npm install        # or: yarn install / bun install

# Build
npm run build      # or: yarn build / bun run build

# Run
npm run start:stdio   # local/Claude Code
npm run start:http    # remote/external users (Streamable HTTP on :3001)
npm run inspect       # MCP inspector for testing
```
