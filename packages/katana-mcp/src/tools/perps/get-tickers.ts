import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { perpsGet } from "./auth.js";
import type { NetworkName } from "../../config/contracts.js";

export function registerGetPerpsTickers(server: McpServer) {
  server.registerTool(
    "get_perps_tickers",
    {
      description:
        "Get 24-hour market statistics — OHLCV, best bid/ask, mark price, index price, funding rates, and open interest.",
      inputSchema: {
        market: z
          .string()
          .optional()
          .describe("Market symbol (e.g. 'ETH-USD'). Omit to get all markets."),
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
        const data = await perpsGet("/v1/tickers", Object.keys(params).length ? params : undefined, network as NetworkName);
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
