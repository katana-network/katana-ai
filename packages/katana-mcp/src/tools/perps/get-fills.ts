import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { perpsAuthGet } from "./auth.js";
import type { NetworkName } from "../../config/contracts.js";

export function registerGetPerpsFills(server: McpServer) {
  server.registerTool(
    "get_perps_fills",
    {
      description:
        "Get trade fill history for a wallet on Katana Perps — includes price, quantity, fees, PnL, liquidity side (maker/taker), action (open/close), and settlement tx status. Requires PERPS_API_KEY and PERPS_API_SECRET env vars.",
      inputSchema: {
        wallet: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
          .describe("Wallet address"),
        market: z
          .string()
          .optional()
          .describe("Filter by market symbol (e.g. 'ETH-USD')"),
        orderId: z
          .string()
          .optional()
          .describe("Filter by order ID. Prefix client IDs with 'client:'"),
        limit: z
          .coerce.number()
          .optional()
          .describe("Max fills to return (1-1000, default 50)"),
        network: z
          .enum(["mainnet", "testnet"])
          .default("mainnet")
          .describe("Katana mainnet or Bokuto testnet (sandbox)"),
      },
    },
    async ({ wallet, market, orderId, limit, network }) => {
      try {
        const params: Record<string, string> = { wallet };
        if (market) params.market = market;
        if (orderId) params.orderId = orderId;
        if (limit !== undefined) params.limit = String(limit);
        const data = await perpsAuthGet("/v1/fills", params, network as NetworkName);
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
