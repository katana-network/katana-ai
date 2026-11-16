import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatUnits, type Address } from "viem";
import { getClient } from "../../clients.js";
import { MORPHO_CONTRACTS, type NetworkName } from "../../config/contracts.js";
import { morphoAbi } from "../../abis/morpho.js";
import { getMarketParams } from "./market-params.js";
import { erc20Abi } from "../../abis/erc20.js";
import { morphoQuery, useMorphoApi, MorphoApiNotFound, usd } from "./morpho-api.js";

interface ApiPosition {
  marketPosition: {
    healthFactor: number | null;
    priceVariationToLiquidationPrice: number | null;
    state: { collateralUsd: number | null; borrowAssetsUsd: number | null; supplyAssetsUsd: number | null } | null;
  } | null;
}

/** Indexed risk metrics from the Morpho API (Katana mainnet). Never throws. */
async function fetchRisk(marketId: string, user: string) {
  try {
    const data = await morphoQuery<ApiPosition>(
      `query ($user: String!, $market: String!, $chainId: Int!) {
        marketPosition(userAddress: $user, marketUniqueKey: $market, chainId: $chainId) {
          healthFactor
          priceVariationToLiquidationPrice
          state { collateralUsd borrowAssetsUsd supplyAssetsUsd }
        }
      }`,
      { user, market: marketId }
    );
    const pos = data.marketPosition;
    if (!pos) return { available: false, reason: "no indexed position" };
    return {
      available: true,
      source: "morpho-api",
      healthFactor: pos.healthFactor,
      priceDropToLiquidation:
        pos.priceVariationToLiquidationPrice === null
          ? null
          : `${(Math.abs(pos.priceVariationToLiquidationPrice) * 100).toFixed(2)}%`,
      collateralUsd: usd(pos.state?.collateralUsd),
      borrowUsd: usd(pos.state?.borrowAssetsUsd),
      supplyUsd: usd(pos.state?.supplyAssetsUsd),
    };
  } catch (e) {
    return {
      available: false,
      reason: e instanceof MorphoApiNotFound ? "no indexed position" : "Morpho API unavailable",
    };
  }
}

const inputSchema = {
  marketId: z
    .string()
    .describe("Morpho market ID (bytes32 hex string)"),
  user: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
    .describe("User address to check position for"),
  network: z
    .enum(["mainnet", "testnet"])
    .default("mainnet")
    .describe("Katana mainnet or Bokuto testnet"),
};

export function registerGetPosition(server: McpServer) {
  server.registerTool(
    "get_morpho_position",
    {
      description:
        "Get a user's position in a Morpho Blue market on Katana. Balances (supply, borrow, collateral) are read on-chain. On mainnet, risk metrics are added from the Morpho API (Katana only): health factor, the collateral price drop that would trigger liquidation, and USD values. A health factor below 1.0 means the position is liquidatable.",
      inputSchema,
    },
    async ({ marketId, user, network }) => {
      const net = network as NetworkName;
      const client = getClient(net);
      const morpho = MORPHO_CONTRACTS.mainnet.morpho;
      const id = marketId as `0x${string}`;
      const userAddr = user as Address;

      // Get position, market params, and market state
      const [position, params, state] = await Promise.all([
        client.readContract({
          address: morpho,
          abi: morphoAbi,
          functionName: "position",
          args: [id, userAddr],
        }),
        getMarketParams(net, id as `0x${string}`),
        client.readContract({
          address: morpho,
          abi: morphoAbi,
          functionName: "market",
          args: [id],
        }),
      ]);

      const supplyShares = position[0];
      const borrowShares = position[1];
      const collateral = position[2];

      // Get token info
      const [loanSymbol, loanDecimals, collateralSymbol, collateralDecimals] =
        await Promise.all([
          client.readContract({ address: params.loanToken as Address, abi: erc20Abi, functionName: "symbol" }).catch(() => "N/A"),
          client.readContract({ address: params.loanToken as Address, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
          client.readContract({ address: params.collateralToken as Address, abi: erc20Abi, functionName: "symbol" }).catch(() => "N/A"),
          client.readContract({ address: params.collateralToken as Address, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
        ]);

      // Convert shares to assets
      const totalSupplyAssets = state[0];
      const totalSupplyShares = state[1];
      const totalBorrowAssets = state[2];
      const totalBorrowShares = state[3];

      const supplyAssets =
        totalSupplyShares > 0n
          ? (supplyShares * BigInt(totalSupplyAssets)) / BigInt(totalSupplyShares)
          : 0n;

      const borrowAssets =
        totalBorrowShares > 0n
          ? (BigInt(borrowShares) * BigInt(totalBorrowAssets)) / BigInt(totalBorrowShares)
          : 0n;

      // Health factor: (collateralValue * LLTV) / borrowValue
      // Simplified — without oracle price, we show raw collateral and borrow amounts
      const lltv = params.lltv;
      const hasDebt = borrowAssets > 0n;

      const risk = useMorphoApi(net) && hasDebt ? await fetchRisk(marketId, user) : null;

      const response = {
        network,
        marketId,
        user,
        market: {
          loanToken: { symbol: loanSymbol, address: params.loanToken },
          collateralToken: { symbol: collateralSymbol, address: params.collateralToken },
          lltv: `${Number(lltv) / 1e16}%`,
        },
        position: {
          supplyAssets: formatUnits(supplyAssets, loanDecimals),
          borrowAssets: formatUnits(borrowAssets, loanDecimals),
          collateral: formatUnits(BigInt(collateral), collateralDecimals),
        },
        ...(risk ? { risk } : {}),
        note: !hasDebt
          ? "No outstanding debt."
          : risk && "healthFactor" in risk
            ? "Balances are on-chain; risk metrics are indexed by the Morpho API and can lag by a few blocks. Below 1.0 the position is liquidatable — treat anything under ~1.1 as urgent."
            : "Position has outstanding debt. Health factor depends on oracle price and could not be fetched — check the Morpho UI for precise liquidation risk.",
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(response) },
        ],
      };
    }
  );
}
