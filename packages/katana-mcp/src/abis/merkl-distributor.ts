// Merkl Distributor contract ABI — merkle-proof-based reward claiming
export const merklDistributorAbi = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "users", type: "address[]" },
      { name: "tokens", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
      { name: "proofs", type: "bytes32[][]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claimed",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getMerkleRoot",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "toggleOperator",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [],
  },
] as const;
