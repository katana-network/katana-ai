import {
  type Address,
  encodePacked,
  parseUnits,
  formatUnits,
} from "viem";
import { getClient } from "../../clients.js";
import { getToken, getTokens, type NetworkName } from "../../config/contracts.js";
import { erc20Abi } from "../../abis/erc20.js";

// V3 fee tiers in basis points
export const V3_FEE_TIERS = [100, 500, 3000, 10000] as const;
export type V3FeeTier = (typeof V3_FEE_TIERS)[number];

// Encode a V3 swap path: token0 + fee + token1 (+ fee + token2 for multi-hop)
export function encodeV3Path(
  tokens: Address[],
  fees: number[]
): `0x${string}` {
  if (tokens.length < 2 || fees.length !== tokens.length - 1) {
    throw new Error("Invalid path: need at least 2 tokens and fees.length === tokens.length - 1");
  }

  const types: string[] = [];
  const values: (Address | number)[] = [];

  for (let i = 0; i < tokens.length; i++) {
    types.push("address");
    values.push(tokens[i]);
    if (i < fees.length) {
      types.push("uint24");
      values.push(fees[i]);
    }
  }

  return encodePacked(
    types as ("address" | "uint24")[],
    values as (Address | number)[]
  );
}

// Resolve a token symbol or address to { address, decimals, symbol }
export async function resolveToken(
  network: NetworkName,
  token: string
): Promise<{ address: Address; decimals: number; symbol: string } | null> {
  // Check if it's a known symbol
  const tokenInfo = getToken(network, token);
  if (tokenInfo) {
    return {
      address: tokenInfo.address,
      decimals: tokenInfo.decimals,
      symbol: tokenInfo.symbol,
    };
  }

  // Check if it's ETH (use WETH address)
  if (token.toUpperCase() === "ETH") {
    const weth = getToken(network, "WETH");
    if (weth) return { address: weth.address, decimals: 18, symbol: "WETH" };
  }

  // Try as raw address
  if (token.startsWith("0x") && token.length === 42) {
    const client = getClient(network);
    try {
      const address = token as Address;
      const [decimals, symbol] = await Promise.all([
        client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
        client.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
      ]);
      return { address, decimals, symbol };
    } catch {
      return null;
    }
  }

  return null;
}

export function knownTokenList(network: NetworkName): string {
  return Object.keys(getTokens(network)).join(", ");
}
