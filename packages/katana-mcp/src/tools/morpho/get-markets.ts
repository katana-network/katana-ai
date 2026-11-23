import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatUnits, type Address } from "viem";
import { getClient } from "../../clients.js";
import { MORPHO_CONTRACTS, type NetworkName } from "../../config/contracts.js";
import { morphoAbi } from "../../abis/morpho.js";
import { erc20Abi } from "../../abis/erc20.js";
import { getTokenDecimals } from "./token-meta.js";
import {
  morphoQuery,
  useMorphoApi,
  MARKET_FIELDS,
  formatWarnings,
  lltvPct,
  pct,
  usd,
  type ApiMarket,
} from "./morpho-api.js";

function formatApiMarket(m: ApiMarket) {
  const st = m.state;
  const d = m.loanAsset.decimals;
  return {
    id: m.marketId,
    params: {
      loanToken: m.loanAsset,
      collateralToken: m.collateralAsset ?? { address: "0x0000000000000000000000000000000000000000", symbol: "none (idle)", decimals: 18 },
      oracle: m.oracle?.address ?? null,
      irm: m.irmAddress,
      lltv: lltvPct(m.lltv),
      lltvRaw: m.lltv,
    },
    state: st
      ? {
          totalSupplyAssets: formatUnits(BigInt(st.supplyAssets), d),
          totalSupplyShares: st.supplyShares,
          totalBorrowAssets: formatUnits(BigInt(st.borrowAssets), d),
          totalBorrowShares: st.borrowShares,
          liquidity: formatUnits(BigInt(st.liquidityAssets), d),
          utilization: `${(st.utilization * 100).toFixed(2)}%`,
          lastUpdate: new Date(Number(st.timestamp) * 1000).toISOString(),
          fee: pct(st.fee, 1),
          supplyUsd: usd(st.supplyAssetsUsd),
          borrowUsd: usd(st.borrowAssetsUsd),
          liquidityUsd: usd(st.liquidityAssetsUsd),
          supplyApy: pct(st.supplyApy),
          netSupplyApy: pct(st.netSupplyApy),
          borrowApy: pct(st.borrowApy),
          netBorrowApy: pct(st.netBorrowApy),
        }
      : null,
    listed: m.listed,
    warnings: formatWarnings(m.warnings),
  };
}

const inputSchema = {
  marketIds: z
    .string()
    .describe(
      "Comma-separated Morpho market IDs (bytes32 hex strings). Get these from the Morpho UI or on-chain events."
    ),
  network: z
    .enum(["mainnet", "testnet"])
    .default("mainnet")
    .describe("Katana mainnet or Bokuto testnet"),
};

export function registerGetMarkets(server: McpServer) {
  server.registerTool(
    "get_morpho_markets",
    {
      description:
        "Get details for one or more Morpho Blue markets on Katana. Returns market parameters (loan token, collateral token, oracle, IRM, LLTV) and current state (total supply, total borrow, liquidity, utilization, fee). On mainnet, reads the Morpho API (Katana only), which adds USD values, supply/borrow APYs (with and without rewards), listing status and Morpho risk warnings; falls back to on-chain reads for any market the API can't return, and on testnet.",
      inputSchema,
    },
    async ({ marketIds, network }) => {
      const net = network as NetworkName;
      const client = getClient(net);
      const morpho = MORPHO_CONTRACTS.mainnet.morpho;

      const ids = marketIds.split(",").map((id) => id.trim() as `0x${string}`);

      // ── Morpho API (mainnet): one request for all IDs ──
      const fromApi = new Map<string, ReturnType<typeof formatApiMarket>>();
      if (useMorphoApi(net)) {
        try {
          const data = await morphoQuery<{ markets: { items: ApiMarket[] } }>(
            `query ($ids: [String!], $chainIds: [Int!]) {
              markets(first: 100, where: { uniqueKey_in: $ids, chainId_in: $chainIds }) {
                items { ${MARKET_FIELDS} }
              }
            }`,
            { ids }
          );
          for (const m of data.markets.items) fromApi.set(m.marketId.toLowerCase(), formatApiMarket(m));
        } catch {
          // fall back to on-chain for every ID
        }
      }
      if (fromApi.size === ids.length) {
        const markets = ids.map((id) => ({ source: "morpho-api", ...fromApi.get(id.toLowerCase())! }));
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ network, markets }) }],
        };
      }

      const markets = await Promise.allSettled(
        ids.map(async (id) => {
          const api = fromApi.get(id.toLowerCase());
          if (api) return { source: "morpho-api", ...api };

          // Get market params and state in parallel
          const [params, state] = await Promise.all([
            client.readContract({
              address: morpho,
              abi: morphoAbi,
              functionName: "idToMarketParams",
              args: [id],
            }),
            client.readContract({
              address: morpho,
              abi: morphoAbi,
              functionName: "market",
              args: [id],
            }),
          ]);

          // Get token symbols and decimals
          const [loanSymbol, loanDecimals, collateralSymbol, collateralDecimals] =
            await Promise.all([
              client.readContract({ address: params.loanToken as Address, abi: erc20Abi, functionName: "symbol" }).catch(() => "N/A"),
              getTokenDecimals(client, params.loanToken as Address),
              client.readContract({ address: params.collateralToken as Address, abi: erc20Abi, functionName: "symbol" }).catch(() => "N/A"),
              getTokenDecimals(client, params.collateralToken as Address),
            ]);

          const totalSupplyAssets = state[0];
          const totalBorrowAssets = state[2];
          const utilization =
            totalSupplyAssets > 0n
              ? Number((totalBorrowAssets * 10000n) / totalSupplyAssets) / 100
              : 0;

          return {
            source: "rpc",
            id,
            params: {
              loanToken: { address: params.loanToken, symbol: loanSymbol, decimals: loanDecimals },
              collateralToken: { address: params.collateralToken, symbol: collateralSymbol, decimals: collateralDecimals },
              oracle: params.oracle,
              irm: params.irm,
              lltv: `${Number(params.lltv) / 1e16}%`,
              lltvRaw: params.lltv.toString(),
            },
            state: {
              totalSupplyAssets: formatUnits(totalSupplyAssets, loanDecimals),
              totalSupplyShares: state[1].toString(),
              totalBorrowAssets: formatUnits(totalBorrowAssets, loanDecimals),
              totalBorrowShares: state[3].toString(),
              utilization: `${utilization.toFixed(2)}%`,
              lastUpdate: new Date(Number(state[4]) * 1000).toISOString(),
              fee: `${Number(state[5]) / 1e16}%`,
            },
          };
        })
      );

      const results = markets.map((r, i) =>
        r.status === "fulfilled"
          ? r.value
          : { id: ids[i], error: (r.reason as Error).message }
      );

      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ network, markets: results }) },
        ],
      };
    }
  );
}
