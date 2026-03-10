import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { perpsGet } from "./auth.js";
import type { NetworkName } from "../../config/contracts.js";

export function registerGetPerpsOrderbook(server: McpServer) {
  server.registerTool(
    "get_perps_orderbook",
    {
      description:
        "Get order book snapshot for a perpetual futures market. Level 1 returns best bid/ask. Level 2 returns all price levels up to the limit. Price levels are [price, quantity, numOrders].",
      inputSchema: {
        market: z.string().describe("Market symbol (e.g. 'ETH-USD')"),
        level: z
          .coerce.number()
          .default(1)
          .describe("Order book level: 1 (best bid/ask only) or 2 (all price levels). Default: 1"),
        limit: z
          .coerce.number()
          .optional()
          .describe("Number of price levels per side for level 2 (max 500, 0 returns all). Only applies to level 2."),
        network: z
          .enum(["mainnet", "testnet"])
          .default("mainnet")
          .describe("Katana mainnet or Bokuto testnet (sandbox)"),
      },
    },
    async ({ market, level, limit, network }) => {
      try {
        const params: Record<string, string> = { market };
        if (level) params.level = String(level);
        if (limit !== undefined) params.limit = String(limit);
        const data = await perpsGet("/v1/orderbook", params, network as NetworkName);
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
