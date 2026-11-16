import type { NetworkName } from "../../config/contracts.js";

// ─── Morpho API (Katana only) ───────────────────────────────────────────────
// Morpho's public API (https://docs.morpho.org/api) indexes Morpho Blue markets,
// MetaMorpho (v1) vaults and Vault V2s. It is the recommended source for reads:
// one request replaces hundreds of RPC calls and adds USD values, APYs, rewards
// and risk warnings.
//
// This module is deliberately locked to Katana mainnet (chain 747474): the chain
// ID is fixed here and never taken from tool input. Bokuto testnet is not indexed
// by Morpho, so testnet reads stay on-chain.

export const MORPHO_API_URL =
  process.env.MORPHO_API_URL || "https://api.morpho.org/graphql";
export const KATANA_CHAIN_ID = 747474;

const TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 60_000; // Morpho asks integrators to cache and avoid polling
const cache = new Map<string, { at: number; data: unknown }>();

/** The Morpho API only covers Katana mainnet; testnet must use on-chain reads. */
export function useMorphoApi(network: NetworkName): boolean {
  return network === "mainnet" && process.env.MORPHO_API_DISABLED !== "1";
}

export class MorphoApiNotFound extends Error {}

/**
 * Run a GraphQL query against the Morpho API with the Katana chain ID injected.
 * Queries must declare `$chainId: Int!` or `$chainIds: [Int!]` — never pass a
 * chain ID through `variables`.
 */
export async function morphoQuery<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  if ("chainId" in variables || "chainIds" in variables) {
    throw new Error("Chain ID is fixed to Katana and cannot be overridden");
  }
  const vars = { ...variables, chainId: KATANA_CHAIN_ID, chainIds: [KATANA_CHAIN_ID] };
  // Only send the chain variable(s) the query declares
  if (!/\$chainId\b/.test(query)) delete (vars as Record<string, unknown>).chainId;
  if (!/\$chainIds\b/.test(query)) delete (vars as Record<string, unknown>).chainIds;

  const key = query + JSON.stringify(vars);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data as T;

  const res = await fetch(MORPHO_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: vars }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Morpho API HTTP ${res.status}`);

  const json = (await res.json()) as { data?: T; errors?: { message: string; status?: string }[] };
  if (json.errors?.length) {
    const e = json.errors[0];
    if (e.status === "NOT_FOUND") throw new MorphoApiNotFound(e.message);
    throw new Error(`Morpho API: ${e.message}`);
  }
  if (!json.data) throw new Error("Morpho API: empty response");

  cache.set(key, { at: Date.now(), data: json.data });
  return json.data;
}

// ─── Shared fragments and types ─────────────────────────────────────────────

export const MARKET_FIELDS = `
  marketId
  listed
  lltv
  irmAddress
  oracle { address }
  loanAsset { address symbol decimals }
  collateralAsset { address symbol decimals }
  state {
    supplyAssets borrowAssets supplyShares borrowShares
    supplyAssetsUsd borrowAssetsUsd liquidityAssets liquidityAssetsUsd
    utilization supplyApy borrowApy netSupplyApy netBorrowApy fee timestamp
  }
  warnings { type level }
`;

export interface ApiAsset {
  address: string;
  symbol: string;
  decimals: number;
}

export interface ApiWarning {
  type: string;
  level: string;
}

export interface ApiMarket {
  marketId: string;
  listed: boolean;
  lltv: string;
  irmAddress: string;
  oracle: { address: string } | null;
  loanAsset: ApiAsset;
  collateralAsset: ApiAsset | null;
  state: {
    supplyAssets: string;
    borrowAssets: string;
    supplyShares: string;
    borrowShares: string;
    supplyAssetsUsd: number | null;
    borrowAssetsUsd: number | null;
    liquidityAssets: string;
    liquidityAssetsUsd: number | null;
    utilization: number;
    supplyApy: number | null;
    borrowApy: number | null;
    netSupplyApy: number | null;
    netBorrowApy: number | null;
    fee: number;
    timestamp: string;
  } | null;
  warnings: ApiWarning[];
}

// ─── Formatting helpers ─────────────────────────────────────────────────────

export const pct = (v: number | null | undefined, digits = 2): string | null =>
  v === null || v === undefined || Number.isNaN(v) ? null : `${(v * 100).toFixed(digits)}%`;

export const usd = (v: number | null | undefined): number | null =>
  v === null || v === undefined ? null : Math.round(v * 100) / 100;

/** LLTV from the API is a WAD string (1e18 = 100%). */
export const lltvPct = (wad: string): string => `${Number(BigInt(wad)) / 1e16}%`;

/** Summarize Morpho risk warnings: RED first, then YELLOW. */
export function formatWarnings(warnings: ApiWarning[] | null | undefined): string[] {
  if (!warnings?.length) return [];
  const rank = (l: string) => (l === "RED" ? 0 : 1);
  return [...warnings].sort((a, b) => rank(a.level) - rank(b.level)).map((w) => `${w.level}:${w.type}`);
}

/** APYs above this are almost always tiny/personal vaults or broken accounting. */
export const IMPLAUSIBLE_APY = 1; // 100%
