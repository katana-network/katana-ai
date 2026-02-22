// SushiSwap V3 TickLens — reads populated ticks from a pool
export const sushiV3TickLensAbi = [
  {
    type: "function",
    name: "getPopulatedTicksInWord",
    stateMutability: "view",
    inputs: [
      { name: "pool", type: "address" },
      { name: "tickBitmapIndex", type: "int16" },
    ],
    outputs: [
      {
        name: "populatedTicks",
        type: "tuple[]",
        components: [
          { name: "tick", type: "int24" },
          { name: "liquidityNet", type: "int128" },
          { name: "liquidityGross", type: "uint128" },
        ],
      },
    ],
  },
] as const;
