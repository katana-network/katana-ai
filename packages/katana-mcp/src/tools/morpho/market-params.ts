import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";
import { getClient } from "../../clients.js";
import { MORPHO_CONTRACTS, type NetworkName } from "../../config/contracts.js";
import { morphoAbi } from "../../abis/morpho.js";
import { morphoQuery, useMorphoApi } from "./morpho-api.js";

// ─── Market params resolver ─────────────────────────────────────────────────
// A Morpho Blue market's params (loan token, collateral token, oracle, IRM,
// LLTV) are immutable, and its ID is keccak256(abi.encode(params)). So params
// fetched from the Morpho API can be verified locally — no trust in the API
// needed — and cached forever. This keeps build_* tools working when the
// public RPC is rate-limited. Drop-in replacement for
// `client.readContract({ functionName: "idToMarketParams" })`.

export interface MarketParams {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
}

const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const cache = new Map<string, MarketParams>();

/** Morpho Blue market ID = keccak256(abi.encode(MarketParams)). */
export function marketIdOf(p: MarketParams): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
      ],
      [p.loanToken, p.collateralToken, p.oracle, p.irm, p.lltv]
    )
  );
}

async function fromApi(id: string): Promise<MarketParams | null> {
  const data = await morphoQuery<{
    marketById: {
      lltv: string;
      irmAddress: string;
      oracle: { address: string } | null;
      loanAsset: { address: string };
      collateralAsset: { address: string } | null;
    } | null;
  }>(
    `query ($id: String!, $chainId: Int!) {
      marketById(marketId: $id, chainId: $chainId) {
        lltv irmAddress oracle { address } loanAsset { address } collateralAsset { address }
      }
    }`,
    { id }
  );
  const m = data.marketById;
  if (!m) return null;
  const params: MarketParams = {
    loanToken: m.loanAsset.address as Address,
    collateralToken: (m.collateralAsset?.address ?? ZERO) as Address,
    oracle: (m.oracle?.address ?? ZERO) as Address,
    irm: m.irmAddress as Address,
    lltv: BigInt(m.lltv),
  };
  // Only accept params that hash to the requested market ID
  return marketIdOf(params).toLowerCase() === id.toLowerCase() ? params : null;
}

async function fromChain(network: NetworkName, id: Hex): Promise<MarketParams> {
  const p = await getClient(network).readContract({
    address: MORPHO_CONTRACTS.mainnet.morpho,
    abi: morphoAbi,
    functionName: "idToMarketParams",
    args: [id],
  });
  return {
    loanToken: p.loanToken as Address,
    collateralToken: p.collateralToken as Address,
    oracle: p.oracle as Address,
    irm: p.irm as Address,
    lltv: BigInt(p.lltv),
  };
}

export async function getMarketParams(network: NetworkName, id: Hex): Promise<MarketParams> {
  const key = `${network}:${id.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return hit;

  let params: MarketParams | null = null;
  if (useMorphoApi(network)) {
    try {
      params = await fromApi(id);
    } catch {
      // API unavailable — fall back to chain
    }
  }
  if (!params) params = await fromChain(network, id);

  // An unknown ID returns all-zero params on-chain; don't cache that
  if (params.loanToken !== ZERO) cache.set(key, params);
  return params;
}
