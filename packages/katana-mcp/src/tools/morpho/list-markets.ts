import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatUnits, type Address } from "viem";
import { getClient } from "../../clients.js";
import { MORPHO_CONTRACTS, type NetworkName } from "../../config/contracts.js";
import { morphoAbi } from "../../abis/morpho.js";
import { erc20Abi } from "../../abis/erc20.js";
import { getTokenUsdPrice } from "../analytics/price-utils.js";
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

// ─── Static cache ────────────────────────────────────────────────────────────
// Market params and token metadata are immutable once created.
// We cache them after the first event scan and only re-fetch live state.

interface CachedMarket {
  id: `0x${string}`;
  loanToken: { symbol: string; address: string; decimals: number };
  collateralToken: { symbol: string; address: string; decimals: number };
  oracle: string;
  irm: string;
  lltv: string;
}

const cache = new Map<
  NetworkName,
  { markets: CachedMarket[]; lastBlock: bigint }
>();

async function fetchStaticData(
  client: ReturnType<typeof getClient>,
  morpho: Address,
  ids: `0x${string}`[]
): Promise<CachedMarket[]> {
  const results = await Promise.allSettled(
    ids.map(async (id) => {
      const params = await client.readContract({
        address: morpho,
        abi: morphoAbi,
        functionName: "idToMarketParams",
        args: [id],
      });

      const [loanSymbol, loanDecimals, collateralSymbol, collateralDecimals] =
        await Promise.all([
          client.readContract({ address: params.loanToken as Address, abi: erc20Abi, functionName: "symbol" }).catch(() => "N/A"),
          client.readContract({ address: params.loanToken as Address, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
          client.readContract({ address: params.collateralToken as Address, abi: erc20Abi, functionName: "symbol" }).catch(() => "N/A"),
          client.readContract({ address: params.collateralToken as Address, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
        ]);

      return {
        id,
        loanToken: { symbol: loanSymbol as string, address: params.loanToken as string, decimals: loanDecimals as number },
        collateralToken: { symbol: collateralSymbol as string, address: params.collateralToken as string, decimals: collateralDecimals as number },
        oracle: params.oracle as string,
        irm: params.irm as string,
        lltv: `${Number(params.lltv) / 1e16}%`,
      };
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<CachedMarket> => r.status === "fulfilled")
    .map((r) => r.value);
}

const inputSchema = {
  network: z
    .enum(["mainnet", "testnet"])
    .default("mainnet")
    .describe("Katana mainnet or Bokuto testnet"),
  minSupplyUsd: z
    .coerce.number()
    .min(0)
    .max(1000000)
    .default(100)
    .describe("Minimum total supply in USD to include a market (default 100). Set to 0 to show all."),
  listedOnly: z
    .boolean()
    .default(false)
    .describe("Only return markets listed (curated) by Morpho. Unlisted markets are permissionless and may carry higher risk."),
};

// ─── Morpho API path (Katana mainnet) ───────────────────────────────────────

async function listMarketsFromApi(minSupplyUsd: number, listedOnly: boolean) {
  const data = await morphoQuery<{ markets: { items: ApiMarket[] } }>(
    `query ($chainIds: [Int!]) {
      markets(first: 1000, where: { chainId_in: $chainIds }, orderBy: SupplyAssetsUsd, orderDirection: Desc) {
        items { ${MARKET_FIELDS} }
      }
    }`
  );

  const all = data.markets.items.filter((m) => m.state);
  // Same dead-market rule as the on-chain path: drop markets with no supply and no borrow
  const live = all.filter((m) => m.state!.supplyAssets !== "0" || m.state!.borrowAssets !== "0");
  const kept = live.filter(
    (m) => (!listedOnly || m.listed) && (minSupplyUsd <= 0 || (m.state!.supplyAssetsUsd ?? Infinity) >= minSupplyUsd)
  );

  const markets = kept.map((m) => {
    const st = m.state!;
    const d = m.loanAsset.decimals;
    return {
      id: m.marketId,
      loanToken: m.loanAsset.symbol,
      collateralToken: m.collateralAsset?.symbol ?? "none (idle)",
      lltv: lltvPct(m.lltv),
      totalSupply: formatUnits(BigInt(st.supplyAssets), d),
      totalBorrow: formatUnits(BigInt(st.borrowAssets), d),
      liquidity: formatUnits(BigInt(st.liquidityAssets), d),
      utilization: `${(st.utilization * 100).toFixed(2)}%`,
      supplyUsd: usd(st.supplyAssetsUsd),
      borrowUsd: usd(st.borrowAssetsUsd),
      supplyApy: pct(st.supplyApy),
      netSupplyApy: pct(st.netSupplyApy),
      borrowApy: pct(st.borrowApy),
      netBorrowApy: pct(st.netBorrowApy),
      listed: m.listed,
      warnings: formatWarnings(m.warnings),
    };
  });

  return {
    source: "morpho-api",
    totalMarkets: markets.length,
    filteredOut: live.length - markets.length,
    markets,
    note: "APYs are current rates; netSupplyApy/netBorrowApy include rewards. 'warnings' are Morpho risk flags (RED = serious). Unlisted markets are permissionless — check warnings before using one.",
  };
}

export function registerListMarkets(server: McpServer) {
  server.registerTool(
    "list_morpho_markets",
    {
      description:
        "Discover ALL Morpho Blue lending markets on Katana. On mainnet, reads the Morpho API (Katana only): market ID, loan/collateral tokens, LLTV, supply/borrow/liquidity in tokens and USD, utilization, supply/borrow APY (with and without rewards), whether Morpho lists the market, and Morpho risk warnings. Falls back to on-chain event scans if the API is unavailable, and on testnet. No market IDs required — use this to explore available markets.",
      inputSchema,
    },
    async ({ network, minSupplyUsd, listedOnly }) => {
      const net = network as NetworkName;

      if (useMorphoApi(net)) {
        try {
          const result = await listMarketsFromApi(minSupplyUsd, listedOnly);
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ network, ...result }) }],
          };
        } catch {
          // API unavailable — fall back to on-chain discovery below
        }
      }

      const client = getClient(net);
      const morpho = MORPHO_CONTRACTS.mainnet.morpho;

      // ── 1. Discover markets (cached after first call) ──────────────
      const existing = cache.get(net);
      const fromBlock = existing ? existing.lastBlock + 1n : 0n;

      const logs = await client.getContractEvents({
        address: morpho,
        abi: morphoAbi,
        eventName: "CreateMarket",
        fromBlock,
        toBlock: "latest",
      });

      const latestBlock = await client.getBlockNumber();

      if (logs.length > 0) {
        const newIds = logs.map((log) => log.args.id as `0x${string}`);
        const newMarkets = await fetchStaticData(client, morpho, newIds);

        if (existing) {
          existing.markets.push(...newMarkets);
          existing.lastBlock = latestBlock;
        } else {
          cache.set(net, { markets: newMarkets, lastBlock: latestBlock });
        }
      } else if (!existing) {
        cache.set(net, { markets: [], lastBlock: latestBlock });
      } else {
        existing.lastBlock = latestBlock;
      }

      const cachedMarkets = cache.get(net)!.markets;

      if (cachedMarkets.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ network, totalMarkets: 0, markets: [], note: "No markets found." }),
            },
          ],
        };
      }

      // ── 2. Fetch ONLY live state for each market (the cheap part) ──
      const liveResults = await Promise.allSettled(
        cachedMarkets.map(async (m) => {
          const state = await client.readContract({
            address: morpho,
            abi: morphoAbi,
            functionName: "market",
            args: [m.id],
          });

          const totalSupplyAssets = state[0];
          const totalBorrowAssets = state[2];
          const utilization =
            totalSupplyAssets > 0n
              ? Number((totalBorrowAssets * 10000n) / totalSupplyAssets) / 100
              : 0;

          return {
            ...m,
            totalSupply: formatUnits(totalSupplyAssets, m.loanToken.decimals),
            totalBorrow: formatUnits(totalBorrowAssets, m.loanToken.decimals),
            utilization: `${utilization.toFixed(2)}%`,
          };
        })
      );

      const allMarkets = liveResults
        .map((r, i) =>
          r.status === "fulfilled"
            ? r.value
            : { id: cachedMarkets[i].id, error: (r.reason as Error).message }
        )
        // Filter out completely dead markets (no supply and no borrow)
        .filter((m) => {
          if ("error" in m) return true;
          return m.totalSupply !== "0" || m.totalBorrow !== "0";
        });

      // Apply USD-based dust filter using on-chain prices
      let results = allMarkets;
      if (minSupplyUsd > 0) {
        // Get unique loan token addresses and fetch their USD prices
        const uniqueLoanTokens = new Map<string, { address: Address; decimals: number }>();
        for (const m of allMarkets) {
          if ("error" in m) continue;
          const addr = m.loanToken.address.toLowerCase();
          if (!uniqueLoanTokens.has(addr)) {
            uniqueLoanTokens.set(addr, { address: m.loanToken.address as Address, decimals: m.loanToken.decimals });
          }
        }

        const priceMap = new Map<string, number>();
        await Promise.allSettled(
          Array.from(uniqueLoanTokens.entries()).map(async ([addr, token]) => {
            const price = await getTokenUsdPrice(client, token.address, token.decimals);
            if (price !== null) priceMap.set(addr, price);
          })
        );

        results = allMarkets.filter((m) => {
          if ("error" in m) return true;
          const price = priceMap.get(m.loanToken.address.toLowerCase());
          if (price === undefined) return true; // include if we can't price it
          const supplyUsd = parseFloat(m.totalSupply) * price;
          return supplyUsd >= minSupplyUsd;
        });
      }

      const filteredOut = allMarkets.length - results.length;

      // Strip oracle/irm and collapse token objects to symbols
      const markets = results.map(({ oracle, irm, loanToken, collateralToken, ...rest }: any) => ({
        ...rest,
        loanToken: loanToken?.symbol ?? loanToken,
        collateralToken: collateralToken?.symbol ?? collateralToken,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ network, source: "rpc", totalMarkets: markets.length, filteredOut, markets }),
          },
        ],
      };
    }
  );
}
