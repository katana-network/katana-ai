import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatUnits, type Address } from "viem";
import { getClient } from "../../clients.js";
import { MORPHO_CONTRACTS, type NetworkName } from "../../config/contracts.js";
import { metaMorphoAbi, metaMorphoFactoryAbi } from "../../abis/metamorpho.js";
import { erc20Abi } from "../../abis/erc20.js";

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
        client.readContract({ address: asset as Address, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
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
};

export function registerListVaults(server: McpServer) {
  server.registerTool(
    "list_morpho_vaults",
    {
      description:
        "Discover ALL MetaMorpho vaults on Katana. Scans on-chain CreateMetaMorpho events from the factory contract to find every vault deployed. Returns vault address, name, symbol, underlying asset, TVL (total deposited), curator, owner, and fee. No inputs required — use this to explore available Morpho vaults for passive lending.",
      inputSchema,
    },
    async ({ network }) => {
      const net = network as NetworkName;
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
              { network, totalVaults: results.length, vaults: results },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
