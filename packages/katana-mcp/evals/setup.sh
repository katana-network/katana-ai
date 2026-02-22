#!/usr/bin/env bash
# evals/setup.sh — Bootstrap eval data from live Katana chain
#
# Discovers a real Morpho market ID and a real tx hash, then patches
# the YAML suite files to replace placeholders.
#
# Usage: cd packages/katana-mcp && bash evals/setup.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SUITES_DIR="$SCRIPT_DIR/suites"
PKG_DIR="$(dirname "$SCRIPT_DIR")"

echo "==> Building server..."
cd "$PKG_DIR"
npm run build --silent 2>/dev/null || yarn build --silent 2>/dev/null

echo "==> Discovering Morpho market ID via RPC..."
# Call list_morpho_markets through the MCP server and extract first market ID
MARKET_ID=$(node -e "
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
// We can't easily call the MCP server inline, so just use viem directly
const { createPublicClient, http, parseAbiItem } = require('viem');

const client = createPublicClient({
  transport: http('https://rpc.katana.network/'),
});

const morpho = '0xD50F2DffFd62f94Ee4AEd9ca05C61d0753268aBc';

(async () => {
  const logs = await client.getLogs({
    address: morpho,
    event: parseAbiItem('event CreateMarket(bytes32 indexed id, (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams)'),
    fromBlock: 0n,
    toBlock: 'latest',
  });
  if (logs.length > 0) {
    console.log(logs[0].args.id);
  } else {
    console.error('No markets found');
    process.exit(1);
  }
})();
" 2>/dev/null) || true

if [[ -z "$MARKET_ID" || "$MARKET_ID" == "undefined" ]]; then
  echo "  Could not auto-discover market ID. Trying alternative approach..."
  # Alternative: run the compiled server tool directly
  MARKET_ID=$(echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_morpho_markets","arguments":{"network":"mainnet"}},"id":1}' | \
    timeout 120 node dist/server.js 2>/dev/null | \
    node -e "
      let data = '';
      process.stdin.on('data', c => data += c);
      process.stdin.on('end', () => {
        try {
          // MCP stdio has header + JSON lines
          const lines = data.split('\n').filter(l => l.startsWith('{'));
          for (const line of lines) {
            const msg = JSON.parse(line);
            if (msg.result && msg.result.content) {
              const inner = JSON.parse(msg.result.content[0].text);
              if (inner.markets && inner.markets.length > 0) {
                console.log(inner.markets[0].id);
                return;
              }
            }
          }
        } catch(e) {}
        process.exit(1);
      });
    " 2>/dev/null) || true
fi

if [[ -n "$MARKET_ID" && "$MARKET_ID" != "undefined" ]]; then
  echo "  Market ID: $MARKET_ID"
  sed -i.bak "s/REPLACE_WITH_REAL_MARKET_ID/$MARKET_ID/g" "$SUITES_DIR/morpho.yaml"
  rm -f "$SUITES_DIR/morpho.yaml.bak"
  echo "  Patched morpho.yaml"
else
  echo "  WARNING: Could not discover market ID. You must manually replace"
  echo "  REPLACE_WITH_REAL_MARKET_ID in evals/suites/morpho.yaml"
fi

echo ""
echo "==> Discovering a real tx hash from recent blocks..."
TX_HASH=$(node -e "
const { createPublicClient, http } = require('viem');
const client = createPublicClient({ transport: http('https://rpc.katana.network/') });
(async () => {
  const block = await client.getBlock({ blockTag: 'latest' });
  // Walk back up to 100 blocks to find one with transactions
  for (let i = 0; i < 100; i++) {
    const b = await client.getBlock({ blockNumber: block.number - BigInt(i) });
    if (b.transactions.length > 0) {
      console.log(b.transactions[0]);
      return;
    }
  }
  process.exit(1);
})();
" 2>/dev/null) || true

if [[ -n "$TX_HASH" && "$TX_HASH" != "undefined" ]]; then
  echo "  Tx hash: $TX_HASH"
  sed -i.bak "s/REPLACE_WITH_REAL_TX_HASH/$TX_HASH/g" "$SUITES_DIR/analytics.yaml"
  rm -f "$SUITES_DIR/analytics.yaml.bak"
  echo "  Patched analytics.yaml"
else
  echo "  WARNING: Could not find a real tx hash. You must manually replace"
  echo "  REPLACE_WITH_REAL_TX_HASH in evals/suites/analytics.yaml"
fi

echo ""
echo "==> Setup complete!"
echo ""
echo "Run evals with:"
echo "  yarn eval              # all suites"
echo "  yarn eval:wallet       # wallet only"
echo "  yarn eval:view         # view results in browser"
