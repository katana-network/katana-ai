import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { perpsGet } from "./auth.js";
import type { NetworkName } from "../../config/contracts.js";

export function registerGetPerpsGasFees(server: McpServer) {
  server.registerTool(
    "get_perps_gas_fees",
    {
      description:
        "Get current withdrawal gas fee estimates for all supported destination chains. Fees are in vbUSDC and deducted from the withdrawal amount.",
      inputSchema: {
        network: z
          .enum(["mainnet", "testnet"])
          .default("mainnet")
          .describe("Katana mainnet or Bokuto testnet (sandbox)"),
      },
    },
    async ({ network }) => {
      try {
        const data = await perpsGet("/v1/gasFees", undefined, network as NetworkName);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: (e as Error).message }) }],
          isError: true,
        };
      }
    }
  );
}
