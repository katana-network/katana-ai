// Shared swap quote helpers — used by analyze-loop.ts and build-loop.ts
import {
  BaseError,
  ContractFunctionRevertedError,
  ExecutionRevertedError,
  type Address,
} from "viem";
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

/**
 * Thrown when no route could be quoted because the RPC failed (rate limit,
 * timeout, network) — as opposed to every route reverting, which genuinely
 * means there is no liquidity. Callers must not report this as "no liquidity".
 */
export class QuoteUnavailableError extends Error {
  constructor() {
    super(
      "Swap quotes are temporarily unavailable: the Katana RPC rejected or timed out the quote requests (often a public-RPC rate limit). This is not a liquidity problem — retry in a minute, or set KATANA_RPC_URL to a keyed RPC endpoint."
    );
    this.name = "QuoteUnavailableError";
  }
}

/**
 * Wrap a tool handler so a QuoteUnavailableError becomes a clear, retryable
 * JSON error instead of an unhandled exception.
 */
export function quoteSafe<A extends { network?: string }, R>(
  handler: (args: A) => Promise<R>
): (args: A) => Promise<R | { content: { type: "text"; text: string }[]; isError: true }> {
  return async (args: A) => {
    try {
      return await handler(args);
    } catch (e) {
      if (e instanceof QuoteUnavailableError) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ network: args.network, error: e.message, retryable: true }),
            },
          ],
          isError: true as const,
        };
      }
      throw e;
    }
  };
}

/** True if the error is a contract revert (route doesn't exist / no liquidity). */
function isRevert(e: unknown): boolean {
  if (!(e instanceof BaseError)) return false;
  return !!e.walk(
    (x) =>
      x instanceof ContractFunctionRevertedError ||
      x instanceof ExecutionRevertedError ||
      (x instanceof BaseError && /execution reverted/i.test(x.details ?? ""))
  );
}

/** Collects quote failures that were NOT contract reverts. */
type ErrorSink = unknown[];

export async function getDirectQuotes(
  client: ReturnType<typeof getClient>,
  tokenIn: Address,
  tokenOut: Address,
  amountInWei: bigint,
  rpcErrors: ErrorSink = []
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
    else if (!isRevert(r.reason)) rpcErrors.push(r.reason);
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
  } catch (e) {
    if (!isRevert(e)) rpcErrors.push(e);
  }

  return quotes;
}

export async function getMultiHopQuotes(
  client: ReturnType<typeof getClient>,
  tokenIn: Address,
  tokenOut: Address,
  amountInWei: bigint,
  rpcErrors: ErrorSink = []
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
            } catch (e) {
              if (!isRevert(e)) rpcErrors.push(e);
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
    else if (!isRevert(r.reason)) rpcErrors.push(r.reason);
  }

  return quotes;
}

export async function getBestQuote(
  client: ReturnType<typeof getClient>,
  tokenIn: Address,
  tokenOut: Address,
  amountInWei: bigint
): Promise<SwapQuote | null> {
  // Direct routes first (5 calls). The multi-hop search is ~50 calls, so only run
  // it when no direct pool exists — firing both at once is what tripped public-RPC
  // rate limits.
  const rpcErrors: ErrorSink = [];
  let quotes = await getDirectQuotes(client, tokenIn, tokenOut, amountInWei, rpcErrors);
  if (quotes.length === 0) {
    quotes = await getMultiHopQuotes(client, tokenIn, tokenOut, amountInWei, rpcErrors);
  }

  if (quotes.length === 0) {
    // Every route failed. Only call it "no liquidity" if they all reverted.
    if (rpcErrors.length > 0) throw new QuoteUnavailableError();
    return null;
  }

  quotes.sort((a, b) => (b.amountOut > a.amountOut ? 1 : b.amountOut < a.amountOut ? -1 : 0));
  return quotes[0];
}
