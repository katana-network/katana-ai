import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatUnits, type Address } from "viem";
import { getClient } from "../../clients.js";
import { MORPHO_CONTRACTS, type NetworkName } from "../../config/contracts.js";
import { morphoAbi } from "../../abis/morpho.js";
import { erc20Abi } from "../../abis/erc20.js";

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
};

export function registerListMarkets(server: McpServer) {
  server.registerTool(
    "list_morpho_markets",
    {
      description:
        "Discover ALL Morpho Blue lending markets on Katana. Scans on-chain CreateMarket events to find every market ever created. Returns market ID, loan/collateral token symbols, LLTV, and current state (total supply, total borrow, utilization). No market IDs required — use this to explore available markets.",
      inputSchema,
    },
    async ({ network }) => {
      const net = network as NetworkName;
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
              text: JSON.stringify({ network, totalMarkets: 0, markets: [], note: "No markets found." }, null, 2),
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
            lastUpdate: new Date(Number(state[4]) * 1000).toISOString(),
            fee: `${Number(state[5]) / 1e16}%`,
          };
        })
      );

      const results = liveResults
        .map((r, i) =>
          r.status === "fulfilled"
            ? r.value
            : { id: cachedMarkets[i].id, error: (r.reason as Error).message }
        )
        // Filter out dead markets (no supply and no borrow)
        .filter((m) => {
          if ("error" in m) return true;
          return m.totalSupply !== "0" || m.totalBorrow !== "0";
        })
        // Strip oracle/irm from output to save tokens
        .map(({ oracle, irm, ...rest }: any) => rest);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ network, totalMarkets: results.length, markets: results }),
          },
        ],
      };
    }
  );
}
