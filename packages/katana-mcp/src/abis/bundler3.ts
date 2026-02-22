// Morpho Bundler3 — stateless call dispatcher for atomic multi-step operations
// Call struct: { to, data, value, skipRevert, callbackHash }

export const callComponents = [
  { name: "to", type: "address" as const },
  { name: "data", type: "bytes" as const },
  { name: "value", type: "uint256" as const },
  { name: "skipRevert", type: "bool" as const },
  { name: "callbackHash", type: "bytes32" as const },
] as const;

export const bundler3Abi = [
  {
    type: "function",
    name: "multicall",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: callComponents,
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "reenter",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: callComponents,
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "initiator",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;
