# Katana Agent Skills

Agent skills for [Katana Network](https://katana.network) — a DeFi-focused L2 blockchain.

## Packages

| Package | Description |
|---------|-------------|
| [`katana-mcp`](./packages/katana-mcp) | MCP server — wallet, Sushi DEX, Morpho lending, analytics, Merkl rewards |

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

## Docs

Planning and reference docs are in [`docs/`](./docs/).
