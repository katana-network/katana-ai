import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  parseUnits,
  encodeFunctionData,
  maxUint256,
  type Address,
} from "viem";
import { getClient } from "../../clients.js";
import {
  getToken,
  getTokens,
  type NetworkName,
} from "../../config/contracts.js";
import { erc20Abi } from "../../abis/erc20.js";
import { getChain } from "../../config/chains.js";

export function registerApprove(server: McpServer) {
  server.registerTool(
    "build_approve",
    {
      description:
        "Build an unsigned transaction to approve a spender (DEX router, Morpho, etc.) to spend ERC20 tokens on behalf of the user. Supports exact amounts or max approval. The user must sign and send the returned transaction.",
      inputSchema: {
        token: z
          .string()
          .describe(
            "Token symbol (e.g. 'USDC', 'WETH') or token contract address"
          ),
        spender: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
          .describe(
            "Address of the contract to approve (e.g. Sushi V3 Router, Morpho)"
          ),
        amount: z
          .string()
          .optional()
          .describe(
            "Amount to approve in human-readable units. Omit or pass 'max' for unlimited approval."
          ),
        network: z
          .enum(["mainnet", "testnet"])
          .default("mainnet")
          .describe("Katana mainnet or Bokuto testnet"),
      },
    },
    async ({ token, spender, amount, network }) => {
      const chain = getChain(network as NetworkName);
      const spenderAddress = spender as Address;

      let tokenAddress: Address;
      let decimals: number;
      let symbol: string;

      if (token.startsWith("0x") && token.length === 42) {
        tokenAddress = token as Address;
        const client = getClient(network as NetworkName);
        decimals = await client.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "decimals",
        });
        symbol = await client.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "symbol",
        });
      } else {
        const tokenInfo = getToken(network as NetworkName, token);
        if (!tokenInfo) {
          const known = Object.keys(getTokens(network as NetworkName)).join(
            ", "
          );
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: `Unknown token "${token}" on ${network}. Known tokens: ${known}. You can also pass a contract address directly.`,
                }),
              },
            ],
            isError: true,
          };
        }
        tokenAddress = tokenInfo.address;
        decimals = tokenInfo.decimals;
        symbol = tokenInfo.symbol;
      }

      const approveAmount =
        !amount || amount.toLowerCase() === "max"
          ? maxUint256
          : parseUnits(amount, decimals);

      const isMax = approveAmount === maxUint256;

      const tx = {
        to: tokenAddress,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [spenderAddress, approveAmount],
        }),
        value: "0",
        chainId: chain.id,
        description: `Approve ${spender} to spend ${isMax ? "unlimited" : amount} ${symbol}`,
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(tx) },
        ],
      };
    }
  );
}
