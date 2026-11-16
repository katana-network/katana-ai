// Shared swap quote helpers — used by analyze-loop.ts and build-loop.ts
import {
  BaseError,
  ContractFunctionRevertedError,
  ExecutionRevertedError,
  HttpRequestError,
  TimeoutError,
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

// ─── RPC awareness ──────────────────────────────────────────────────────────
// Loop tools make dozens of quote requests per run. The free public Katana RPC
// rate-limits that, so the tools retry with backoff, cap concurrency, and tell
// the agent (and through it, the user) when a custom RPC provider is needed.

/** True when the user configured their own RPC via KATANA_RPC_URL. */
export function hasCustomRpc(): boolean {
  return !!process.env.KATANA_RPC_URL;
}

const CUSTOM_RPC_HOW_TO =
  "Set KATANA_RPC_URL to your own Katana mainnet RPC endpoint (a dedicated/keyed URL from an RPC provider) in the MCP server's environment, then restart the server. Example: KATANA_RPC_URL=https://<your-provider>/<your-key> npm run start:stdio";

const PUBLIC_RPC_NOTE =
  "Running on the free public Katana RPC. Loop tools make dozens of swap-quote requests per run and can be rate-limited partway through. For reliable loop simulations and builds, the user needs their own RPC provider. " +
  CUSTOM_RPC_HOW_TO;

/** True for rate limits and transient transport failures (worth retrying). */
function isRateLimitOrTransport(e: unknown): boolean {
  if (!(e instanceof BaseError)) return false;
  return !!e.walk(
    (x) =>
      x instanceof TimeoutError ||
      (x instanceof HttpRequestError && (x.status === 429 || x.status === undefined || x.status >= 500)) ||
      (x instanceof BaseError && /rate limit|too many requests|\b429\b/i.test(`${x.details ?? ""} ${x.shortMessage ?? ""}`))
  );
}

function isRateLimit(e: unknown): boolean {
  if (!(e instanceof BaseError)) return false;
  return !!e.walk(
    (x) =>
      (x instanceof HttpRequestError && x.status === 429) ||
      (x instanceof BaseError && /rate limit|too many requests|\b429\b/i.test(`${x.details ?? ""} ${x.shortMessage ?? ""}`))
  );
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

const RETRY_DELAYS_MS = [1_000, 2_500, 5_000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry an RPC call on rate limits / transport errors with backoff. Reverts are not retried. */
async function withBackoff<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= RETRY_DELAYS_MS.length || isRevert(e) || !isRateLimitOrTransport(e)) throw e;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

/** Run tasks with at most `limit` in flight, so a quote search doesn't burst the RPC. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

// Public RPC gets fewer parallel requests than a custom one
const concurrency = () => (hasCustomRpc() ? 8 : 3);

/**
 * Thrown when no route could be quoted because the RPC failed (rate limit,
 * timeout, network) — as opposed to every route reverting, which genuinely
 * means there is no liquidity. Callers must not report this as "no liquidity".
 */
export class QuoteUnavailableError extends Error {
  readonly rateLimited: boolean;
  constructor(rateLimited: boolean) {
    super(
      hasCustomRpc()
        ? `Swap quotes are unavailable: your RPC (KATANA_RPC_URL) ${rateLimited ? "rate-limited" : "rejected or timed out"} the quote requests even after retries. Check the provider's plan limits and status. This is not a liquidity problem.`
        : `Swap quotes are unavailable: the free public Katana RPC ${rateLimited ? "rate-limited" : "rejected or timed out"} the quote requests even after retries. This is not a liquidity problem. Loop tools need many quote requests per run, which the public RPC cannot reliably serve — the user needs their own RPC provider to run them properly.`
    );
    this.name = "QuoteUnavailableError";
    this.rateLimited = rateLimited;
  }
}

/**
 * Wrap a loop tool handler:
 * - on the public RPC, annotate successful responses with an `rpc` note telling
 *   the agent to recommend a custom RPC provider;
 * - turn quote failures and rate limits into a clear JSON error with
 *   `needsCustomRpc` and setup instructions instead of an unhandled exception.
 */
export function quoteSafe<A extends { network?: string }, R>(
  handler: (args: A) => Promise<R>
): (args: A) => Promise<R | { content: { type: "text"; text: string }[]; isError: true }> {
  return async (args: A) => {
    const custom = hasCustomRpc();
    try {
      const result = await handler(args);
      if (custom) return result;
      // Annotate JSON responses with the public-RPC note
      const content = (result as { content?: { type: string; text: string }[] })?.content;
      if (content?.[0]?.type === "text") {
        try {
          const body = JSON.parse(content[0].text);
          if (body && typeof body === "object" && !Array.isArray(body)) {
            body.rpc = { provider: "public", note: PUBLIC_RPC_NOTE };
            content[0].text = JSON.stringify(body);
          }
        } catch {
          // non-JSON response — leave untouched
        }
      }
      return result;
    } catch (e) {
      const quoteErr = e instanceof QuoteUnavailableError;
      if (!quoteErr && !isRateLimitOrTransport(e)) throw e;
      const rateLimited = quoteErr ? e.rateLimited : isRateLimit(e);
      const message = quoteErr
        ? e.message
        : `The ${custom ? "configured RPC (KATANA_RPC_URL)" : "free public Katana RPC"} ${rateLimited ? "rate-limited" : "rejected or timed out"} the on-chain reads this tool needs.${custom ? "" : " Loop tools need many RPC requests per run, which the public RPC cannot reliably serve — the user needs their own RPC provider to run them properly."}`;
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              network: args.network,
              error: message,
              retryable: true,
              rateLimited,
              rpc: custom ? "custom" : "public",
              needsCustomRpc: !custom,
              howToFix: custom
                ? "Check the RPC provider's rate limits or plan, or retry shortly."
                : CUSTOM_RPC_HOW_TO,
            }),
          },
        ],
        isError: true as const,
      };
    }
  };
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

  const v3Results = await mapLimit([...V3_FEE_TIERS], concurrency(), async (fee) => {
    try {
      const result = await withBackoff(() =>
        client.simulateContract({
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
        })
      );
      return { amountOut: result.result[0], source: `V3 (${fee / 10000}%)`, fee };
    } catch (e) {
      if (!isRevert(e)) rpcErrors.push(e);
      return null;
    }
  });
  for (const q of v3Results) if (q) quotes.push(q);

  // Try V2
  try {
    const amounts = await withBackoff(() =>
      client.readContract({
        address: sushi.v2Router,
        abi: sushiV2RouterAbi,
        functionName: "getAmountsOut",
        args: [amountInWei, [tokenIn, tokenOut]],
      })
    );
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
  const symbolOf = (mid: Address) =>
    Object.values(MAINNET_TOKENS).find((t) => t.address.toLowerCase() === mid.toLowerCase())
      ?.symbol ?? mid.slice(0, 10);

  // V3 multi-hop: each intermediary × each fee-tier pair (rate-limited fan-out)
  const combos: { mid: Address; fee1: number; fee2: number }[] = [];
  for (const mid of hops)
    for (const fee1 of V3_FEE_TIERS) for (const fee2 of V3_FEE_TIERS) combos.push({ mid, fee1, fee2 });

  const v3Results = await mapLimit(combos, concurrency(), async ({ mid, fee1, fee2 }) => {
    try {
      const path = encodeV3Path([tokenIn, mid, tokenOut], [fee1, fee2]);
      const result = await withBackoff(() =>
        client.simulateContract({
          address: sushi.v3QuoterV2,
          abi: sushiV3QuoterAbi,
          functionName: "quoteExactInput",
          args: [path, amountInWei],
        })
      );
      return {
        amountOut: result.result[0],
        source: `V3 multi (${fee1 / 10000}%→${symbolOf(mid)}→${fee2 / 10000}%)`,
        fee: fee1 + fee2,
      };
    } catch (e) {
      if (!isRevert(e)) rpcErrors.push(e);
      return null;
    }
  });
  for (const q of v3Results) if (q) quotes.push(q);

  // V2 multi-hop
  const v2Results = await mapLimit(hops, concurrency(), async (mid) => {
    try {
      const amounts = await withBackoff(() =>
        client.readContract({
          address: sushi.v2Router,
          abi: sushiV2RouterAbi,
          functionName: "getAmountsOut",
          args: [amountInWei, [tokenIn, mid, tokenOut]],
        })
      );
      return { amountOut: amounts[amounts.length - 1], source: `V2 multi (→${symbolOf(mid)}→)`, fee: 6000 };
    } catch (e) {
      if (!isRevert(e)) rpcErrors.push(e);
      return null;
    }
  });
  for (const q of v2Results) if (q) quotes.push(q);

  return quotes;
}

export async function getBestQuote(
  client: ReturnType<typeof getClient>,
  tokenIn: Address,
  tokenOut: Address,
  amountInWei: bigint
): Promise<SwapQuote | null> {
  // Direct routes first (5 calls). The multi-hop search is ~50 calls, so only run
  // it when no direct pool exists.
  const rpcErrors: ErrorSink = [];
  let quotes = await getDirectQuotes(client, tokenIn, tokenOut, amountInWei, rpcErrors);
  if (quotes.length === 0) {
    quotes = await getMultiHopQuotes(client, tokenIn, tokenOut, amountInWei, rpcErrors);
  }

  if (quotes.length === 0) {
    // Every route failed. Only call it "no liquidity" if they all reverted.
    if (rpcErrors.length > 0) throw new QuoteUnavailableError(rpcErrors.some(isRateLimit));
    return null;
  }

  quotes.sort((a, b) => (b.amountOut > a.amountOut ? 1 : b.amountOut < a.amountOut ? -1 : 0));
  return quotes[0];
}
