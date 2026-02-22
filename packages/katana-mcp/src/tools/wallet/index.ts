import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetBalances } from "./get-balances.js";
import { registerWrapEth } from "./wrap-eth.js";
import { registerTransfer } from "./transfer.js";
import { registerApprove } from "./approve.js";

export function registerWalletTools(server: McpServer) {
  registerGetBalances(server);
  registerWrapEth(server); // registers both build_wrap_eth and build_unwrap_eth
  registerTransfer(server);
  registerApprove(server);
}
