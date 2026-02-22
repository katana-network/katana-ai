import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerListMarkets } from "./list-markets.js";
import { registerListVaults } from "./list-vaults.js";
import { registerGetMarkets } from "./get-markets.js";
import { registerGetPosition } from "./get-position.js";
import { registerBuildSupply } from "./build-supply.js";
import { registerBuildWithdraw } from "./build-withdraw.js";
import { registerBuildBorrow } from "./build-borrow.js";
import { registerAnalyzeLoop } from "./analyze-loop.js";
import { registerBuildAuthorize } from "./build-authorize.js";
import { registerBuildLoop } from "./build-loop.js";

export function registerMorphoTools(server: McpServer) {
  // Discovery tools (no market ID needed)
  registerListMarkets(server);    // list_morpho_markets
  registerListVaults(server);     // list_morpho_vaults

  // Detail tools (require market ID)
  registerGetMarkets(server);     // get_morpho_markets
  registerGetPosition(server);    // get_morpho_position

  // Strategy analysis
  registerAnalyzeLoop(server);    // analyze_loop_strategy

  // Transaction builders
  registerBuildSupply(server);    // build_morpho_supply
  registerBuildWithdraw(server);  // build_morpho_withdraw
  registerBuildBorrow(server);    // build_morpho_borrow

  // Atomic loop (flashloan leverage)
  registerBuildAuthorize(server); // build_morpho_authorize
  registerBuildLoop(server);      // build_morpho_loop
}
