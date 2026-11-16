import type { Address } from "viem";
import { getClient } from "../../clients.js";
import { getTokenByAddress, type NetworkName } from "../../config/contracts.js";
import { erc20Abi } from "../../abis/erc20.js";
import { withBackoff } from "./swap-utils.js";

// ─── Token decimals (never guessed) ─────────────────────────────────────────
// Decimals decide how human amounts are encoded into transactions and how raw
// balances are displayed. A silent fallback (e.g. "assume 18") turns a
// rate-limited RPC call into a transaction for the wrong amount — vbUSDC has 6
// decimals, so assuming 18 is off by 10^12. So: known tokens come from config,
// others are read on-chain with retries and cached, and failure is an error.

type Client = ReturnType<typeof getClient>;

const cache = new Map<string, number>();

function networkOf(client: Client): NetworkName {
  return client.chain?.id === 737373 ? "testnet" : "mainnet";
}

export class TokenDecimalsUnavailableError extends Error {
  constructor(token: string, cause: unknown) {
    super(
      `Could not read decimals for token ${token} (RPC error or rate limit), so amounts cannot be computed safely. Retry shortly, or set KATANA_RPC_URL to your own RPC provider.`
    );
    this.name = "TokenDecimalsUnavailableError";
    this.cause = cause;
  }
}

/** Token decimals: config → cache → on-chain (with backoff). Throws instead of guessing. */
export async function getTokenDecimals(client: Client, token: Address | string): Promise<number> {
  const net = networkOf(client);
  const known = getTokenByAddress(net, token);
  if (known) return known.decimals;

  const key = `${net}:${token.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  try {
    const d = Number(
      await withBackoff(() =>
        client.readContract({ address: token as Address, abi: erc20Abi, functionName: "decimals" })
      )
    );
    cache.set(key, d);
    return d;
  } catch (e) {
    throw new TokenDecimalsUnavailableError(token, e);
  }
}

/** Token symbol for display: config → on-chain → the address itself. Safe to fall back. */
export async function getTokenSymbol(client: Client, token: Address | string): Promise<string> {
  const known = getTokenByAddress(networkOf(client), token);
  if (known) return known.symbol;
  try {
    return String(await client.readContract({ address: token as Address, abi: erc20Abi, functionName: "symbol" }));
  } catch {
    return token;
  }
}
