import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type Address } from "viem";
import { getClient } from "../../clients.js";
import {
  SUSHI_CONTRACTS,
  MAINNET_TOKENS,
  getTokens,
  type NetworkName,
} from "../../config/contracts.js";
import { resolveToken } from "../sushi/utils.js";
import { getBestPoolPrice } from "./price-utils.js";

// ─── Tool ────────────────────────────────────────────────────────────────────

const inputSchema = {
  tokens: z
    .string()
    .optional()
    .describe(
      "Comma-separated token symbols or addresses (e.g. 'WETH,WBTC,KAT'). Defaults to all known tokens."
    ),
  network: z
    .enum(["mainnet", "testnet"])
    .default("mainnet")
    .describe("Katana mainnet or Bokuto testnet"),
};

export function registerGetTokenPrices(server: McpServer) {
  server.registerTool(
    "get_token_prices",
    {
      description:
        "Get current spot prices for Katana tokens using Sushi V3 pool data. Prices are quoted in USD (via USDC/USDT pools). Tokens without direct stablecoin pools are priced through WETH. Returns price, source pool, and liquidity for each token.",
      inputSchema,
    },
    async ({ tokens, network }) => {
      const net = network as NetworkName;
      const client = getClient(net);
      const factory = SUSHI_CONTRACTS.mainnet.v3Factory;
      const knownTokens = getTokens(net);

      // Determine which tokens to price
      const tokenList = tokens
        ? tokens.split(",").map((t) => t.trim())
        : Object.keys(knownTokens);

      // Stablecoin addresses for USD pricing
      const stables = [
        { symbol: "USDC", address: MAINNET_TOKENS.USDC?.address as Address, decimals: 6 },
        { symbol: "USDT", address: MAINNET_TOKENS.USDT?.address as Address, decimals: 6 },
      ].filter((s) => s.address);

      const weth = MAINNET_TOKENS.WETH;

      // First get ETH/USD price for routing
      let ethUsdPrice: number | null = null;
      for (const stable of stables) {
        const poolPrice = await getBestPoolPrice(
          client,
          factory,
          weth.address as Address,
          stable.address,
          weth.decimals,
          stable.decimals
        );
        if (poolPrice) {
          ethUsdPrice = poolPrice.price;
          break;
        }
      }

      // Price each token
      const priceResults = await Promise.allSettled(
        tokenList.map(async (tokenInput) => {
          const token = await resolveToken(net, tokenInput);
          if (!token) return { symbol: tokenInput, error: "Unknown token" };

          // Stablecoins = $1
          if (["USDC", "USDT", "USDS", "AUSD"].includes(token.symbol)) {
            return {
              symbol: token.symbol,
              address: token.address,
              priceUSD: 1.0,
              source: "stablecoin",
            };
          }

          // Try direct stablecoin pool first
          for (const stable of stables) {
            if (token.address.toLowerCase() === stable.address.toLowerCase()) continue;

            const poolPrice = await getBestPoolPrice(
              client,
              factory,
              token.address,
              stable.address,
              token.decimals,
              stable.decimals
            );

            if (poolPrice) {
              return {
                symbol: token.symbol,
                address: token.address,
                priceUSD: poolPrice.price,
                source: `${token.symbol}/${stable.symbol} V3 pool (${poolPrice.fee / 10000}%)`,
                poolAddress: poolPrice.pool,
                liquidity: poolPrice.liquidity,
              };
            }
          }

          // Route through WETH
          if (
            ethUsdPrice &&
            token.address.toLowerCase() !== weth.address.toLowerCase()
          ) {
            const poolPrice = await getBestPoolPrice(
              client,
              factory,
              token.address,
              weth.address as Address,
              token.decimals,
              weth.decimals
            );

            if (poolPrice) {
              return {
                symbol: token.symbol,
                address: token.address,
                priceUSD: poolPrice.price * ethUsdPrice,
                priceETH: poolPrice.price,
                source: `${token.symbol}/WETH V3 pool (${poolPrice.fee / 10000}%) -> ETH/USD`,
                poolAddress: poolPrice.pool,
                liquidity: poolPrice.liquidity,
              };
            }
          }

          // WETH itself
          if (
            token.address.toLowerCase() === weth.address.toLowerCase() &&
            ethUsdPrice
          ) {
            return {
              symbol: token.symbol,
              address: token.address,
              priceUSD: ethUsdPrice,
              source: "WETH/USDC V3 pool",
            };
          }

          return {
            symbol: token.symbol,
            address: token.address,
            error: "No liquidity found for pricing",
          };
        })
      );

      const prices = priceResults.map((r, i) =>
        r.status === "fulfilled"
          ? r.value
          : { symbol: tokenList[i], error: (r.reason as Error).message }
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                network,
                ethUsdPrice: ethUsdPrice ?? "unavailable",
                tokens: prices,
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
