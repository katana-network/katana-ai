import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatUnits, type Address } from "viem";
import { getClient } from "../../clients.js";
import { MORPHO_CONTRACTS, type NetworkName } from "../../config/contracts.js";
import { metaMorphoAbi, metaMorphoFactoryAbi } from "../../abis/metamorpho.js";
import { erc20Abi } from "../../abis/erc20.js";
import { getTokenDecimals } from "./token-meta.js";
import {
  morphoQuery,
  useMorphoApi,
  formatWarnings,
  pct,
  usd,
  IMPLAUSIBLE_APY,
  type ApiAsset,
  type ApiWarning,
} from "./morpho-api.js";

// ─── Static cache ────────────────────────────────────────────────────────────
// Vault metadata (name, symbol, asset, curator, owner, decimals) is static.
// We cache after the first event scan and only re-fetch live data (totalAssets, fee).

interface CachedVault {
  address: Address;
  name: string;
  symbol: string;
  asset: { address: string; symbol: string; decimals: number };
  curator: string;
  owner: string;
  vaultDecimals: number;
}

const cache = new Map<
  NetworkName,
  { vaults: CachedVault[]; lastBlock: bigint }
>();

async function fetchStaticData(
  client: ReturnType<typeof getClient>,
  addresses: Address[]
): Promise<CachedVault[]> {
  const results = await Promise.allSettled(
    addresses.map(async (vaultAddr) => {
      const [name, symbol, asset, curator, owner, decimals] =
        await Promise.all([
          client.readContract({ address: vaultAddr, abi: metaMorphoAbi, functionName: "name" }),
          client.readContract({ address: vaultAddr, abi: metaMorphoAbi, functionName: "symbol" }),
          client.readContract({ address: vaultAddr, abi: metaMorphoAbi, functionName: "asset" }),
          client.readContract({ address: vaultAddr, abi: metaMorphoAbi, functionName: "curator" }),
          client.readContract({ address: vaultAddr, abi: metaMorphoAbi, functionName: "owner" }),
          client.readContract({ address: vaultAddr, abi: metaMorphoAbi, functionName: "decimals" }),
        ]);

      const [assetSymbol, assetDecimals] = await Promise.all([
        client.readContract({ address: asset as Address, abi: erc20Abi, functionName: "symbol" }).catch(() => "N/A"),
        getTokenDecimals(client, asset as Address),
      ]);

      return {
        address: vaultAddr,
        name: name as string,
        symbol: symbol as string,
        asset: { address: asset as string, symbol: assetSymbol as string, decimals: assetDecimals as number },
        curator: curator as string,
        owner: owner as string,
        vaultDecimals: decimals as number,
      };
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<CachedVault> => r.status === "fulfilled")
    .map((r) => r.value);
}

const inputSchema = {
  network: z
    .enum(["mainnet", "testnet"])
    .default("mainnet")
    .describe("Katana mainnet or Bokuto testnet"),
  listedOnly: z
    .boolean()
    .default(false)
    .describe("Only return vaults listed (curated) by Morpho. Unlisted vaults include personal and test vaults."),
  includeV2: z
    .boolean()
    .default(true)
    .describe("Include Morpho Vault V2s as well as MetaMorpho (v1) vaults (mainnet, via the Morpho API)"),
};

// ─── Morpho API path (Katana mainnet) ───────────────────────────────────────

interface ApiVaultV1 {
  address: string;
  name: string;
  symbol: string;
  listed: boolean;
  asset: ApiAsset;
  state: {
    totalAssets: string;
    totalAssetsUsd: number | null;
    fee: number;
    apy: number | null;
    netApy: number | null;
    curator: string | null;
    owner: string | null;
  } | null;
  warnings: ApiWarning[];
}

interface ApiVaultV2 {
  address: string;
  name: string;
  symbol: string;
  listed: boolean;
  asset: ApiAsset;
  totalAssets: string;
  totalAssetsUsd: number | null;
  liquidity: string;
  liquidityUsd: number | null;
  apy: number | null;
  netApy: number | null;
  performanceFee: number | null;
  managementFee: number | null;
  curator: { address: string } | null;
  owner: { address: string } | null;
  warnings: ApiWarning[];
}

function apyFlags(netApy: number | null, warnings: string[]): string[] {
  return netApy !== null && netApy > IMPLAUSIBLE_APY
    ? [...warnings, "UNVERIFIED:implausible_apy (likely a tiny or personal vault — do not rely on this APY)"]
    : warnings;
}

async function listVaultsFromApi(listedOnly: boolean, includeV2: boolean) {
  const v1Query = `query ($chainIds: [Int!]) {
    vaults(first: 1000, where: { chainId_in: $chainIds }, orderBy: TotalAssetsUsd, orderDirection: Desc) {
      items {
        address name symbol listed
        asset { address symbol decimals }
        state { totalAssets totalAssetsUsd fee apy netApy curator owner }
        warnings { type level }
      }
    }
  }`;
  const v2Query = `query ($chainIds: [Int!]) {
    vaultV2s(first: 1000, where: { chainId_in: $chainIds }, orderBy: TotalAssetsUsd, orderDirection: Desc) {
      items {
        address name symbol listed
        asset { address symbol decimals }
        totalAssets totalAssetsUsd liquidity liquidityUsd apy netApy
        performanceFee managementFee
        curator { address } owner { address }
        warnings { type level }
      }
    }
  }`;

  const [v1, v2] = await Promise.all([
    morphoQuery<{ vaults: { items: ApiVaultV1[] } }>(v1Query),
    includeV2 ? morphoQuery<{ vaultV2s: { items: ApiVaultV2[] } }>(v2Query) : null,
  ]);

  const v1Out = v1.vaults.items
    .filter((v) => v.state && (!listedOnly || v.listed))
    .map((v) => {
      const st = v.state!;
      return {
        version: "v1",
        address: v.address,
        name: v.name,
        symbol: v.symbol,
        asset: v.asset,
        tvl: formatUnits(BigInt(st.totalAssets), v.asset.decimals),
        tvlUsd: usd(st.totalAssetsUsd),
        apy: pct(st.apy),
        netApy: pct(st.netApy),
        fee: pct(st.fee, 1),
        curator: st.curator,
        owner: st.owner,
        listed: v.listed,
        warnings: apyFlags(st.netApy, formatWarnings(v.warnings)),
      };
    });

  const v2Out = (v2?.vaultV2s.items ?? [])
    .filter((v) => !listedOnly || v.listed)
    .map((v) => ({
      version: "v2",
      address: v.address,
      name: v.name,
      symbol: v.symbol,
      asset: v.asset,
      tvl: formatUnits(BigInt(v.totalAssets), v.asset.decimals),
      tvlUsd: usd(v.totalAssetsUsd),
      liquidity: formatUnits(BigInt(v.liquidity), v.asset.decimals),
      apy: pct(v.apy),
      netApy: pct(v.netApy),
      performanceFee: pct(v.performanceFee, 1),
      managementFee: pct(v.managementFee, 1),
      curator: v.curator?.address ?? null,
      owner: v.owner?.address ?? null,
      listed: v.listed,
      warnings: apyFlags(v.netApy, formatWarnings(v.warnings)),
    }));

  const vaults = [...v1Out, ...v2Out].sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0));

  return {
    source: "morpho-api",
    totalVaults: vaults.length,
    v1Count: v1Out.length,
    v2Count: v2Out.length,
    vaults,
    note: "Sorted by TVL (USD). netApy includes rewards and fees. 'listed' = curated by Morpho. build_morpho_vault_deposit/withdraw support both v1 and V2 (ERC-4626). V2 vaults report 0 from maxWithdraw/maxRedeem — use the withdraw tool's liquidityCheck or get_morpho_vault_detail liquidity instead.",
  };
}

