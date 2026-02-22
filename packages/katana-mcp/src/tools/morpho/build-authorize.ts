import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData, type Address } from "viem";
import { getClient } from "../../clients.js";
import { MORPHO_CONTRACTS, type NetworkName } from "../../config/contracts.js";
import { morphoAbi } from "../../abis/morpho.js";

const inputSchema = {
  userAddress: z
    .string()
    .describe("Wallet address to check/set authorization for"),
  network: z
    .enum(["mainnet", "testnet"])
    .default("mainnet")
    .describe("Katana mainnet or Bokuto testnet"),
};

export function registerBuildAuthorize(server: McpServer) {
  server.registerTool(
    "build_morpho_authorize",
    {
      description:
        "Check and build the one-time authorization tx for Morpho's GeneralAdapter1. Required before using build_morpho_loop (atomic leverage). Returns an unsigned setAuthorization tx if not yet authorized, or confirms already authorized.",
      inputSchema,
    },
    async ({ userAddress, network }) => {
      const net = network as NetworkName;
      const client = getClient(net);
      const morpho = MORPHO_CONTRACTS.mainnet.morpho;
      const adapter = MORPHO_CONTRACTS.mainnet.generalAdapter1;
      const user = userAddress as Address;

      // Check if already authorized
      const isAuthorized = await client.readContract({
        address: morpho,
        abi: morphoAbi,
        functionName: "isAuthorized",
        args: [user, adapter],
      });

      if (isAuthorized) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  status: "already_authorized",
                  message:
                    "GeneralAdapter1 is already authorized on Morpho for this address. You can proceed with build_morpho_loop.",
                  morpho,
                  adapter,
                  userAddress,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Build unsigned setAuthorization tx
      const data = encodeFunctionData({
        abi: morphoAbi,
        functionName: "setAuthorization",
        args: [adapter, true],
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                status: "authorization_required",
                message:
                  "GeneralAdapter1 must be authorized on Morpho before using atomic loops. Sign and submit this transaction first.",
                transaction: {
                  to: morpho,
                  data,
                  value: "0",
                  description: `Authorize GeneralAdapter1 (${adapter}) on Morpho`,
                },
                morpho,
                adapter,
                userAddress,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
