import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { perpsAuthGet } from "./auth.js";
import type { NetworkName } from "../../config/contracts.js";

export function registerGetPerpsOrders(server: McpServer) {
  server.registerTool(
    "get_perps_orders",
    {
      description:
        "Get open or historical orders for a wallet on Katana Perps. Returns order details including status, type, side, quantities, prices, and associated fills. Requires PERPS_API_KEY and PERPS_API_SECRET env vars.",
      inputSchema: {
        wallet: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
          .describe("Wallet address"),
        orderId: z
          .string()
          .optional()
          .describe("Specific order ID to retrieve. Prefix client IDs with 'client:'"),
        market: z
          .string()
          .optional()
          .describe("Filter by market symbol (e.g. 'ETH-USD'). Only applies if orderId is absent."),
        closed: z
          .boolean()
          .default(false)
          .describe("false = active/open orders, true = filled/closed orders with at least one fill"),
        limit: z
          .coerce.number()
          .optional()
          .describe("Max orders to return (1-1000, default 50)"),
        network: z
          .enum(["mainnet", "testnet"])
          .default("mainnet")
          .describe("Katana mainnet or Bokuto testnet (sandbox)"),
      },
    },
    async ({ wallet, orderId, market, closed, limit, network }) => {
      try {
        const params: Record<string, string> = { wallet };
        if (orderId) params.orderId = orderId;
        if (market) params.market = market;
        if (closed) params.closed = "true";
        if (limit !== undefined) params.limit = String(limit);
        const data = await perpsAuthGet("/v1/orders", params, network as NetworkName);
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
