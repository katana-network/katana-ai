import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatUnits, type Address, zeroAddress } from "viem";
import { getClient } from "../../clients.js";
import { SUSHI_CONTRACTS, type NetworkName } from "../../config/contracts.js";
import {
  sushiV3FactoryAbi,
  sushiV3PoolAbi,
} from "../../abis/sushi-v3-factory.js";
import { sushiV3TickLensAbi } from "../../abis/sushi-v3-ticklens.js";
import { erc20Abi } from "../../abis/erc20.js";
import { resolveToken, knownTokenList, V3_FEE_TIERS } from "./utils.js";

// ─── Tick math helpers ───────────────────────────────────────────────────────

function tickToPrice(
  tick: number,
  decimals0: number,
  decimals1: number
): number {
  return 1.0001 ** tick * 10 ** (decimals0 - decimals1);
}

// ─── Tick concentration scan ─────────────────────────────────────────────────

interface PopulatedTick {
  tick: number;
  liquidityNet: bigint;
  liquidityGross: bigint;
}

async function getTickConcentration(
  client: ReturnType<typeof getClient>,
  tickLens: Address,
  poolAddress: Address,
  currentTick: number,
  tickSpacing: number,
  wordsToScan: number
): Promise<PopulatedTick[]> {
  // Word index for the current tick
  const compressed = Math.floor(currentTick / tickSpacing);
  const currentWordIdx = compressed >> 8; // floor(compressed / 256)

  // Scan words around the current position
  const wordIndices: number[] = [];
  for (let i = -wordsToScan; i <= wordsToScan; i++) {
    wordIndices.push(currentWordIdx + i);
  }

  const results = await Promise.allSettled(
    wordIndices.map((wordIdx) =>
      client.readContract({
        address: tickLens,
        abi: sushiV3TickLensAbi,
        functionName: "getPopulatedTicksInWord",
        args: [poolAddress, wordIdx],
      })
    )
  );

  const allTicks: PopulatedTick[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.length > 0) {
      for (const t of r.value) {
        allTicks.push({
          tick: Number(t.tick),
          liquidityNet: t.liquidityNet,
          liquidityGross: t.liquidityGross,
        });
      }
    }
  }

  // Sort by tick ascending
  allTicks.sort((a, b) => a.tick - b.tick);
  return allTicks;
}

// ─── Build liquidity ranges from populated ticks ─────────────────────────────

interface LiquidityRange {
  tickLower: number;
  tickUpper: number;
  priceLower: number;
  priceUpper: number;
  liquidity: string;
  active: boolean;
}

function buildLiquidityRanges(
  ticks: PopulatedTick[],
  currentTick: number,
  decimals0: number,
  decimals1: number
): LiquidityRange[] {
  if (ticks.length < 2) return [];

  const ranges: LiquidityRange[] = [];
  let runningLiquidity = 0n;

  for (let i = 0; i < ticks.length - 1; i++) {
    runningLiquidity += ticks[i].liquidityNet;

    // Skip empty ranges
    if (runningLiquidity <= 0n) continue;

    const tickLower = ticks[i].tick;
    const tickUpper = ticks[i + 1].tick;

    // Price from tick: token1 per token0
    const priceLower = tickToPrice(tickLower, decimals0, decimals1);
    const priceUpper = tickToPrice(tickUpper, decimals0, decimals1);

    ranges.push({
      tickLower,
      tickUpper,
      priceLower,
      priceUpper,
      liquidity: runningLiquidity.toString(),
      active: currentTick >= tickLower && currentTick < tickUpper,
    });
  }

  return ranges;
}

// ─── Tool ────────────────────────────────────────────────────────────────────

const inputSchema = {
  tokenA: z
    .string()
    .describe("First token — symbol (e.g. 'WETH') or contract address"),
  tokenB: z
    .string()
    .describe("Second token — symbol (e.g. 'USDC') or contract address"),
  tickDepth: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe(
      "Number of tick bitmap words to scan on each side of the current tick (1-20, default 5). Higher = wider view but more RPC calls."
    ),
  network: z
    .enum(["mainnet", "testnet"])
    .default("mainnet")
    .describe("Katana mainnet or Bokuto testnet"),
};

