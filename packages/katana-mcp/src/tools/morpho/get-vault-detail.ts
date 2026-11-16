import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatUnits, type Address } from "viem";
import { getClient } from "../../clients.js";
import { MORPHO_CONTRACTS, getTokenByAddress, type NetworkName } from "../../config/contracts.js";
import { metaMorphoAbi } from "../../abis/metamorpho.js";
import { morphoAbi } from "../../abis/morpho.js";
import { erc20Abi } from "../../abis/erc20.js";
import {
  morphoQuery,
  useMorphoApi,
  MorphoApiNotFound,
  formatWarnings,
  pct,
  usd,
  IMPLAUSIBLE_APY,
  type ApiWarning,
} from "./morpho-api.js";

// ─── Morpho API (Katana only — see morpho-api.ts) ──────────────────────────

const VAULT_DETAIL_QUERY = `
  query VaultDetail($address: String!, $chainId: Int!) {
    vaultByAddress(address: $address, chainId: $chainId) {
      address
      name
      symbol
      listed
      warnings { type level }
      asset {
        address
        symbol
        decimals
      }
      state {
        totalAssets
        totalAssetsUsd
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
    listed: boolean;
    warnings: ApiWarning[];
    asset: { address: string; symbol: string; decimals: number };
    state: {
      totalAssets: string;
      totalAssetsUsd: number | null;
      fee: number;
      curator: string;
      apy: number;
      netApy: number;
      allocation: GqlAllocation[];
    } | null;
  } | null;
}

async function fetchFromGraphQL(vaultAddress: string) {
  return morphoQuery<GqlVaultDetail>(VAULT_DETAIL_QUERY, { address: vaultAddress });
}

// ─── Vault V2 (Morpho API only) ────────────────────────────────────────────

const VAULT_V2_QUERY = `
  query VaultV2Detail($address: String!, $chainId: Int!) {
    vaultV2ByAddress(address: $address, chainId: $chainId) {
      address name symbol listed
      asset { address symbol decimals }
      totalAssets totalAssetsUsd liquidity liquidityUsd idleAssets
      apy netApy performanceFee managementFee
      curator { address } owner { address }
      adapters { items { address type assets assetsUsd } }
      caps { items { type absoluteCap relativeCap allocation } }
      warnings { type level }
    }
  }
`;

interface GqlVaultV2 {
  vaultV2ByAddress: {
    address: string;
    name: string;
    symbol: string;
    listed: boolean;
    asset: { address: string; symbol: string; decimals: number };
    totalAssets: string;
    totalAssetsUsd: number | null;
    liquidity: string;
    liquidityUsd: number | null;
    idleAssets: string;
    apy: number | null;
    netApy: number | null;
    performanceFee: number | null;
    managementFee: number | null;
    curator: { address: string } | null;
    owner: { address: string } | null;
    adapters: { items: { address: string; type: string; assets: string; assetsUsd: number | null }[] };
    caps: { items: { type: string; absoluteCap: string; relativeCap: string; allocation: string | number }[] };
    warnings: ApiWarning[];
  } | null;
}

async function fetchVaultV2(vaultAddress: string) {
  const data = await morphoQuery<GqlVaultV2>(VAULT_V2_QUERY, { address: vaultAddress });
  const v = data.vaultV2ByAddress;
  if (!v) return null;
  const d = v.asset.decimals;
  const tvl = formatUnits(BigInt(v.totalAssets), d);
  const liquidity = formatUnits(BigInt(v.liquidity), d);
  const tvlNum = parseFloat(tvl);
  const warnings = formatWarnings(v.warnings);
  if (v.netApy !== null && v.netApy > IMPLAUSIBLE_APY) warnings.push("UNVERIFIED:implausible_apy");
  return {
    source: "morpho-api",
    version: "v2",
    address: v.address,
    name: v.name,
    symbol: v.symbol,
    asset: v.asset,
    tvl,
    tvlUsd: usd(v.totalAssetsUsd),
    apy: pct(v.apy),
    netApy: pct(v.netApy),
    performanceFee: pct(v.performanceFee, 1),
    managementFee: pct(v.managementFee, 1),
    curator: v.curator?.address ?? null,
    owner: v.owner?.address ?? null,
    listed: v.listed,
    warnings,
    withdrawalLiquidity: {
      totalWithdrawable: liquidity,
      totalWithdrawableUsd: usd(v.liquidityUsd),
      percentOfTvl: tvlNum > 0 ? `${((parseFloat(liquidity) / tvlNum) * 100).toFixed(1)}%` : "0%",
    },
    idle: formatUnits(BigInt(v.idleAssets), d),
    adapters: v.adapters.items.map((a) => ({
      address: a.address,
      type: a.type,
      assets: formatUnits(BigInt(a.assets), d),
      assetsUsd: usd(a.assetsUsd),
    })),
    caps: v.caps.items.map((c) => ({
      type: c.type,
      absoluteCap: formatUnits(BigInt(c.absoluteCap), d),
      relativeCap: `${(Number(BigInt(c.relativeCap)) / 1e16).toFixed(1)}%`,
      allocation: formatUnits(BigInt(c.allocation), d),
    })),
    note: "Vault V2 allocates through adapters (e.g. MorphoMarketV1 = Morpho Blue markets) under per-adapter, per-collateral and per-market caps.",
  };
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

  const warnings = formatWarnings(v.warnings);
  if (v.state.netApy !== null && v.state.netApy > IMPLAUSIBLE_APY) warnings.push("UNVERIFIED:implausible_apy");

  return {
    source: "morpho-api",
    version: "v1",
    address: v.address,
    name: v.name,
    symbol: v.symbol,
    asset: v.asset,
    tvl,
    tvlUsd: usd(v.state.totalAssetsUsd),
    listed: v.listed,
    warnings,
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
    version: "v1",
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
    .describe("Morpho vault address — MetaMorpho (v1) or Vault V2 (from list_morpho_vaults)"),
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
        "Get a detailed breakdown of a Morpho vault on Katana — MetaMorpho (v1) or Vault V2. For v1: which Morpho Blue markets the vault deploys capital to, allocation per market, supply caps, utilization and withdrawal liquidity per market. For V2: adapters, caps, idle assets and withdrawable liquidity. On mainnet uses the Morpho API (Katana only), adding APY, USD values, listing status and risk warnings; falls back to on-chain reads (v1 only) if the API is unavailable, and on testnet. Essential for risk analysis and understanding vault composition.",
      inputSchema,
    },
    async ({ vault, network }) => {
      const net = network as NetworkName;
      const vaultAddr = vault as Address;

      // Morpho API covers Katana mainnet only — testnet goes straight to RPC
      if (useMorphoApi(net)) {
        let apiReachable = true;
        // 1. MetaMorpho (v1)
        try {
          const result = formatGqlResult(await fetchFromGraphQL(vault));
          if (result) {
            return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
          }
        } catch (e) {
          if (!(e instanceof MorphoApiNotFound)) apiReachable = false;
        }
        // 2. Not a v1 vault — try Vault V2
        if (apiReachable) {
          try {
            const v2 = await fetchVaultV2(vault);
            if (v2) {
              return { content: [{ type: "text" as const, text: JSON.stringify(v2, null, 2) }] };
            }
          } catch {
            // not a V2 either, or API error — fall through to on-chain v1 reads
          }
        }
      }

      // RPC fallback: read on-chain directly
      const result = await fetchFromRPC(vaultAddr, net);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
