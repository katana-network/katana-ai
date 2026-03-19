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
      factory: "getPool(address tokenA, address tokenB, uint24 fee)→address",
      router: "exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96))→uint256 amountOut",
      positionManager: "mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline))→(uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) | increaseLiquidity((uint256 tokenId, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, uint256 deadline))→(uint128 liquidity, uint256 amount0, uint256 amount1) | collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max))→(uint256 amount0, uint256 amount1)",
      quoter: "quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96))→(uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
      pool: "slot0()→(uint160 sqrtPriceX96, int24 tick, ...) | observe(uint32[] secondsAgos)→(int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128s) | liquidity()→uint128",
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
      morpho: "supply((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) | borrow(marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) | withdraw(marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) | supplyCollateral(marketParams, uint256 assets, address onBehalf, bytes data) | repay(marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) | position(bytes32 id, address user)→(uint256 supplyShares, uint128 borrowShares, uint128 collateral) | market(bytes32 id)→(uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee) | idToMarketParams(bytes32 id)→(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) | setAuthorization(address authorized, bool newIsAuthorized) | flashLoan(address token, uint256 assets, bytes data)",
      bundler3: "multicall((address to, bytes data, uint256 value, bool skipRevert, bytes32 callbackHash)[] calls) | reenter(Call[] calls)",
    },
  },
  merkl: {
    distributor: "0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae",
    api: "https://api.merkl.xyz/v4",
    keyFunctions: {
      distributor: "claim(address[] users, address[] tokens, uint256[] amounts, bytes32[][] proofs) | claimed(address user, address token)→uint256 cumulative | toggleOperator(address user, address operator) | getMerkleRoot()→bytes32",
    },
    claimFlow: {
      step1: "GET /v4/users/{address}/rewards?chainId=747474 → returns [{chain, rewards: [{amount, claimed, proofs[], token: {address, decimals, symbol, price}}]}]",
      step2: "Filter rewards where BigInt(amount) - BigInt(claimed) > 0 and proofs.length > 0",
      step3: "Build parallel arrays: users[] (repeat user addr per token), tokens[], amounts[] (CUMULATIVE total from API, NOT the delta), proofs[][]",
      step4: "Call distributor.claim(users, tokens, amounts, proofs) — batches all tokens in one tx",
      operator: "toggleOperator(user, operator) lets another address claim on the user's behalf. Not needed for self-claims.",
      timing: "Rewards computed offchain ~2h, merkle root pushed onchain ~8h. Proofs may lag behind displayed rewards.",
    },
  },
  kat: {
    token: "0x7F1f4b4b29f5058fA32CC7a97141b8D7e5ABDC2d",
    votingEscrow: "0x4d6fC15Ca6258b168225D283262743C623c13Ead",
    nftLock: "0x106F7D67Ea25Cb9eFf5064CF604ebf6259Ff296d",
    avKatVault: "0x7231dbaCdFc968E07656D12389AB20De82FbfCeB",
    gaugeVoter: "0x5e755A3C5dc81A79DE7a7cEF192FFA60964c9352",
    compoundStrategy: "0x60233D1c150F9C08D886906d597aA79a205b0463",
    exitQueue: "0x6dE9cAAb658C744aD337Ca5d92D084c97ffF578d",
    clock: "0x17049d374A2bcdA70F8939C21ad92bcF6B2A95ab",
    swapper: "0x92D2e00b6D2BB50B87a9BE971a82B1F00ac44768",
    note: "KAT is fully transferable. All transfers, staking, and vault deposits are enabled.",
    keyFunctions: {
      votingEscrow: "createLock(uint256 amount)→uint256 tokenId | beginWithdrawal(uint256 tokenId) | withdraw(uint256 tokenId) | cancelWithdrawalRequest(uint256 tokenId) | resetVotesAndBeginWithdrawal(uint256 tokenId) | merge(uint256 fromTokenId, uint256 toTokenId) | split(uint256 tokenId, uint256 amount)→uint256 newTokenId | locked(uint256 tokenId)→(uint256 amount, uint256 start) | votingPower(uint256 tokenId)→uint256",
      vault: "deposit(uint256 assets, address receiver)→uint256 shares | redeem(uint256 shares, address receiver, address owner)→uint256 assets | convertToShares(uint256 assets)→uint256 | convertToAssets(uint256 shares)→uint256",
      gaugeVoter: "vote(uint256 tokenId, (address gauge, uint256 weight)[]) | reset(uint256 tokenId) | getAllGauges()→address[] | getActiveGauges()→address[]",
      token: "transfer(address to, uint256 amount)→bool | approve(address spender, uint256 amount)→bool",
    },
    exitFee: {
      cooldown: "45 days (3888000 seconds)",
      minFee: "2.5% (250 bps) — after full cooldown",
      maxFee: "25% (2500 bps) — immediate rage quit",
      formula: "fee = 25% - ((25% - 2.5%) × daysWaited / 45)",
    },
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
    AUSD: { address: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a", decimals: 6 },
    LBTC: { address: "0xecAc9C5F704e954931349Da37F60E39f515c11c1", decimals: 8 },
    weETH: { address: "0x9893989433e7a383Cb313953e4c2365107dc19a7", decimals: 18 },
    wstETH: { address: "0x7Fb4D0f51544F24F385a421Db6e7D4fC71Ad8e5C", decimals: 18 },
    MORPHO: { address: "0x1e5eFCA3D0dB2c6d5C67a4491845c43253eB9e4e", decimals: 18 },
    SUSHI: { address: "0x17BFF452dae47e07CeA877Ff0E1aba17eB62b0aB", decimals: 18 },
    avKAT: { address: "0x7231dbaCdFc968E07656D12389AB20De82FbfCeB", decimals: 18, note: "ERC-4626 vault token, auto-compounding KAT" },
    vKAT: { address: "0x106F7D67Ea25Cb9eFf5064CF604ebf6259Ff296d", decimals: 0, note: "NFT (non-fungible lock position, not swappable)" },
    jitoSOL: { address: "0x6C16E26013f2431e8B2e1Ba7067ECCcad0Db6C52", decimals: 18 },
    BTCK: { address: "0xB0F70C0bD6FD87dbEb7C10dC692a2a6106817072", decimals: 8 },
    POL: { address: "0xb24e3035d1FCBC0E43CF3143C3Fd92E53df2009b", decimals: 18 },
    YFI: { address: "0x476eaCd417cD65421bD34fca054377658BB5E02b", decimals: 18 },
    uSOL: { address: "0x9B8Df6E244526ab5F6e6400d331DB28C8fdDdb55", decimals: 18, note: "Universal Token" },
    uSUI: { address: "0xb0505e5a99abd03d94a1169e638B78EDfEd26ea4", decimals: 18, note: "Universal Token" },
    uADA: { address: "0xa3A34A0D9A08CCDDB6Ed422Ac0A28a06731335aA", decimals: 18, note: "Universal Token" },
    uXRP: { address: "0x2615a94df961278DcbC41Fb0a54fEc5f10a693aE", decimals: 18, note: "Universal Token" },
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
