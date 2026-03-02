import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { perpsGet } from "./auth.js";
import type { NetworkName } from "../../config/contracts.js";

export function registerGetPerpsCandles(server: McpServer) {
  server.registerTool(
    "get_perps_candles",
    {
      description:
        "Get OHLCV candle data for a perpetual futures market. Returns open, high, low, close, volume, and trade count per interval.",
      inputSchema: {
        market: z.string().describe("Market symbol (e.g. 'ETH-USD')"),
        interval: z
          .enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d"])
          .describe("Candle interval: 1m, 5m, 15m, 30m, 1h, 4h, or 1d"),
        start: z
          .coerce.number()
          .optional()
          .describe("Earliest timestamp (Unix epoch ms), inclusive"),
        end: z
          .coerce.number()
          .optional()
          .describe("Latest timestamp (Unix epoch ms), inclusive"),
        limit: z
          .coerce.number()
          .optional()
          .describe("Max candles to return (1-1000, default 50)"),
        network: z
          .enum(["mainnet", "testnet"])
          .default("mainnet")
          .describe("Katana mainnet or Bokuto testnet (sandbox)"),
      },
    },
    async ({ market, interval, start, end, limit, network }) => {
      try {
        const params: Record<string, string> = { market, interval };
        if (start !== undefined) params.start = String(start);
        if (end !== undefined) params.end = String(end);
        if (limit !== undefined) params.limit = String(limit);
        const data = await perpsGet("/v1/candles", params, network as NetworkName);
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
