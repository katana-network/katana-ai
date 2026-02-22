import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatUnits, zeroAddress, type Address } from "viem";
import { getClient } from "../../clients.js";
import {
  SUSHI_CONTRACTS,
  MAINNET_TOKENS,
  getTokens,
  type NetworkName,
} from "../../config/contracts.js";
import {
  sushiV3FactoryAbi,
  sushiV3PoolAbi,
} from "../../abis/sushi-v3-factory.js";
import { resolveToken, V3_FEE_TIERS } from "../sushi/utils.js";

// ─── Price from sqrtPriceX96 ─────────────────────────────────────────────────

function priceFromSqrt(
  sqrtPriceX96: bigint,
  decimals0: number,
  decimals1: number
): number {
  const price = Number(sqrtPriceX96) / 2 ** 96;
  return price * price * 10 ** (decimals0 - decimals1);
}

// ─── Find best pool and get spot price ───────────────────────────────────────

interface PoolPrice {
  pool: Address;
  fee: number;
  price: number; // tokenA per tokenB
  liquidity: string;
}

async function getBestPoolPrice(
  client: ReturnType<typeof getClient>,
  factory: Address,
  tokenA: Address,
  tokenB: Address,
  decimalsA: number,
  decimalsB: number
): Promise<PoolPrice | null> {
  const results = await Promise.allSettled(
    V3_FEE_TIERS.map(async (fee) => {
      const poolAddr = await client.readContract({
        address: factory,
        abi: sushiV3FactoryAbi,
        functionName: "getPool",
        args: [tokenA, tokenB, fee],
      });

      if (poolAddr === zeroAddress) return null;

      const [slot0, liquidity, token0] = await Promise.all([
        client.readContract({
          address: poolAddr,
          abi: sushiV3PoolAbi,
          functionName: "slot0",
        }),
        client.readContract({
          address: poolAddr,
          abi: sushiV3PoolAbi,
          functionName: "liquidity",
        }),
        client.readContract({
          address: poolAddr,
          abi: sushiV3PoolAbi,
          functionName: "token0",
        }),
      ]);

      const sqrtPriceX96 = slot0[0];
      if (sqrtPriceX96 === 0n) return null;

      const isAToken0 = token0.toLowerCase() === tokenA.toLowerCase();
      const d0 = isAToken0 ? decimalsA : decimalsB;
      const d1 = isAToken0 ? decimalsB : decimalsA;

      // price = token1 per token0
      const rawPrice = priceFromSqrt(sqrtPriceX96, d0, d1);
      // We want: how much tokenB (quote) per 1 tokenA
      // If tokenA is token0, price = token1/token0 = tokenB/tokenA (what we want)
      // If tokenA is token1, price = token0/token1 = tokenB/tokenA... no, it's inverse
      const price = isAToken0 ? rawPrice : 1 / rawPrice;

      return {
        pool: poolAddr,
        fee,
        price,
        liquidity: liquidity.toString(),
      };
    })
  );

  // Pick the pool with highest liquidity
  const valid: PoolPrice[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value !== null) {
      valid.push(r.value);
    }
  }

  if (valid.length === 0) return null;

  valid.sort((a, b) => (BigInt(b.liquidity) > BigInt(a.liquidity) ? 1 : -1));
  return valid[0];
}

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
