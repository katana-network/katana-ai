import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatUnits, type Address } from "viem";
import { getClient } from "../../clients.js";
import { MORPHO_CONTRACTS, getTokenByAddress, type NetworkName } from "../../config/contracts.js";
import { metaMorphoAbi } from "../../abis/metamorpho.js";
import { morphoAbi } from "../../abis/morpho.js";
import { erc20Abi } from "../../abis/erc20.js";

// ─── Morpho Blue GraphQL API ────────────────────────────────────────────────
const MORPHO_API = "https://blue-api.morpho.org/graphql";
const KATANA_CHAIN_ID = 747474;

const VAULT_DETAIL_QUERY = `
  query VaultDetail($address: String!, $chainId: Int!) {
    vaultByAddress(address: $address, chainId: $chainId) {
      address
      name
      symbol
      asset {
        address
        symbol
        decimals
      }
      state {
        totalAssets
        fee
        curator
        apy
        netApy
        allocation {
          market {
            marketId
            lltv
            loanAsset {
              address
              symbol
              decimals
            }
            collateralAsset {
              address
              symbol
              decimals
            }
            state {
              supplyAssets
              borrowAssets
              liquidityAssets
              utilization
            }
          }
          supplyAssets
          supplyShares
          supplyCap
        }
      }
    }
  }
`;

interface GqlAllocation {
  market: {
    marketId: string;
    lltv: string;
    loanAsset: { address: string; symbol: string; decimals: number };
    collateralAsset: { address: string; symbol: string; decimals: number } | null;
    state: {
      supplyAssets: string;
      borrowAssets: string;
      liquidityAssets: string;
      utilization: number;
    } | null;
  };
  supplyAssets: string;
  supplyShares: string;
  supplyCap: string;
}

interface GqlVaultDetail {
  vaultByAddress: {
    address: string;
    name: string;
    symbol: string;
    asset: { address: string; symbol: string; decimals: number };
    state: {
      totalAssets: string;
      fee: number;
      curator: string;
      apy: number;
      netApy: number;
      allocation: GqlAllocation[];
    } | null;
  } | null;
}