export function registerListVaults(server: McpServer) {
  server.registerTool(
    "list_morpho_vaults",
    {
      description:
        "Discover ALL Morpho vaults on Katana — MetaMorpho (v1) and Vault V2. On mainnet, reads the Morpho API (Katana only): address, name, asset, TVL in tokens and USD, APY and net APY, fees, curator, owner, whether Morpho lists the vault, and risk warnings (implausible APYs are flagged). Falls back to on-chain factory event scans (v1 only) if the API is unavailable, and on testnet. Use this to explore Morpho vaults for passive lending.",
      inputSchema,
    },
    async ({ network, listedOnly, includeV2 }) => {
      const net = network as NetworkName;

      if (useMorphoApi(net)) {
        try {
          const result = await listVaultsFromApi(listedOnly, includeV2);
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ network, ...result }, null, 2) }],
          };
        } catch {
          // API unavailable — fall back to on-chain discovery below
        }
      }

      const client = getClient(net);

      // ── 1. Discover vaults (cached after first call) ───────────────
      const existing = cache.get(net);
      const fromBlock = existing ? existing.lastBlock + 1n : 0n;

      const factories = [
        MORPHO_CONTRACTS.mainnet.metaMorphoFactory,
        MORPHO_CONTRACTS.mainnet.metaMorphoFactoryV1_1,
      ];
      const logArrays = await Promise.all(
        factories.map((factory) =>
          client.getContractEvents({
            address: factory,
            abi: metaMorphoFactoryAbi,
            eventName: "CreateMetaMorpho",
            fromBlock,
            toBlock: "latest",
          })
        )
      );
      const logs = logArrays.flat();

      const latestBlock = await client.getBlockNumber();

      if (logs.length > 0) {
        const newAddresses = logs.map((log) => log.args.metaMorpho as Address);
        const newVaults = await fetchStaticData(client, newAddresses);

        if (existing) {
          existing.vaults.push(...newVaults);
          existing.lastBlock = latestBlock;
        } else {
          cache.set(net, { vaults: newVaults, lastBlock: latestBlock });
        }
      } else if (!existing) {
        cache.set(net, { vaults: [], lastBlock: latestBlock });
      } else {
        existing.lastBlock = latestBlock;
      }

      const cachedVaults = cache.get(net)!.vaults;

      if (cachedVaults.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ network, totalVaults: 0, vaults: [], note: "No vaults found." }),
            },
          ],
        };
      }

      // ── 2. Fetch ONLY live data for each vault (totalAssets + fee) ─
      const liveResults = await Promise.allSettled(
        cachedVaults.map(async (v) => {
          const [totalAssets, fee] = await Promise.all([
            client.readContract({ address: v.address, abi: metaMorphoAbi, functionName: "totalAssets" }),
            client.readContract({ address: v.address, abi: metaMorphoAbi, functionName: "fee" }),
          ]);

          return {
            ...v,
            tvl: formatUnits(totalAssets as bigint, v.asset.decimals),
            fee: `${Number(fee as bigint) / 1e16}%`,
          };
        })
      );

      const results = liveResults.map((r, i) =>
        r.status === "fulfilled"
          ? r.value
          : { address: cachedVaults[i].address, error: (r.reason as Error).message }
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { network, source: "rpc", totalVaults: results.length, vaults: results },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
