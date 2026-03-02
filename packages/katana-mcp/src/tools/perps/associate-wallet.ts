import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  generateNonce,
  getDomain,
  nonceToUint128,
  WALLET_ASSOCIATION_TYPES,
  perpsAuthPost,
  requireAuth,
} from "./auth.js";
import type { NetworkName } from "../../config/contracts.js";

export function registerAssociatePerpsWallet(server: McpServer) {
  server.registerTool(
    "associate_perps_wallet",
    {
      description:
        "Associate a wallet with a Katana Perps API account. Required before accessing private data (orders, fills, positions). Returns EIP-712 typed data for signing. If walletSignature is provided with API credentials, submits directly. This is idempotent.",
      inputSchema: {
        wallet: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
          .describe("Wallet address to associate"),
        walletSignature: z
          .string()
          .optional()
          .describe("EIP-712 wallet signature. If provided with API credentials, the association is submitted directly."),
        network: z
          .enum(["mainnet", "testnet"])
          .default("mainnet")
          .describe("Katana mainnet or Bokuto testnet (sandbox)"),
      },
    },
    async ({ wallet, walletSignature, network }) => {
      try {
        const net = network as NetworkName;
        const nonce = generateNonce();
        const domain = getDomain(net);

        const parameters = { nonce, wallet };
        const value = {
          nonce: nonceToUint128(nonce),
          wallet,
        };

        if (walletSignature && requireAuth()) {
          const body = { parameters, signature: walletSignature };
          const result = await perpsAuthPost("/v1/wallets", body, net);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ submitted: true, result }, null, 2),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  submitted: false,
                  note: "Sign the EIP-712 typed data with your wallet, then re-call with walletSignature or submit via the SDK. This is required before accessing private endpoints.",
                  requestBody: { parameters, signature: "<wallet_signature>" },
                  eip712: { domain, types: WALLET_ASSOCIATION_TYPES, value },
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: (e as Error).message }) },
          ],
          isError: true,
        };
      }
    }
  );
}
