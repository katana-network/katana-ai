import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { perpsGet } from "./auth.js";
import type { NetworkName } from "../../config/contracts.js";

export function registerGetPerpsMarkets(server: McpServer) {
  server.registerTool(
    "get_perps_markets",
    {
      description:
        "Get perpetual futures market info — leverage, margin requirements, fees, index prices, funding rates, volume, and open interest. Returns all markets or a specific market.",
      inputSchema: {
        market: z
          .string()
          .optional()
          .describe("Market symbol (e.g. 'ETH-USD', 'BTC-USD'). Omit to get all markets."),
        network: z
          .enum(["mainnet", "testnet"])
          .default("mainnet")
          .describe("Katana mainnet or Bokuto testnet (sandbox)"),
      },
    },
    async ({ market, network }) => {
      try {
        const params: Record<string, string> = {};
        if (market) params.market = market;
        const data = await perpsGet("/v1/markets", Object.keys(params).length ? params : undefined, network as NetworkName);
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
