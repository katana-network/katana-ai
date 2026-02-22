import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  parseUnits,
  parseEther,
  encodeFunctionData,
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

export function registerTransfer(server: McpServer) {
  server.registerTool(
    "build_transfer",
    {
      description:
        "Build an unsigned transaction to transfer ETH or any ERC20 token to another address on Katana. For ETH, returns a simple value transfer. For tokens, returns an ERC20 transfer() call. The user must sign and send the returned transaction.",
      inputSchema: {
        to: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
          .describe("Recipient address"),
        token: z
          .string()
          .describe(
            "Token symbol (e.g. 'ETH', 'USDC', 'WETH') or token contract address"
          ),
        amount: z
          .string()
          .describe(
            "Amount to transfer in human-readable units (e.g. '100' for 100 USDC)"
          ),
        network: z
          .enum(["mainnet", "testnet"])
          .default("mainnet")
          .describe("Katana mainnet or Bokuto testnet"),
      },
    },
    async ({ to, token, amount, network }) => {
      const chain = getChain(network as NetworkName);
      const recipient = to as Address;

      // Native ETH transfer
      if (token.toUpperCase() === "ETH") {
        const value = parseEther(amount);
        const tx = {
          to: recipient,
          data: "0x",
          value: value.toString(),
          chainId: chain.id,
          description: `Transfer ${amount} ETH to ${to}`,
        };
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(tx, null, 2) },
          ],
        };
      }

      // ERC20 transfer — resolve by symbol or use raw address
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

      const value = parseUnits(amount, decimals);
      const tx = {
        to: tokenAddress,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [recipient, value],
        }),
        value: "0",
        chainId: chain.id,
        description: `Transfer ${amount} ${symbol} to ${to}`,
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(tx, null, 2) },
        ],
      };
    }
  );
}
