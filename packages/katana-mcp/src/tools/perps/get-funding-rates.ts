import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { perpsGet } from "./auth.js";
import type { NetworkName } from "../../config/contracts.js";

export function registerGetPerpsFundingRates(server: McpServer) {
  server.registerTool(
    "get_perps_funding_rates",
    {
      description:
        "Get historical funding rate data for a perpetual futures market. Funding payments occur every 8 hours at 00:00, 08:00, and 16:00 UTC.",
      inputSchema: {
        market: z.string().describe("Market symbol (e.g. 'ETH-USD')"),
        start: z.coerce.number().optional().describe("Earliest timestamp (Unix epoch ms), inclusive"),
        end: z.coerce.number().optional().describe("Latest timestamp (Unix epoch ms), inclusive"),
        limit: z.coerce.number().optional().describe("Max funding rates to return (1-1000, default 50)"),
        network: z
          .enum(["mainnet", "testnet"])
          .default("mainnet")
          .describe("Katana mainnet or Bokuto testnet (sandbox)"),
      },
    },
    async ({ market, start, end, limit, network }) => {
      try {
        const params: Record<string, string> = { market };
        if (start !== undefined) params.start = String(start);
        if (end !== undefined) params.end = String(end);
        if (limit !== undefined) params.limit = String(limit);
        const data = await perpsGet("/v1/fundingRates", params, network as NetworkName);
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
