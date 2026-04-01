// Shared swap quote helpers — used by analyze-loop.ts and build-loop.ts
import type { Address } from "viem";
import { getClient } from "../../clients.js";
import { MAINNET_TOKENS, SUSHI_CONTRACTS } from "../../config/contracts.js";
import { sushiV3QuoterAbi } from "../../abis/sushi-v3-quoter.js";
import { sushiV2RouterAbi } from "../../abis/sushi-v2-router.js";
import { V3_FEE_TIERS, encodeV3Path } from "../sushi/utils.js";

// Common intermediary tokens for multi-hop routing
const INTERMEDIARIES: Address[] = [
  MAINNET_TOKENS.WETH.address as Address,
  MAINNET_TOKENS.USDC.address as Address,
  MAINNET_TOKENS.USDT.address as Address,
];

export interface SwapQuote {
  amountOut: bigint;
  source: string;
  fee: number;
}

export async function getDirectQuotes(
  client: ReturnType<typeof getClient>,
  tokenIn: Address,
  tokenOut: Address,
  amountInWei: bigint
): Promise<SwapQuote[]> {
  const sushi = SUSHI_CONTRACTS.mainnet;
  const quotes: SwapQuote[] = [];

  const v3Results = await Promise.allSettled(
    V3_FEE_TIERS.map(async (fee) => {
      const result = await client.simulateContract({
        address: sushi.v3QuoterV2,
        abi: sushiV3QuoterAbi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            tokenIn,
            tokenOut,
            amountIn: amountInWei,
            fee,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });
      return { amountOut: result.result[0], source: `V3 (${fee / 10000}%)`, fee };
    })
  );

  for (const r of v3Results) {
    if (r.status === "fulfilled") quotes.push(r.value);
  }

  // Try V2
  try {
    const amounts = await client.readContract({
      address: sushi.v2Router,
      abi: sushiV2RouterAbi,
      functionName: "getAmountsOut",
      args: [amountInWei, [tokenIn, tokenOut]],
    });
    quotes.push({
      amountOut: amounts[amounts.length - 1],
      source: "V2",
      fee: 3000,
    });
  } catch {}

  return quotes;
}

export async function getMultiHopQuotes(
  client: ReturnType<typeof getClient>,
  tokenIn: Address,
  tokenOut: Address,
  amountInWei: bigint
): Promise<SwapQuote[]> {
  const sushi = SUSHI_CONTRACTS.mainnet;
  const quotes: SwapQuote[] = [];

  // Filter out intermediaries that are the same as tokenIn/tokenOut
  const hops = INTERMEDIARIES.filter(
    (mid) =>
      mid.toLowerCase() !== tokenIn.toLowerCase() &&
      mid.toLowerCase() !== tokenOut.toLowerCase()
  );

  // V3 multi-hop: try each intermediary with each fee tier combo
  const v3Promises: Promise<SwapQuote | null>[] = [];
  for (const mid of hops) {
    for (const fee1 of V3_FEE_TIERS) {
      for (const fee2 of V3_FEE_TIERS) {
        v3Promises.push(
          (async () => {
            try {
              const path = encodeV3Path([tokenIn, mid, tokenOut], [fee1, fee2]);
              const result = await client.simulateContract({
                address: sushi.v3QuoterV2,
                abi: sushiV3QuoterAbi,
                functionName: "quoteExactInput",
                args: [path, amountInWei],
              });
              const midSymbol = Object.values(MAINNET_TOKENS).find(
                (t) => t.address.toLowerCase() === mid.toLowerCase()
              )?.symbol ?? mid.slice(0, 10);
              return {
                amountOut: result.result[0],
                source: `V3 multi (${fee1 / 10000}%→${midSymbol}→${fee2 / 10000}%)`,
                fee: fee1 + fee2,
              };
            } catch {
              return null;
            }
          })()
        );
      }
    }
  }

  const v3Results = await Promise.all(v3Promises);
  for (const r of v3Results) {
    if (r) quotes.push(r);
  }

  // V2 multi-hop: try each intermediary in parallel
  const v2Results = await Promise.allSettled(
    hops.map(async (mid) => {
      const amounts = await client.readContract({
        address: sushi.v2Router,
        abi: sushiV2RouterAbi,
        functionName: "getAmountsOut",
        args: [amountInWei, [tokenIn, mid, tokenOut]],
      });
      const midSymbol = Object.values(MAINNET_TOKENS).find(
        (t) => t.address.toLowerCase() === mid.toLowerCase()
      )?.symbol ?? mid.slice(0, 10);
      return {
        amountOut: amounts[amounts.length - 1],
        source: `V2 multi (→${midSymbol}→)`,
        fee: 6000,
      };
    })
  );

  for (const r of v2Results) {
    if (r.status === "fulfilled") quotes.push(r.value);
  }

  return quotes;
}

export async function getBestQuote(
  client: ReturnType<typeof getClient>,
  tokenIn: Address,
  tokenOut: Address,
  amountInWei: bigint
): Promise<SwapQuote | null> {
  // Try direct and multi-hop in parallel
  const [direct, multiHop] = await Promise.all([
    getDirectQuotes(client, tokenIn, tokenOut, amountInWei),
    getMultiHopQuotes(client, tokenIn, tokenOut, amountInWei),
  ]);

  const quotes = [...direct, ...multiHop];
  if (quotes.length === 0) return null;

  quotes.sort((a, b) => (b.amountOut > a.amountOut ? 1 : b.amountOut < a.amountOut ? -1 : 0));
  return quotes[0];
}
