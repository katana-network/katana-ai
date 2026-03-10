import type { Address } from "viem";
import type { NetworkName } from "./chains.js";

export type { NetworkName };

// ─── Token Addresses ────────────────────────────────────────────────────────

export interface TokenInfo {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
}

export const MAINNET_TOKENS: Record<string, TokenInfo> = {
  KAT: {
    symbol: "KAT",
    name: "Katana",
    address: "0x7f1f4b4b29f5058fa32cc7a97141b8d7e5abdc2d",
    decimals: 18,
  },
  WETH: {
    symbol: "WETH",
    name: "Wrapped ETH (vbETH)",
    address: "0xEE7D8BCFb72bC1880D0Cf19822eB0A2e6577aB62",
    decimals: 18,
  },
  WBTC: {
    symbol: "WBTC",
    name: "Wrapped BTC (vbWBTC)",
    address: "0x0913DA6Da4b42f538B445599b46Bb4622342Cf52",
    decimals: 8,
  },
  USDC: {
    symbol: "USDC",
    name: "USD Coin (vbUSDC)",
    address: "0x203A662b0BD271A6ed5a60EdFbd04bFce608FD36",
    decimals: 6,
  },
  USDT: {
    symbol: "USDT",
    name: "Tether (vbUSDT)",
    address: "0x2DCa96907fde857dd3D816880A0df407eeB2D2F2",
    decimals: 6,
  },
  USDS: {
    symbol: "USDS",
    name: "USDS (vbUSDS)",
    address: "0x62D6A123E8D19d06d68cf0d2294F9A3A0362c6b3",
    decimals: 18,
  },
  AUSD: {
    symbol: "AUSD",
    name: "Agora USD",
    address: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a",
    decimals: 18,
  },
  LBTC: {
    symbol: "LBTC",
    name: "Lombard BTC",
    address: "0xecAc9C5F704e954931349Da37F60E39f515c11c1",
    decimals: 8,
  },
  weETH: {
    symbol: "weETH",
    name: "Wrapped eETH",
    address: "0x9893989433e7a383Cb313953e4c2365107dc19a7",
    decimals: 18,
  },
  wstETH: {
    symbol: "wstETH",
    name: "Wrapped stETH",
    address: "0x7Fb4D0f51544F24F385a421Db6e7D4fC71Ad8e5C",
    decimals: 18,
  },
  MORPHO: {
    symbol: "MORPHO",
    name: "Morpho Token",
    address: "0x1e5eFCA3D0dB2c6d5C67a4491845c43253eB9e4e",
    decimals: 18,
  },
  SUSHI: {
    symbol: "SUSHI",
    name: "SushiSwap",
    address: "0x17BFF452dae47e07CeA877Ff0E1aba17eB62b0aB",
    decimals: 18,
  },
} as const;

export const TESTNET_TOKENS: Record<string, TokenInfo> = {
  WETH: {
    symbol: "WETH",
    name: "Wrapped ETH (vbETH)",
    address: "0x84b3493fA9B125A8EFf1CCc1328Bd84D0B4a2Dbf",
    decimals: 18,
  },
  WBTC: {
    symbol: "WBTC",
    name: "Wrapped BTC (vbWBTC)",
    address: "0xe8255B44634b478aB10a649c6C207A654473dbed",
    decimals: 8,
  },
  USDC: {
    symbol: "USDC",
    name: "USD Coin (vbUSDC)",
    address: "0xc2a4C310F2512A17Ac0047cf871aCAed3E62bB4B",
    decimals: 6,
  },
  USDT: {
    symbol: "USDT",
    name: "Tether (vbUSDT)",
    address: "0xf6801557e17131Da48Fd03B2c34172872F936345",
    decimals: 6,
  },
  USDS: {
    symbol: "USDS",
    name: "USDS (vbUSDS)",
    address: "0x801f719178d9b85D4948ed146C50596273885a75",
    decimals: 18,
  },
} as const;

export function getTokens(network: NetworkName): Record<string, TokenInfo> {
  return network === "mainnet" ? MAINNET_TOKENS : TESTNET_TOKENS;
}

export function getToken(
  network: NetworkName,
  symbol: string
): TokenInfo | undefined {
  const tokens = getTokens(network);
  return tokens[symbol.toUpperCase()];
}

export function getTokenByAddress(
  network: NetworkName,
  address: string
): TokenInfo | undefined {
  const tokens = getTokens(network);
  const lower = address.toLowerCase();
  return Object.values(tokens).find(
    (t) => t.address.toLowerCase() === lower
  );
}