export function registerGetPools(server: McpServer) {
  server.registerTool(
    "get_pools",
    {
      description:
        "Deep analysis of SushiSwap V3 pools for a token pair on Katana. For each fee tier pool found, returns: current price, token reserves (balances of both tokens in the pool), TVL, active liquidity, and tick concentration map showing where liquidity is distributed across price ranges. Use tickDepth to control how wide the tick scan is.",
      inputSchema,
    },
    async ({ tokenA, tokenB, tickDepth, network }) => {
      const net = network as NetworkName;
      const client = getClient(net);
      const sushi = SUSHI_CONTRACTS.mainnet;

      const tA = await resolveToken(net, tokenA);
      const tB = await resolveToken(net, tokenB);

      if (!tA) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Cannot resolve token "${tokenA}". Known: ${knownTokenList(net)}`,
              }),
            },
          ],
          isError: true,
        };
      }
      if (!tB) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Cannot resolve token "${tokenB}". Known: ${knownTokenList(net)}`,
              }),
            },
          ],
          isError: true,
        };
      }

      // Check all fee tiers for pools
      const poolResults = await Promise.allSettled(
        V3_FEE_TIERS.map(async (fee) => {
          const poolAddress = await client.readContract({
            address: sushi.v3Factory,
            abi: sushiV3FactoryAbi,
            functionName: "getPool",
            args: [tA.address, tB.address, fee],
          });

          if (poolAddress === zeroAddress) return null;

          // Read pool state + token balances in parallel
          const [slot0, liquidity, token0, tickSpacing, balance0, balance1] =
            await Promise.all([
              client.readContract({
                address: poolAddress,
                abi: sushiV3PoolAbi,
                functionName: "slot0",
              }),
              client.readContract({
                address: poolAddress,
                abi: sushiV3PoolAbi,
                functionName: "liquidity",
              }),
              client.readContract({
                address: poolAddress,
                abi: sushiV3PoolAbi,
                functionName: "token0",
              }),
              client.readContract({
                address: poolAddress,
                abi: sushiV3PoolAbi,
                functionName: "tickSpacing",
              }),
              client.readContract({
                address: tA.address,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [poolAddress],
              }),
              client.readContract({
                address: tB.address,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [poolAddress],
              }),
            ]);

          const sqrtPriceX96 = slot0[0];
          const currentTick = Number(slot0[1]);
          const spacing = Number(tickSpacing);

          // Determine token order
          const isAToken0 =
            token0.toLowerCase() === tA.address.toLowerCase();
          const decimals0 = isAToken0 ? tA.decimals : tB.decimals;
          const decimals1 = isAToken0 ? tB.decimals : tA.decimals;
          const symbol0 = isAToken0 ? tA.symbol : tB.symbol;
          const symbol1 = isAToken0 ? tB.symbol : tA.symbol;

          // Reserves in correct order (balanceA, balanceB regardless of token0/1)
          const reserveA = formatUnits(balance0 as bigint, tA.decimals);
          const reserveB = formatUnits(balance1 as bigint, tB.decimals);

          // Price: token1 per token0
          const price = Number(sqrtPriceX96) / 2 ** 96;
          const adjustedPrice =
            price * price * 10 ** (decimals0 - decimals1);

          // ── Tick concentration via TickLens ──
          let tickConcentration: LiquidityRange[] = [];
          try {
            const populatedTicks = await getTickConcentration(
              client,
              sushi.v3TickLens,
              poolAddress,
              currentTick,
              spacing,
              tickDepth
            );

            tickConcentration = buildLiquidityRanges(
              populatedTicks,
              currentTick,
              decimals0,
              decimals1
            );
          } catch {
            // TickLens may not be available — return pool data without ticks
          }

          // Format tick ranges for output
          const tickMap = tickConcentration.map((range) => ({
            tickRange: `[${range.tickLower}, ${range.tickUpper})`,
            priceRange: {
              [`${symbol1}/${symbol0}`]: `${range.priceLower.toPrecision(6)} — ${range.priceUpper.toPrecision(6)}`,
              [`${symbol0}/${symbol1}`]: `${(1 / range.priceUpper).toPrecision(6)} — ${(1 / range.priceLower).toPrecision(6)}`,
            },
            liquidity: range.liquidity,
            active: range.active,
          }));

          const activeRange = tickConcentration.find((r) => r.active);

          return {
            poolAddress,
            fee,
            feePercent: `${fee / 10000}%`,
            token0: symbol0,
            token1: symbol1,
            currentTick,
            tickSpacing: spacing,
            sqrtPriceX96: sqrtPriceX96.toString(),
            price: {
              [`${symbol1}/${symbol0}`]: adjustedPrice,
              [`${symbol0}/${symbol1}`]: 1 / adjustedPrice,
            },
            reserves: {
              [tA.symbol]: reserveA,
              [tB.symbol]: reserveB,
            },
            activeLiquidity: liquidity.toString(),
            activeTickRange: activeRange
              ? {
                  tickLower: activeRange.tickLower,
                  tickUpper: activeRange.tickUpper,
                  priceLower: activeRange.priceLower,
                  priceUpper: activeRange.priceUpper,
                }
              : null,
            tickConcentration: {
              rangesFound: tickMap.length,
              ranges: tickMap,
            },
          };
        })
      );

      const pools = poolResults
        .map((r) => (r.status === "fulfilled" ? r.value : null))
        .filter(Boolean);

      const response = {
        network,
        tokenA: { symbol: tA.symbol, address: tA.address },
        tokenB: { symbol: tB.symbol, address: tB.address },
        poolsFound: pools.length,
        pools,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }
  );
}
