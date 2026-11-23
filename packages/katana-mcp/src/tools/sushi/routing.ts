// Katana Swap tools quote and swap through a single pool (V3 exactInputSingle or
// a direct V2 pair). The Katana app routes swaps through Everlong, whose routes
// are computed offchain by the Everlong Swap API, which needs an API key. This
// server has no key; users who want routed swaps must request their own.

export const EVERLONG_API_GUIDE = "https://router.foreverlong.io/swap-api/guide";
export const EVERLONG_API_KEY_URL =
  "https://router.foreverlong.io/swap-api/guide#id-1.-obtain-an-api-key";

export const ROUTING_NOTE = {
  scope:
    "Single-pool quote on Katana Swap (built on Sushi): one V3 pool or a direct V2 pair, no multi-hop routing.",
  routedSwaps: `The Katana app routes swaps through Everlong (multi-hop routes computed offchain), which can give a better price on large or indirect trades. Routed swaps need an Everlong Swap API key, which this server does not provide; the user must request their own (${EVERLONG_API_KEY_URL}). Guide: ${EVERLONG_API_GUIDE}`,
} as const;

export const NO_DIRECT_POOL_NOTE = `No direct Katana Swap pool returned a quote for this pair. Try swapping through an intermediate token (e.g. via WETH or USDC) as two swaps, or use routed swaps through the Everlong Swap API, which requires the user's own API key (${EVERLONG_API_KEY_URL}).`;
