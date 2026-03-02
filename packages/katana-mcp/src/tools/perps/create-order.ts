import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  generateNonce,
  getDomain,
  buildOrderTypedData,
  ORDER_TYPES,
  perpsAuthPost,
  requireAuth,
} from "./auth.js";
import type { NetworkName } from "../../config/contracts.js";

export function registerCreatePerpsOrder(server: McpServer) {
  server.registerTool(
    "create_perps_order",
    {
      description:
        "Build and optionally submit a Katana Perps order. Returns the EIP-712 typed data for wallet signing and the API request body. If PERPS_API_KEY and PERPS_API_SECRET are set, you can pass a walletSignature to submit directly. Supports market, limit, stop-loss, and take-profit orders.",
      inputSchema: {
        wallet: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
          .describe("Wallet address placing the order"),
        market: z.string().describe("Market symbol (e.g. 'ETH-USD')"),
        type: z
          .enum([
            "market",
            "limit",
            "stopLossMarket",
            "stopLossLimit",
            "takeProfitMarket",
            "takeProfitLimit",
          ])
          .describe("Order type"),
        side: z.enum(["buy", "sell"]).describe("Order side"),
        quantity: z
          .string()
          .describe("Order quantity in base terms (8 decimal string, e.g. '10.00000000')"),
        price: z
          .string()
          .optional()
          .describe("Limit price in quote terms (required for limit orders, omit for market orders)"),
        triggerPrice: z
          .string()
          .optional()
          .describe("Stop/take-profit trigger price (required for stop and take profit orders)"),
        triggerType: z
          .enum(["last", "index"])
          .optional()
          .describe("Price type for trigger: 'last' (last fill) or 'index' (index price). Required if triggerPrice is set."),
        reduceOnly: z
          .boolean()
          .default(false)
          .describe("Only reduce an existing position, never increase (default: false)"),
        timeInForce: z
          .enum(["gtc", "gtx", "ioc", "fok"])
          .default("gtc")
          .describe("Time in force: gtc (good-til-canceled), gtx (post-only), ioc (immediate-or-cancel), fok (fill-or-kill)"),
        selfTradePrevention: z
          .enum(["dc", "co", "cn", "cb"])
          .default("dc")
          .describe("Self-trade prevention: dc (decrement-cancel), co (cancel-oldest), cn (cancel-newest), cb (cancel-both)"),
        clientOrderId: z
          .string()
          .optional()
          .describe("Client-specified order ID (max 40 bytes)"),
        walletSignature: z
          .string()
          .optional()
          .describe("EIP-712 wallet signature. If provided along with API credentials, the order is submitted directly."),
        network: z
          .enum(["mainnet", "testnet"])
          .default("mainnet")
          .describe("Katana mainnet or Bokuto testnet (sandbox)"),
      },
    },
    async ({
      wallet,
      market,
      type,
      side,
      quantity,
      price,
      triggerPrice,
      triggerType,
      reduceOnly,
      timeInForce,
      selfTradePrevention,
      clientOrderId,
      walletSignature,
      network,
    }) => {
      try {
        const net = network as NetworkName;
        const nonce = generateNonce();

        // Build request parameters
        const parameters: Record<string, unknown> = {
          nonce,
          wallet,
          market,
          type,
          side,
          quantity,
        };
        if (price) parameters.price = price;
        if (triggerPrice) parameters.triggerPrice = triggerPrice;
        if (triggerType) parameters.triggerType = triggerType;
        if (reduceOnly) parameters.reduceOnly = true;
        if (timeInForce !== "gtc") parameters.timeInForce = timeInForce;
        if (selfTradePrevention !== "dc")
          parameters.selfTradePrevention = selfTradePrevention;
        if (clientOrderId) parameters.clientOrderId = clientOrderId;

        // Build EIP-712 typed data
        const domain = getDomain(net);
        const typedDataValue = buildOrderTypedData({
          nonce,
          wallet,
          market,
          type,
          side,
          quantity,
          price,
          triggerPrice,
          triggerType,
          reduceOnly,
          timeInForce,
          selfTradePrevention,
          clientOrderId,
        });

        // If wallet signature provided AND we have API credentials, submit
        if (walletSignature && requireAuth()) {
          const body = { parameters, signature: walletSignature };
          const result = await perpsAuthPost("/v1/orders", body, net);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ submitted: true, result }, null, 2),
              },
            ],
          };
        }

        // Otherwise return the typed data for signing
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  submitted: false,
                  note: "Sign the EIP-712 typed data with your wallet, then re-call with walletSignature parameter or submit via the SDK.",
                  requestBody: { parameters, signature: "<wallet_signature>" },
                  eip712: {
                    domain,
                    types: ORDER_TYPES,
                    value: typedDataValue,
                  },
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
