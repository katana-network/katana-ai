import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseUnits, encodeFunctionData, type Address } from "viem";
import { SUSHI_CONTRACTS, type NetworkName } from "../../config/contracts.js";
import { sushiV2RouterAbi } from "../../abis/sushi-v2-router.js";
import { getChain } from "../../config/chains.js";
import { resolveToken, knownTokenList } from "./utils.js";

// V3 NonfungiblePositionManager mint ABI
const nftPositionManagerMintAbi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "token0", type: "address" },
          { name: "token1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickLower", type: "int24" },
          { name: "tickUpper", type: "int24" },
          { name: "amount0Desired", type: "uint256" },
          { name: "amount1Desired", type: "uint256" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
        ],
      },
    ],
    outputs: [
      { name: "tokenId", type: "uint256" },
      { name: "liquidity", type: "uint128" },
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
  },
] as const;

const v3InputSchema = {
  tokenA: z
    .string()
    .describe("First token — symbol (e.g. 'WETH') or contract address"),
  tokenB: z
    .string()
    .describe("Second token — symbol (e.g. 'USDC') or contract address"),
  amountA: z
    .string()
    .describe("Amount of tokenA to provide (human-readable, e.g. '1.0')"),
  amountB: z
    .string()
    .describe("Amount of tokenB to provide (human-readable, e.g. '2000')"),
  fee: z
    .number()
    .default(3000)
    .describe("V3 fee tier: 100, 500, 3000, or 10000. Default: 3000"),
  tickLower: z
    .number()
    .describe("Lower tick boundary for the position"),
  tickUpper: z
    .number()
    .describe("Upper tick boundary for the position"),
  recipient: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
    .describe("Address to receive the LP NFT position"),
  deadlineMinutes: z
    .number()
    .default(20)
    .describe("Transaction deadline in minutes from now"),
  network: z
    .enum(["mainnet", "testnet"])
    .default("mainnet")
    .describe("Katana mainnet or Bokuto testnet"),
};

const v2InputSchema = {
  tokenA: z
    .string()
    .describe("First token — symbol (e.g. 'WETH') or contract address"),
  tokenB: z
    .string()
    .describe("Second token — symbol (e.g. 'USDC') or contract address"),
  amountA: z
    .string()
    .describe("Desired amount of tokenA (human-readable)"),
  amountB: z
    .string()
    .describe("Desired amount of tokenB (human-readable)"),
  slippageBps: z
    .number()
    .default(50)
    .describe("Slippage tolerance in basis points (default 50 = 0.5%)"),
  recipient: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
    .describe("Address to receive LP tokens"),
  deadlineMinutes: z
    .number()
    .default(20)
    .describe("Transaction deadline in minutes from now"),
  network: z
    .enum(["mainnet", "testnet"])
    .default("mainnet")
    .describe("Katana mainnet or Bokuto testnet"),
};

export function registerLiquidity(server: McpServer) {
  // V3 Add Liquidity (mint position NFT)
  // @ts-expect-error TS2589: Zod + MCP SDK deep type inference
  server.registerTool(
    "build_add_liquidity_v3",
    {
      description:
        "Build an unsigned transaction to add liquidity to a SushiSwap V3 pool on Katana. Creates a new concentrated liquidity position as an NFT. You need to specify tick range. Use get_pools first to find the current tick. User must approve the PositionManager to spend both tokens first.",
      inputSchema: v3InputSchema,
    },
    async ({ tokenA, tokenB, amountA, amountB, fee, tickLower, tickUpper, recipient, deadlineMinutes, network }) => {
      const net = network as NetworkName;
      const chain = getChain(net);
      const sushi = SUSHI_CONTRACTS.mainnet;

      const tA = await resolveToken(net, tokenA);
      const tB = await resolveToken(net, tokenB);

      if (!tA) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: `Cannot resolve "${tokenA}". Known: ${knownTokenList(net)}` }) }], isError: true };
      }
      if (!tB) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: `Cannot resolve "${tokenB}". Known: ${knownTokenList(net)}` }) }], isError: true };
      }

      // Sort tokens — V3 requires token0 < token1
      const [token0, token1, amount0, amount1] =
        tA.address.toLowerCase() < tB.address.toLowerCase()
          ? [tA, tB, amountA, amountB]
          : [tB, tA, amountB, amountA];

      const amount0Wei = parseUnits(amount0, token0.decimals);
      const amount1Wei = parseUnits(amount1, token1.decimals);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineMinutes * 60);

      const data = encodeFunctionData({
        abi: nftPositionManagerMintAbi,
        functionName: "mint",
        args: [
          {
            token0: token0.address,
            token1: token1.address,
            fee,
            tickLower,
            tickUpper,
            amount0Desired: amount0Wei,
            amount1Desired: amount1Wei,
            amount0Min: 0n,
            amount1Min: 0n,
            recipient: recipient as Address,
            deadline,
          },
        ],
      });

      const tx = {
        to: sushi.v3PositionManager,
        data,
        value: "0",
        chainId: chain.id,
        description: `Add V3 liquidity: ${amount0} ${token0.symbol} + ${amount1} ${token1.symbol} (fee: ${fee / 10000}%, ticks: ${tickLower}→${tickUpper})`,
        note: `User must approve the PositionManager (${sushi.v3PositionManager}) to spend both tokens first.`,
        positionManagerAddress: sushi.v3PositionManager,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(tx) }],
      };
    }
  );

  // V2 Add Liquidity
  server.registerTool(
    "build_add_liquidity_v2",
    {
      description:
        "Build an unsigned transaction to add liquidity to a SushiSwap V2 pool on Katana. Simpler than V3 — full-range liquidity, no tick management. User must approve the V2 Router to spend both tokens first.",
      inputSchema: v2InputSchema,
    },
    async ({ tokenA, tokenB, amountA, amountB, slippageBps, recipient, deadlineMinutes, network }) => {
      const net = network as NetworkName;
      const chain = getChain(net);
      const sushi = SUSHI_CONTRACTS.mainnet;

      const tA = await resolveToken(net, tokenA);
      const tB = await resolveToken(net, tokenB);

      if (!tA) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: `Cannot resolve "${tokenA}". Known: ${knownTokenList(net)}` }) }], isError: true };
      }
      if (!tB) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: `Cannot resolve "${tokenB}". Known: ${knownTokenList(net)}` }) }], isError: true };
      }

      const amountAWei = parseUnits(amountA, tA.decimals);
      const amountBWei = parseUnits(amountB, tB.decimals);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineMinutes * 60);

      // Apply slippage for minimums
      const amountAMin = (amountAWei * BigInt(10000 - slippageBps)) / 10000n;
      const amountBMin = (amountBWei * BigInt(10000 - slippageBps)) / 10000n;

      const data = encodeFunctionData({
        abi: sushiV2RouterAbi,
        functionName: "addLiquidity",
        args: [
          tA.address,
          tB.address,
          amountAWei,
          amountBWei,
          amountAMin,
          amountBMin,
          recipient as Address,
          deadline,
        ],
      });

      const tx = {
        to: sushi.v2Router,
        data,
        value: "0",
        chainId: chain.id,
        description: `Add V2 liquidity: ${amountA} ${tA.symbol} + ${amountB} ${tB.symbol} (slippage: ${slippageBps / 100}%)`,
        note: `User must approve the V2 Router (${sushi.v2Router}) to spend both tokens first.`,
        routerAddress: sushi.v2Router,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(tx) }],
      };
    }
  );
}