async function fetchFromGraphQL(vaultAddress: string) {
  const res = await fetch(MORPHO_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: VAULT_DETAIL_QUERY,
      variables: { address: vaultAddress, chainId: KATANA_CHAIN_ID },
    }),
  });

  if (!res.ok) throw new Error(`Morpho API ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as GqlVaultDetail;
}

function formatGqlResult(data: GqlVaultDetail) {
  const v = data.vaultByAddress;
  if (!v || !v.state) return null;

  const decimals = v.asset.decimals;
  const totalAssets = BigInt(v.state.totalAssets);
  const tvl = formatUnits(totalAssets, decimals);

  const allocations = v.state.allocation.map((alloc) => {
    const m = alloc.market;
    const ms = m.state;
    const loanDecimals = m.loanAsset.decimals;
    const vaultSupply = BigInt(alloc.supplyAssets);
    const supplyCap = BigInt(alloc.supplyCap);
    const marketSupply = ms ? BigInt(ms.supplyAssets) : 0n;
    const marketBorrow = ms ? BigInt(ms.borrowAssets) : 0n;
    const marketLiquidity = ms ? BigInt(ms.liquidityAssets) : 0n;
    const utilization = ms?.utilization ?? 0;

    // How much of this vault's allocation is withdrawable
    const vaultWithdrawable = vaultSupply <= marketLiquidity ? vaultSupply : marketLiquidity;

    return {
      marketId: m.marketId,
      loanToken: m.loanAsset.symbol,
      collateralToken: m.collateralAsset?.symbol ?? "none (idle)",
      lltv: `${(Number(m.lltv) / 1e18 * 100).toFixed(1)}%`,
      vaultSupply: formatUnits(vaultSupply, loanDecimals),
      vaultSupplyPct: totalAssets > 0n
        ? `${(Number(vaultSupply * 10000n / totalAssets) / 100).toFixed(1)}%`
        : "0%",
      supplyCap: formatUnits(supplyCap, loanDecimals),
      marketTotalSupply: formatUnits(marketSupply, loanDecimals),
      marketTotalBorrow: formatUnits(marketBorrow, loanDecimals),
      marketLiquidity: formatUnits(marketLiquidity, loanDecimals),
      utilization: `${(utilization * 100).toFixed(2)}%`,
      vaultWithdrawable: formatUnits(vaultWithdrawable, loanDecimals),
    };
  });

  // Aggregate withdrawal liquidity
  const totalWithdrawable = allocations.reduce((acc, a) => {
    const val = parseFloat(a.vaultWithdrawable);
    return acc + (isNaN(val) ? 0 : val);
  }, 0);
  const tvlNum = parseFloat(tvl);
  const withdrawPct = tvlNum > 0 ? (totalWithdrawable / tvlNum * 100).toFixed(1) : "0";

  return {
    source: "morpho-api",
    address: v.address,
    name: v.name,
    symbol: v.symbol,
    asset: v.asset,
    tvl,
    fee: `${(v.state.fee * 100).toFixed(1)}%`,
    apy: v.state.apy !== null ? `${(v.state.apy * 100).toFixed(2)}%` : null,
    netApy: v.state.netApy !== null ? `${(v.state.netApy * 100).toFixed(2)}%` : null,
    curator: v.state.curator,
    totalMarkets: allocations.length,
    withdrawalLiquidity: {
      totalWithdrawable: totalWithdrawable.toFixed(4),
      percentOfTvl: `${withdrawPct}%`,
    },
    allocations,
  };
}

// ─── RPC fallback ──────────────────────────────────────────────────────────
async function fetchFromRPC(
  vaultAddress: Address,
  network: NetworkName
) {
  const client = getClient(network);
  const morphoAddr = MORPHO_CONTRACTS.mainnet.morpho;

  // Get vault metadata + queue lengths in parallel
  const [name, symbol, asset, totalAssets, fee, curator, supplyQueueLen, withdrawQueueLen] =
    await Promise.all([
      client.readContract({ address: vaultAddress, abi: metaMorphoAbi, functionName: "name" }),
      client.readContract({ address: vaultAddress, abi: metaMorphoAbi, functionName: "symbol" }),
      client.readContract({ address: vaultAddress, abi: metaMorphoAbi, functionName: "asset" }),
      client.readContract({ address: vaultAddress, abi: metaMorphoAbi, functionName: "totalAssets" }),
      client.readContract({ address: vaultAddress, abi: metaMorphoAbi, functionName: "fee" }),
      client.readContract({ address: vaultAddress, abi: metaMorphoAbi, functionName: "curator" }),
      client.readContract({ address: vaultAddress, abi: metaMorphoAbi, functionName: "supplyQueueLength" }),
      client.readContract({ address: vaultAddress, abi: metaMorphoAbi, functionName: "withdrawQueueLength" }),
    ]);

  const assetAddr = asset as Address;
  const [assetSymbol, assetDecimals] = await Promise.all([
    client.readContract({ address: assetAddr, abi: erc20Abi, functionName: "symbol" }).catch(() => "N/A"),
    client.readContract({ address: assetAddr, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
  ]);

  const totalAssetsVal = totalAssets as bigint;
  const dec = assetDecimals as number;

  // Read withdraw queue market IDs (these are the markets the vault is deployed to)
  const wqLen = Number(withdrawQueueLen as bigint);
  const marketIds: `0x${string}`[] = [];

  if (wqLen > 0) {
    const queueReads = Array.from({ length: wqLen }, (_, i) =>
      client.readContract({
        address: vaultAddress,
        abi: metaMorphoAbi,
        functionName: "withdrawQueue",
        args: [BigInt(i)],
      })
    );
    const ids = await Promise.all(queueReads);
    marketIds.push(...ids.map((id) => id as `0x${string}`));
  }

  // For each market: get vault's position, market state, config, and params
  const allocations = await Promise.all(
    marketIds.map(async (marketId) => {
      const [position, marketState, vaultConfig, params] = await Promise.all([
        client.readContract({
          address: morphoAddr,
          abi: morphoAbi,
          functionName: "position",
          args: [marketId, vaultAddress],
        }),
        client.readContract({
          address: morphoAddr,
          abi: morphoAbi,
          functionName: "market",
          args: [marketId],
        }),
        client.readContract({
          address: vaultAddress,
          abi: metaMorphoAbi,
          functionName: "config",
          args: [marketId],
        }),
        client.readContract({
          address: morphoAddr,
          abi: morphoAbi,
          functionName: "idToMarketParams",
          args: [marketId],
        }),
      ]);

      // Resolve token symbols
      const knownLoan = getTokenByAddress(network, params.loanToken as string);
      const knownCollateral = getTokenByAddress(network, params.collateralToken as string);

      const loanSymbol = knownLoan?.symbol ?? await client.readContract({
        address: params.loanToken as Address, abi: erc20Abi, functionName: "symbol",
      }).catch(() => "N/A") as string;
      const loanDecimals = knownLoan?.decimals ?? await client.readContract({
        address: params.loanToken as Address, abi: erc20Abi, functionName: "decimals",
      }).catch(() => 18) as number;
      const collateralSymbol = knownCollateral?.symbol ?? await client.readContract({
        address: params.collateralToken as Address, abi: erc20Abi, functionName: "symbol",
      }).catch(() => "N/A") as string;

      const totalSupplyAssets = marketState[0] as bigint;
      const totalBorrowAssets = marketState[2] as bigint;
      const marketLiquidity = totalSupplyAssets - totalBorrowAssets;
      const utilization = totalSupplyAssets > 0n
        ? Number((totalBorrowAssets * 10000n) / totalSupplyAssets) / 100
        : 0;

      // Convert vault's supply shares to assets
      const vaultSupplyShares = position[0] as bigint;
      const totalSupplyShares = marketState[1] as bigint;
      const vaultSupplyAssets = totalSupplyShares > 0n
        ? (vaultSupplyShares * totalSupplyAssets) / totalSupplyShares
        : 0n;

      const vaultWithdrawable = vaultSupplyAssets <= marketLiquidity ? vaultSupplyAssets : marketLiquidity;

      const cap = vaultConfig[0] as bigint;
      const enabled = vaultConfig[1] as boolean;

      return {
        marketId,
        loanToken: loanSymbol,
        collateralToken: collateralSymbol,
        lltv: `${(Number(params.lltv) / 1e16).toFixed(1)}%`,
        vaultSupply: formatUnits(vaultSupplyAssets, loanDecimals),
        vaultSupplyPct: totalAssetsVal > 0n
          ? `${(Number(vaultSupplyAssets * 10000n / totalAssetsVal) / 100).toFixed(1)}%`
          : "0%",
        supplyCap: formatUnits(cap, loanDecimals),
        enabled,
        marketTotalSupply: formatUnits(totalSupplyAssets, loanDecimals),
        marketTotalBorrow: formatUnits(totalBorrowAssets, loanDecimals),
        marketLiquidity: formatUnits(marketLiquidity, loanDecimals),
        utilization: `${utilization.toFixed(2)}%`,
        vaultWithdrawable: formatUnits(vaultWithdrawable, loanDecimals),
      };
    })
  );

  // Aggregate
  const totalWithdrawable = allocations.reduce((acc, a) => {
    const val = parseFloat(a.vaultWithdrawable);
    return acc + (isNaN(val) ? 0 : val);
  }, 0);
  const tvlNum = parseFloat(formatUnits(totalAssetsVal, dec));
  const withdrawPct = tvlNum > 0 ? (totalWithdrawable / tvlNum * 100).toFixed(1) : "0";

  return {
    source: "rpc-fallback",
    address: vaultAddress,
    name: name as string,
    symbol: symbol as string,
    asset: { address: assetAddr, symbol: assetSymbol as string, decimals: dec },
    tvl: formatUnits(totalAssetsVal, dec),
    fee: `${Number(fee as bigint) / 1e16}%`,
    apy: null,
    netApy: null,
    curator: curator as string,
    supplyQueueLength: Number(supplyQueueLen as bigint),
    withdrawQueueLength: wqLen,
    totalMarkets: allocations.length,
    withdrawalLiquidity: {
      totalWithdrawable: totalWithdrawable.toFixed(4),
      percentOfTvl: `${withdrawPct}%`,
    },
    allocations,
  };
}

// ─── Tool registration ─────────────────────────────────────────────────────

const inputSchema = {
  vault: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
    .describe("MetaMorpho vault address (from list_morpho_vaults)"),
  network: z
    .enum(["mainnet", "testnet"])
    .default("mainnet")
    .describe("Katana mainnet or Bokuto testnet"),
};

export function registerGetVaultDetail(server: McpServer) {
  server.registerTool(
    "get_morpho_vault_detail",
    {
      description:
        "Get detailed breakdown of a MetaMorpho vault's market allocations on Katana. Shows which Morpho Blue markets the vault deploys capital to, how much is allocated to each, supply caps, market utilization, and withdrawal liquidity per market. Uses the Morpho Blue GraphQL API for rich pre-aggregated data (APY, allocations) with automatic RPC fallback. Essential for risk analysis and understanding vault composition.",
      inputSchema,
    },
    async ({ vault, network }) => {
      const net = network as NetworkName;
      const vaultAddr = vault as Address;

      // Try Morpho GraphQL API first (richer data: APY, pre-aggregated)
      try {
        const gqlData = await fetchFromGraphQL(vault);
        const result = formatGqlResult(gqlData);

        if (result) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          };
        }
        // Vault not found in API — fall through to RPC
      } catch {
        // API unavailable or errored — fall through to RPC
      }

      // RPC fallback: read on-chain directly
      const result = await fetchFromRPC(vaultAddr, net);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
