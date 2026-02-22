// Morpho GeneralAdapter1 — wraps Morpho operations for Bundler3
// Only callable via Bundler3 (protected modifier), reads user via initiator()

const marketParamsComponents = [
  { name: "loanToken", type: "address" },
  { name: "collateralToken", type: "address" },
  { name: "oracle", type: "address" },
  { name: "irm", type: "address" },
  { name: "lltv", type: "uint256" },
] as const;

export const generalAdapter1Abi = [
  // ─── ERC20 Operations ──────────────────────────────────────────
  {
    type: "function",
    name: "erc20TransferFrom",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "erc20Transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "receiver", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },

  // ─── Morpho Flash Loan ─────────────────────────────────────────
  {
    type: "function",
    name: "morphoFlashLoan",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "assets", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
  },

  // ─── Morpho Supply Collateral ──────────────────────────────────
  {
    type: "function",
    name: "morphoSupplyCollateral",
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

  // ─── Morpho Borrow ────────────────────────────────────────────
  {
    type: "function",
    name: "morphoBorrow",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "marketParams",
        type: "tuple",
        components: marketParamsComponents,
      },
      { name: "assets", type: "uint256" },
      { name: "shares", type: "uint256" },
      { name: "slippageAmount", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    outputs: [],
  },
] as const;
