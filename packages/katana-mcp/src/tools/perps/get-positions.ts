import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { perpsAuthGet } from "./auth.js";
import type { NetworkName } from "../../config/contracts.js";

export function registerGetPerpsPositions(server: McpServer) {
  server.registerTool(
    "get_perps_positions",
    {
      description:
        "Get open positions for a wallet on Katana Perps — quantity, entry/exit/liquidation prices, PnL, leverage, ADL risk quintile, and funding totals. Requires PERPS_API_KEY and PERPS_API_SECRET env vars.",
      inputSchema: {
        wallet: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
          .describe("Wallet address"),
        market: z
          .string()
          .optional()
          .describe("Filter by market symbol (e.g. 'ETH-USD'). Omit for all positions."),
        network: z
          .enum(["mainnet", "testnet"])
          .default("mainnet")
          .describe("Katana mainnet or Bokuto testnet (sandbox)"),
      },
    },
    async ({ wallet, market, network }) => {
      try {
        const params: Record<string, string> = { wallet };
        if (market) params.market = market;
        const data = await perpsAuthGet("/v1/positions", params, network as NetworkName);
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
