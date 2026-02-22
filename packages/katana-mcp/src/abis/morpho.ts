// Morpho Blue core contract ABI
// MarketParams = { loanToken, collateralToken, oracle, irm, lltv }
// Id = bytes32 (keccak256 hash of MarketParams)

const marketParamsComponents = [
  { name: "loanToken", type: "address" },
  { name: "collateralToken", type: "address" },
  { name: "oracle", type: "address" },
  { name: "irm", type: "address" },
  { name: "lltv", type: "uint256" },
] as const;

export const morphoAbi = [
  // ─── Read Functions ──────────────────────────────────────────────
  {
    type: "function",
    name: "market",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [
      { name: "totalSupplyAssets", type: "uint128" },
      { name: "totalSupplyShares", type: "uint128" },
      { name: "totalBorrowAssets", type: "uint128" },
      { name: "totalBorrowShares", type: "uint128" },
      { name: "lastUpdate", type: "uint128" },
      { name: "fee", type: "uint128" },
    ],
  },
  {
    type: "function",
    name: "position",
    stateMutability: "view",
    inputs: [
      { name: "id", type: "bytes32" },
      { name: "user", type: "address" },
    ],
    outputs: [
      { name: "supplyShares", type: "uint256" },
      { name: "borrowShares", type: "uint128" },
      { name: "collateral", type: "uint128" },
    ],
  },
  {
    type: "function",
    name: "idToMarketParams",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: marketParamsComponents,
      },
    ],
  },

  // ─── Supply / Withdraw ───────────────────────────────────────────
  {
    type: "function",
    name: "supply",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "marketParams",
        type: "tuple",
        components: marketParamsComponents,
      },
      { name: "assets", type: "uint256" },
      { name: "shares", type: "uint256" },
      { name: "onBehalf", type: "address" },
      { name: "data", type: "bytes" },
    ],
    outputs: [
      { name: "assetsSupplied", type: "uint256" },
      { name: "sharesSupplied", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "marketParams",
        type: "tuple",
        components: marketParamsComponents,
      },
      { name: "assets", type: "uint256" },
      { name: "shares", type: "uint256" },
      { name: "onBehalf", type: "address" },
      { name: "receiver", type: "address" },
    ],
    outputs: [
      { name: "assetsWithdrawn", type: "uint256" },
      { name: "sharesWithdrawn", type: "uint256" },
    ],
  },

  // ─── Borrow / Repay ──────────────────────────────────────────────
  {
    type: "function",
    name: "borrow",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "marketParams",
        type: "tuple",
        components: marketParamsComponents,
      },
      { name: "assets", type: "uint256" },
      { name: "shares", type: "uint256" },
      { name: "onBehalf", type: "address" },
      { name: "receiver", type: "address" },
    ],
    outputs: [
      { name: "assetsBorrowed", type: "uint256" },
      { name: "sharesBorrowed", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "repay",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "marketParams",
        type: "tuple",
        components: marketParamsComponents,
      },
      { name: "assets", type: "uint256" },
      { name: "shares", type: "uint256" },
      { name: "onBehalf", type: "address" },
      { name: "data", type: "bytes" },
    ],
    outputs: [
      { name: "assetsRepaid", type: "uint256" },
      { name: "sharesRepaid", type: "uint256" },
    ],
  },

  // ─── Collateral ──────────────────────────────────────────────────
  {
    type: "function",
    name: "supplyCollateral",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "marketParams",
        type: "tuple",
        components: marketParamsComponents,
      },
      { name: "assets", type: "uint256" },
      { name: "onBehalf", type: "address" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawCollateral",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "marketParams",
        type: "tuple",
        components: marketParamsComponents,
      },
      { name: "assets", type: "uint256" },
      { name: "onBehalf", type: "address" },
      { name: "receiver", type: "address" },
    ],
    outputs: [],
  },

  // ─── Interest ────────────────────────────────────────────────────
  {
    type: "function",
    name: "accrueInterest",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "marketParams",
        type: "tuple",
        components: marketParamsComponents,
      },
    ],
    outputs: [],
  },

  // ─── Flash Loan ─────────────────────────────────────────────────
  {
    type: "function",
    name: "flashLoan",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "assets", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
  },

  // ─── Authorization ─────────────────────────────────────────────
  {
    type: "function",
    name: "setAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "authorized", type: "address" },
      { name: "newIsAuthorized", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isAuthorized",
    stateMutability: "view",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "authorized", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },

  // ─── Events ────────────────────────────────────────────────────
  {
    type: "event",
    name: "CreateMarket",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      {
        name: "marketParams",
        type: "tuple",
        indexed: false,
        components: marketParamsComponents,
      },
    ],
  },
] as const;
