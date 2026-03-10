import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { zeroAddress } from "viem";
import {
  generateNonce,
  getDomain,
  nonceToUint128,
  CANCEL_BY_WALLET_TYPES,
  CANCEL_BY_ORDER_ID_TYPES,
  CANCEL_BY_MARKET_TYPES,
  perpsAuthDelete,
  requireAuth,
} from "./auth.js";
import type { NetworkName } from "../../config/contracts.js";

export function registerCancelPerpsOrder(server: McpServer) {
  server.registerTool(
    "cancel_perps_order",
    {
      description:
        "Build a cancel order request for Katana Perps. Cancel specific orders by ID, all orders for a market, or all orders for a wallet. Returns EIP-712 typed data for wallet signing. If walletSignature is provided with API credentials, submits directly.",
      inputSchema: {
        wallet: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
          .describe("Wallet address"),
        orderIds: z
          .string()
          .optional()
          .describe(
            "Comma-separated order IDs to cancel (max 100). Prefix client IDs with 'client:'. Mutually exclusive with market."
          ),
        market: z
          .string()
          .optional()
          .describe("Cancel all open orders for this market. Mutually exclusive with orderIds."),
        walletSignature: z
          .string()
          .optional()
          .describe("EIP-712 wallet signature. If provided with API credentials, the cancel is submitted directly."),
        network: z
          .enum(["mainnet", "testnet"])
          .default("mainnet")
          .describe("Katana mainnet or Bokuto testnet (sandbox)"),
      },
    },
    async ({ wallet, orderIds, market, walletSignature, network }) => {
      try {
        const net = network as NetworkName;
        const nonce = generateNonce();
        const domain = getDomain(net);

        const parameters: Record<string, unknown> = { nonce, wallet };

        let types: object;
        let value: object;

        if (orderIds) {
          const ids = orderIds.split(",").map((id) => id.trim());
          parameters.orderIds = ids;
          types = CANCEL_BY_ORDER_ID_TYPES;
          value = {
            nonce: nonceToUint128(nonce),
            wallet,
            delegatedKey: zeroAddress,
            orderIds: ids,
          };
        } else if (market) {
          parameters.market = market;
          types = CANCEL_BY_MARKET_TYPES;
          value = {
            nonce: nonceToUint128(nonce),
            wallet,
            delegatedKey: zeroAddress,
            marketSymbol: market,
          };
        } else {
          // Cancel all for wallet
          types = CANCEL_BY_WALLET_TYPES;
          value = {
            nonce: nonceToUint128(nonce),
            wallet,
            delegatedKey: zeroAddress,
          };
        }

        if (walletSignature && requireAuth()) {
          const body = { parameters, signature: walletSignature };
          const result = await perpsAuthDelete("/v1/orders", body, net);
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
                  note: "Sign the EIP-712 typed data with your wallet, then re-call with walletSignature parameter or submit via the SDK.",
                  requestBody: { parameters, signature: "<wallet_signature>" },
                  eip712: { domain, types, value },
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
