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

// ─── Builder codes ───────────────────────────────────────────────────────────
// A builder code lets a perps product earn a configurable share of trading fees
// on the fills it generates. Per the Katana docs it is a 10-character string of
// the form "B:" + 8 alphanumeric chars, and it is attached to an order by
// prefixing the `clientOrderId` field. The remaining space (up to 30 bytes) is
// still free for the caller's own id, keeping the total within the 40-byte limit:
//
//   clientOrderId = "<10-char builder code>" + "<up to 30 bytes of client id>"
//
// Builder codes are obtained by contacting the Katana team (Discord ticket or
// kpsupport@katana.network); fee rates are configured and rewards claimed on the
// web builder rewards page. See https://api-docs-v1-perps.katana.network/#builder-codes
const BUILDER_CODE_RE = /^B:[A-Za-z0-9]{8}$/;
const CLIENT_ORDER_ID_MAX_BYTES = 40;

// Resolve the final clientOrderId, prefixing the builder code when supplied.
// Throws on a malformed builder code or an over-length result so callers get a
// clear validation error instead of a silently rejected order.
function resolveClientOrderId(
  builderCode: string | undefined,
  clientOrderId: string | undefined
): string | undefined {
  if (!builderCode) {
    return clientOrderId;
  }
  if (!BUILDER_CODE_RE.test(builderCode)) {
    throw new Error(
      `Invalid builder code "${builderCode}" — expected "B:" followed by 8 alphanumeric characters (e.g. "B:AbC12xY9").`
    );
  }
  // Strip any builder-code prefix the caller already added, then keep up to 30
  // bytes of their own id so each order's clientOrderId can stay distinct.
  const custom = (clientOrderId ?? "").replace(/^B:[A-Za-z0-9]{8}/, "").slice(0, 30);
  const combined = `${builderCode}${custom}`;
  if (Buffer.byteLength(combined, "utf8") > CLIENT_ORDER_ID_MAX_BYTES) {
    throw new Error(
      `clientOrderId "${combined}" exceeds the ${CLIENT_ORDER_ID_MAX_BYTES}-byte limit after prefixing the builder code.`
    );
  }
  return combined;
}

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
          .describe("Client-specified order ID (max 40 bytes). When a builderCode is also given, it is prefixed onto this value and only the first 30 bytes of your id are kept."),
        builderCode: z
          .string()
          .optional()
          .describe(
            "Optional builder code to attach so a perps product earns a fee share on this order's fills. Format: 'B:' + 8 alphanumeric chars (e.g. 'B:AbC12xY9'). It is prefixed onto clientOrderId. Obtain a code from the Katana team (Discord/kpsupport@katana.network); set your maker/taker fee rates on the web builder rewards page (recommended: 0.01% maker / 0.02% taker; min 0%, max 5% including exchange fees). See https://api-docs-v1-perps.katana.network/#builder-codes"
          ),
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
      builderCode,
      walletSignature,
      network,
    }) => {
      try {
        const net = network as NetworkName;
        const nonce = generateNonce();

        // Resolve the builder-code-aware clientOrderId once so the signed
        // EIP-712 payload and the submitted request body stay identical.
        const finalClientOrderId = resolveClientOrderId(builderCode, clientOrderId);

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
        if (finalClientOrderId) parameters.clientOrderId = finalClientOrderId;

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
          clientOrderId: finalClientOrderId,
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
                  ...(builderCode && {
                    builderCode,
                    builderCodeNote: `Builder code attached via clientOrderId "${finalClientOrderId}". This order's fills earn your configured builder fee (set rates on the web builder rewards page).`,
                  }),
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
