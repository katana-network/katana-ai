import { zeroAddress, type Address } from "viem";
import { getClient } from "../../clients.js";
import {
  SUSHI_CONTRACTS,
  MAINNET_TOKENS,
  type NetworkName,
} from "../../config/contracts.js";
import {
  sushiV3FactoryAbi,
  sushiV3PoolAbi,
} from "../../abis/sushi-v3-factory.js";
import { V3_FEE_TIERS } from "../sushi/utils.js";

// ─── Price from sqrtPriceX96 ─────────────────────────────────────────────────

function priceFromSqrt(
  sqrtPriceX96: bigint,
  decimals0: number,
  decimals1: number
): number {
  const price = Number(sqrtPriceX96) / 2 ** 96;
  return price * price * 10 ** (decimals0 - decimals1);
}

// ─── Find best pool and get spot price ───────────────────────────────────────

interface PoolPrice {
  pool: Address;
  fee: number;
  price: number; // tokenA per tokenB
  liquidity: string;
}

export async function getBestPoolPrice(
  client: ReturnType<typeof getClient>,
  factory: Address,
  tokenA: Address,
  tokenB: Address,
  decimalsA: number,
  decimalsB: number
): Promise<PoolPrice | null> {
  const results = await Promise.allSettled(
    V3_FEE_TIERS.map(async (fee) => {
      const poolAddr = await client.readContract({
        address: factory,
        abi: sushiV3FactoryAbi,
        functionName: "getPool",
        args: [tokenA, tokenB, fee],
      });

      if (poolAddr === zeroAddress) return null;

      const [slot0, liquidity, token0] = await Promise.all([
        client.readContract({
          address: poolAddr,
          abi: sushiV3PoolAbi,
          functionName: "slot0",
        }),
        client.readContract({
          address: poolAddr,
          abi: sushiV3PoolAbi,
          functionName: "liquidity",
        }),
        client.readContract({
          address: poolAddr,
          abi: sushiV3PoolAbi,
          functionName: "token0",
        }),
      ]);

      const sqrtPriceX96 = slot0[0];
      if (sqrtPriceX96 === 0n) return null;

      const isAToken0 = token0.toLowerCase() === tokenA.toLowerCase();
      const d0 = isAToken0 ? decimalsA : decimalsB;
      const d1 = isAToken0 ? decimalsB : decimalsA;

      const rawPrice = priceFromSqrt(sqrtPriceX96, d0, d1);
      const price = isAToken0 ? rawPrice : 1 / rawPrice;

      return {
        pool: poolAddr,
        fee,
        price,
        liquidity: liquidity.toString(),
      };
    })
  );

  const valid: PoolPrice[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value !== null) {
      valid.push(r.value);
    }
  }

  if (valid.length === 0) return null;

  valid.sort((a, b) => (BigInt(b.liquidity) > BigInt(a.liquidity) ? 1 : -1));
  return valid[0];
}

// ─── Get USD price for a token ───────────────────────────────────────────────

export async function getTokenUsdPrice(
  client: ReturnType<typeof getClient>,
  tokenAddress: Address,
  tokenDecimals: number
): Promise<number | null> {
  const factory = SUSHI_CONTRACTS.mainnet.v3Factory;

  const stables = [
    { address: MAINNET_TOKENS.USDC.address as Address, decimals: 6 },
    { address: MAINNET_TOKENS.USDT.address as Address, decimals: 6 },
  ];

  // Check if it's a stablecoin
  for (const stable of stables) {
    if (tokenAddress.toLowerCase() === stable.address.toLowerCase()) return 1;
  }
  if (
    tokenAddress.toLowerCase() === MAINNET_TOKENS.USDS.address.toLowerCase() ||
    tokenAddress.toLowerCase() === MAINNET_TOKENS.AUSD.address.toLowerCase()
  ) {
    return 1;
  }

  // Try direct stablecoin pool
  for (const stable of stables) {
    const poolPrice = await getBestPoolPrice(
      client,
      factory,
      tokenAddress,
      stable.address,
      tokenDecimals,
      stable.decimals
    );
    if (poolPrice) return poolPrice.price;
  }

  // Route through WETH
  const weth = MAINNET_TOKENS.WETH;
  const ethPool = await getBestPoolPrice(
    client,
    factory,
    tokenAddress,
    weth.address as Address,
    tokenDecimals,
    weth.decimals
  );

  if (ethPool) {
    // Get ETH/USD price
    for (const stable of stables) {
      const ethUsd = await getBestPoolPrice(
        client,
        factory,
        weth.address as Address,
        stable.address,
        weth.decimals,
        stable.decimals
      );
      if (ethUsd) return ethPool.price * ethUsd.price;
    }
  }

  return null;
}
