import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { perpsGet } from "./auth.js";
import type { NetworkName } from "../../config/contracts.js";

export function registerGetPerpsExchange(server: McpServer) {
  server.registerTool(
    "get_perps_exchange",
    {
      description:
        "Get Katana Perps exchange info — default fees, total volume, open interest, contract addresses, and bridge adapters.",
      inputSchema: {
        network: z
          .enum(["mainnet", "testnet"])
          .default("mainnet")
          .describe("Katana mainnet or Bokuto testnet (sandbox)"),
      },
    },
    async ({ network }) => {
      try {
        const data = await perpsGet("/v1/exchange", undefined, network as NetworkName);
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
