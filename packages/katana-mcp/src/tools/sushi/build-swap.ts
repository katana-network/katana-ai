import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseUnits, encodeFunctionData, type Address } from "viem";
import { SUSHI_CONTRACTS, type NetworkName } from "../../config/contracts.js";
import { sushiV3RouterAbi } from "../../abis/sushi-v3-router.js";
import { sushiV2RouterAbi } from "../../abis/sushi-v2-router.js";
import { getChain } from "../../config/chains.js";
import { resolveToken, knownTokenList } from "./utils.js";

const inputSchema = {
  tokenIn: z
    .string()
    .describe("Token to sell — symbol (e.g. 'USDC') or contract address"),
  tokenOut: z
    .string()
    .describe("Token to buy — symbol (e.g. 'WETH') or contract address"),
  amountIn: z
    .string()
    .describe("Amount to sell in human-readable units (e.g. '1000' for 1000 USDC)"),
  recipient: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
    .describe("Address to receive the output tokens"),
  slippageBps: z
    .number()
    .default(50)
    .describe("Slippage tolerance in basis points (default 50 = 0.5%)"),
  fee: z
    .number()
    .default(3000)
    .describe("V3 pool fee tier: 100 (0.01%), 500 (0.05%), 3000 (0.3%), 10000 (1%). Default: 3000"),
  version: z
    .enum(["v3", "v2"])
    .default("v3")
    .describe("Use SushiSwap V3 or V2 router. Default: v3"),
  deadlineMinutes: z
    .number()
    .default(20)
    .describe("Transaction deadline in minutes from now (default 20)"),
  network: z
    .enum(["mainnet", "testnet"])
    .default("mainnet")
    .describe("Katana mainnet or Bokuto testnet"),
};

export function registerBuildSwap(server: McpServer) {
  // @ts-expect-error TS2589: Zod + MCP SDK deep type inference
  server.registerTool(
    "build_swap",
    {
      description:
        "Build an unsigned SushiSwap transaction on Katana. Supports V3 (exactInputSingle) and V2 (swapExactTokensForTokens). Returns unsigned tx data — the user must sign and send. Important: user must approve the router to spend tokenIn first (use build_approve).",
      inputSchema,
    },
    async ({ tokenIn, tokenOut, amountIn, recipient, slippageBps, fee, version, deadlineMinutes, network }) => {
      const net = network as NetworkName;
      const chain = getChain(net);
      const sushi = SUSHI_CONTRACTS.mainnet;

      const inToken = await resolveToken(net, tokenIn);
      const outToken = await resolveToken(net, tokenOut);

      if (!inToken) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Cannot resolve token "${tokenIn}". Known: ${knownTokenList(net)}` }) }],
          isError: true,
        };
      }
      if (!outToken) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Cannot resolve token "${tokenOut}". Known: ${knownTokenList(net)}` }) }],
          isError: true,
        };
      }

      const amountInWei = parseUnits(amountIn, inToken.decimals);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineMinutes * 60);

      // Calculate minimum output with slippage
      // For the unsigned tx, we set amountOutMinimum to 0 and note slippage in description
      // The agent/user should get a quote first and set this properly
      const amountOutMinimum = 0n;

      if (version === "v3") {
        const data = encodeFunctionData({
          abi: sushiV3RouterAbi,
          functionName: "exactInputSingle",
          args: [
            {
              tokenIn: inToken.address,
              tokenOut: outToken.address,
              fee,
              recipient: recipient as Address,
              deadline,
              amountIn: amountInWei,
              amountOutMinimum,
              sqrtPriceLimitX96: 0n,
            },
          ],
        });

        const tx = {
          to: sushi.v3SwapRouter,
          data,
          value: "0",
          chainId: chain.id,
          description: `Swap ${amountIn} ${inToken.symbol} → ${outToken.symbol} via SushiSwap V3 (fee: ${fee / 10000}%)`,
          note: "Get a quote first with get_swap_quote, then set amountOutMinimum based on slippage tolerance. User must approve the V3 router to spend tokenIn first.",
          routerAddress: sushi.v3SwapRouter,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(tx) }],
        };
      } else {
        // V2
        const data = encodeFunctionData({
          abi: sushiV2RouterAbi,
          functionName: "swapExactTokensForTokens",
          args: [
            amountInWei,
            amountOutMinimum,
            [inToken.address, outToken.address],
            recipient as Address,
            deadline,
          ],
        });

        const tx = {
          to: sushi.v2Router,
          data,
          value: "0",
          chainId: chain.id,
          description: `Swap ${amountIn} ${inToken.symbol} → ${outToken.symbol} via SushiSwap V2`,
          note: "User must approve the V2 router to spend tokenIn first.",
          routerAddress: sushi.v2Router,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(tx) }],
        };
      }
    }
  );
}
