import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetQuote } from "./get-quote.js";
import { registerBuildSwap } from "./build-swap.js";
import { registerGetPools } from "./get-pools.js";
import { registerLiquidity } from "./liquidity.js";

export function registerSushiTools(server: McpServer) {
  registerGetQuote(server);      // get_swap_quote
  registerBuildSwap(server);     // build_swap
  registerGetPools(server);      // get_pools
  registerLiquidity(server);     // build_add_liquidity_v3, build_add_liquidity_v2
}
