import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const REFERENCE = {
  chainId: 747474,
  sushi: {
    v3Factory: "0x203e8740894c8955cB8950759876d7E7E45E04c1",
    v3PositionManager: "0x2659C6085D26144117D904C46B48B6d180393d27",
    v3SwapRouter: "0x4e1d81A3E627b9294532e990109e4c21d217376C",
    v3QuoterV2: "0x92dea23ED1C683940fF1a2f8fE23FE98C5d3041c",
    v3TickLens: "0x35DC3E13469E980c37b6F288BBb9822B1f9bD435",
    v2Router: "0x69cC349932ae18ED406eeB917d79b9b3033fB68E",
    v2Factory: "0x72D111b4d6f31B38919ae39779f570b747d6Acd9",
    v3FeeTiers: [100, 500, 3000, 10000],
    keyFunctions: {
      factory: "getPool(address,address,uint24)→address",
      router: "exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))→uint256",
      positionManager: "mint((...))→(uint256 tokenId,uint128,uint256,uint256) | increaseLiquidity((uint256 tokenId,uint256,uint256,uint256,uint256,uint256))→(uint128,uint256,uint256) | collect((uint256 tokenId,address,uint128,uint128))→(uint256,uint256)",
      quoter: "quoteExactInputSingle((address,address,uint256,uint24,uint160))→(uint256,uint160,uint32,uint256)",
      pool: "slot0()→(uint160 sqrtPriceX96,int24 tick,...) | observe(uint32[])→(int56[],uint160[]) | liquidity()→uint128",
    },
  },
  morpho: {
    morpho: "0xD50F2DffFd62f94Ee4AEd9ca05C61d0753268aBc",
    bundler3: "0xA8C5e23C9C0DF2b6fF716486c6bBEBB6661548C8",
    generalAdapter1: "0x916Aa175C36E845db45fF6DDB886AE437d403B61",
    metaMorphoFactory: "0x1c8de6889acee12257899bfeaa2b7e534de32e16",
    adaptiveCurveIrm: "0x4F708C0ae7deD3d74736594C2109C2E3c065B428",
    oracleFactory: "0x7D047fB910Bc187C18C81a69E30Fa164f8c536eC",
    keyFunctions: {
      morpho: "supply((address,address,address,address,uint256),uint256,uint256,address,bytes) | borrow(...) | withdraw(...) | supplyCollateral(...) | repay(...) | position(bytes32,address)→(uint256,uint128,uint128) | market(bytes32)→(uint128,uint128,uint128,uint128,uint128,uint128) | idToMarketParams(bytes32)→(address,address,address,address,uint256) | setAuthorization(address,bool) | flashLoan(address,uint256,bytes)",
      bundler3: "multicall((address to,bytes data,uint256 value,bool skipRevert,bytes32 callbackHash)[]) | reenter(Call[])",
    },
  },
  merkl: {
    distributor: "0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae",
    api: "https://api.merkl.xyz/v4",
    keyFunctions: {
      distributor: "claim(address[] users,address[] tokens,uint256[] amounts,bytes32[][] proofs) | claimed(address,address)→uint256 | toggleOperator(address user,address operator) | getMerkleRoot()→bytes32",
    },
    note: "amounts in claim() are CUMULATIVE totals, not deltas. Proofs from API, updated ~8h.",
  },
  infra: {
    multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    entryPoint: "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108",
  },
  tokens: {
    KAT: { address: "0x7f1f4b4b29f5058fa32cc7a97141b8d7e5abdc2d", decimals: 18 },
    WETH: { address: "0xEE7D8BCFb72bC1880D0Cf19822eB0A2e6577aB62", decimals: 18, note: "vbETH, yield-generating WETH9" },
    WBTC: { address: "0x0913DA6Da4b42f538B445599b46Bb4622342Cf52", decimals: 8 },
    USDC: { address: "0x203A662b0BD271A6ed5a60EdFbd04bFce608FD36", decimals: 6 },
    USDT: { address: "0x2DCa96907fde857dd3D816880A0df407eeB2D2F2", decimals: 6 },
    USDS: { address: "0x62D6A123E8D19d06d68cf0d2294F9A3A0362c6b3", decimals: 18 },
    AUSD: { address: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a", decimals: 18 },
    LBTC: { address: "0xecAc9C5F704e954931349Da37F60E39f515c11c1", decimals: 8 },
    weETH: { address: "0x9893989433e7a383Cb313953e4c2365107dc19a7", decimals: 18 },
    wstETH: { address: "0x7Fb4D0f51544F24F385a421Db6e7D4fC71Ad8e5C", decimals: 18 },
    MORPHO: { address: "0x1e5eFCA3D0dB2c6d5C67a4491845c43253eB9e4e", decimals: 18 },
    SUSHI: { address: "0x17BFF452dae47e07CeA877Ff0E1aba17eB62b0aB", decimals: 18 },
  },
};

// Pre-stringify once at startup
const REFERENCE_JSON = JSON.stringify(REFERENCE);

export function registerContractReference(server: McpServer) {
  server.registerTool(
    "get_contract_reference",
    {
      description:
        "Static reference of all Katana contract addresses, key function signatures, token list, and protocol details. No RPC calls — instant response. Use this first when building transactions, designing integrations, or exploring what's available on Katana.",
      inputSchema: {},
    },
    async () => ({
      content: [{ type: "text" as const, text: REFERENCE_JSON }],
    })
  );
}
