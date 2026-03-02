import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { zeroAddress, encodeAbiParameters, parseAbiParameters } from "viem";
import {
  generateNonce,
  getDomain,
  nonceToUint128,
  WITHDRAWAL_TYPES,
  LZ_ENDPOINT_IDS,
  perpsAuthPost,
  requireAuth,
} from "./auth.js";
import { PERPS_API, type NetworkName } from "../../config/contracts.js";

// Stargate bridge adapter address on Katana (from Get Exchange response)
const STARGATE_BRIDGE_ADAPTER_KATANA =
  "0xC15BCdd62CE58E0399F4c2D90136EDAA8b5652FC";

export function registerBuildPerpsWithdraw(server: McpServer) {
  server.registerTool(
    "build_perps_withdraw",
    {
      description:
        "Build a withdrawal request from Katana Perps. Supports withdrawals to Katana (no bridge) or cross-chain via Stargate v2 (Ethereum, Arbitrum, Base, Optimism, Avalanche, Berachain, Scroll). Returns EIP-712 typed data for signing. Gas fees are deducted from the withdrawn amount.",
      inputSchema: {
        wallet: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
          .describe("Wallet address"),
        quantity: z
          .string()
          .describe("Withdrawal quantity in vbUSDC (8 decimal string, e.g. '1000.00000000')"),
        maximumGasFee: z
          .string()
          .describe(
            "Maximum gas fee authorized for the withdrawal in vbUSDC. Use get_perps_gas_fees to get current estimates."
          ),
        destinationChain: z
          .enum([
            "katana",
            "ethereum",
            "arbitrum",
            "base",
            "optimism",
            "avalanche",
            "berachain",
            "scroll",
          ])
          .default("katana")
          .describe("Destination chain for withdrawal (default: katana)"),
        walletSignature: z
          .string()
          .optional()
          .describe("EIP-712 wallet signature. If provided with API credentials, the withdrawal is submitted directly."),
        network: z
          .enum(["mainnet", "testnet"])
          .default("mainnet")
          .describe("Katana mainnet or Bokuto testnet (sandbox)"),
      },
    },
    async ({ wallet, quantity, maximumGasFee, destinationChain, walletSignature, network }) => {
      try {
        const net = network as NetworkName;
        const nonce = generateNonce();
        const domain = getDomain(net);

        let bridgeAdapterAddress: string;
        let bridgeAdapterPayload: string;

        if (destinationChain === "katana") {
          bridgeAdapterAddress = zeroAddress;
          bridgeAdapterPayload = "0x";
        } else {
          bridgeAdapterAddress = STARGATE_BRIDGE_ADAPTER_KATANA;
          const endpointId = LZ_ENDPOINT_IDS[destinationChain];
          if (!endpointId) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: `Unsupported destination chain: ${destinationChain}. Supported: ${Object.keys(LZ_ENDPOINT_IDS).join(", ")}`,
                  }),
                },
              ],
              isError: true,
            };
          }
          bridgeAdapterPayload = encodeAbiParameters(
            parseAbiParameters("uint32"),
            [endpointId]
          );
        }

        const parameters: Record<string, unknown> = {
          nonce,
          wallet,
          quantity,
          maximumGasFee,
          bridgeAdapterAddress,
          bridgeAdapterPayload,
        };

        const value = {
          nonce: nonceToUint128(nonce),
          wallet,
          quantity,
          maximumGasFee,
          bridgeAdapter: bridgeAdapterAddress,
          bridgeAdapterPayload,
        };

        if (walletSignature && requireAuth()) {
          const body = { parameters, signature: walletSignature };
          const result = await perpsAuthPost("/v1/withdrawals", body, net);
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
                  note: `Withdrawal to ${destinationChain}. Sign the EIP-712 typed data with your wallet, then re-call with walletSignature or submit via the SDK.`,
                  requestBody: { parameters, signature: "<wallet_signature>" },
                  eip712: { domain, types: WITHDRAWAL_TYPES, value },
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