// ─── Sushi DEX Contracts ────────────────────────────────────────────────────

export const SUSHI_CONTRACTS = {
  mainnet: {
    v2Factory: "0x72D111b4d6f31B38919ae39779f570b747d6Acd9" as Address,
    v2Router: "0x69cC349932ae18ED406eeB917d79b9b3033fB68E" as Address,
    v3Factory: "0x203e8740894c8955cB8950759876d7E7E45E04c1" as Address,
    v3PositionManager:
      "0x2659C6085D26144117D904C46B48B6d180393d27" as Address,
    v3QuoterV2: "0x92dea23ED1C683940fF1a2f8fE23FE98C5d3041c" as Address,
    v3SwapRouter: "0x4e1d81A3E627b9294532e990109e4c21d217376C" as Address,
    v3TickLens: "0x35DC3E13469E980c37b6F288BBb9822B1f9bD435" as Address,
    routeProcessor7: "0x3Ced11c610556e5292fBC2e75D68c3899098C14C" as Address,
  },
} as const;

// ─── Morpho Contracts ───────────────────────────────────────────────────────

export const MORPHO_CONTRACTS = {
  mainnet: {
    morpho: "0xD50F2DffFd62f94Ee4AEd9ca05C61d0753268aBc" as Address,
    metaMorphoFactory:
      "0x1c8de6889acee12257899bfeaa2b7e534de32e16" as Address,
    metaMorphoFactoryV1_1:
      "0xd3f39505d0c48AFED3549D625982FdC38Ea9904b" as Address,
    adaptiveCurveIrm:
      "0x4F708C0ae7deD3d74736594C2109C2E3c065B428" as Address,
    oracleFactory: "0x7D047fB910Bc187C18C81a69E30Fa164f8c536eC" as Address,
    publicAllocator: "0x39EB6Da5e88194C82B13491Df2e8B3E213eD2412" as Address,
    bundler3: "0xA8C5e23C9C0DF2b6fF716486c6bBEBB6661548C8" as Address,
    generalAdapter1: "0x916Aa175C36E845db45fF6DDB886AE437d403B61" as Address,
  },
} as const;

// ─── Bridge Contracts ───────────────────────────────────────────────────────

export const BRIDGE_CONTRACTS = {
  mainnet: {
    unifiedBridge: "0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe" as Address,
    bridgeAndCall: "0x64B20Eb25AEd030FD510EF93B9135278B152f6a6" as Address,
    networkId: 20,
  },
  testnet: {
    unifiedBridge: "0x528e26b25a34a4A5d0dbDa1d57D318153d2ED582" as Address,
    bridgeServiceApi: "https://rpc-bridge-bokuto.katanarpc.com/",
    networkId: 37,
  },
} as const;

// ─── Infrastructure ─────────────────────────────────────────────────────────

export const INFRA_CONTRACTS = {
  multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11" as Address,
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address,
  entryPoint: "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108" as Address,
} as const;

// ─── Merkl (Reward Distribution) ────────────────────────────────────────────

export const MERKL_CONTRACTS = {
  distributor: "0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae" as Address,
} as const;

// ─── Price Feeds ────────────────────────────────────────────────────────────

export const PRICE_FEEDS = {
  chainlinkVerifierProxy:
    "0x2a644E5AC685112A7Eff0c4d73CD0260546D366F" as Address,
} as const;

// ─── Katana Perps (Perpetual Futures DEX) ──────────────────────────────────

export const PERPS_CONTRACTS = {
  mainnet: {
    exchange: "0x835Ba5b1B202773A94Daaa07168b26B22584637a" as Address,
  },
  testnet: {
    exchange: "0xcE3765616b9e354E64530875f492dc4DfddF2118" as Address,
  },
} as const;

export const PERPS_API = {
  mainnet: {
    rest: "https://api-perps.katana.network",
    ws: "wss://websocket-perps.katana.network/v1",
  },
  testnet: {
    rest: "https://api-perps-sandbox.katana.network",
    ws: "wss://websocket-perps-sandbox.katana.network/v1",
  },
} as const;

export const PERPS_EIP712_DOMAIN = {
  mainnet: {
    name: "KatanaPerps" as const,
    version: "1.0.0" as const,
    chainId: 747474,
    verifyingContract: "0x835Ba5b1B202773A94Daaa07168b26B22584637a" as Address,
  },
  testnet: {
    name: "KatanaPerps" as const,
    version: "1.0.0-sandbox" as const,
    chainId: 737373,
    verifyingContract: "0xcE3765616b9e354E64530875f492dc4DfddF2118" as Address,
  },
} as const;
