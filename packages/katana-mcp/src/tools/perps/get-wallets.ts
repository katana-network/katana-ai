import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { perpsAuthGet } from "./auth.js";
import type { NetworkName } from "../../config/contracts.js";

export function registerGetPerpsWallets(server: McpServer) {
  server.registerTool(
    "get_perps_wallets",
    {
      description:
        "Get Katana Perps wallet info — equity, free/held/available collateral, leverage, margin ratio, quote balance, unrealized PnL, fee rates, and optionally positions. Requires PERPS_API_KEY and PERPS_API_SECRET env vars.",
      inputSchema: {
        wallet: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
          .describe("Wallet address"),
        includePositions: z
          .boolean()
          .default(true)
          .describe("Include position data in the response (default: true)"),
        network: z
          .enum(["mainnet", "testnet"])
          .default("mainnet")
          .describe("Katana mainnet or Bokuto testnet (sandbox)"),
      },
    },
    async ({ wallet, includePositions, network }) => {
      try {
        const params: Record<string, string> = {
          wallet,
          includePositions: String(includePositions),
        };
        const data = await perpsAuthGet("/v1/wallets", params, network as NetworkName);
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
