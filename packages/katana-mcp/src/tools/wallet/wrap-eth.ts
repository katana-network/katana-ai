import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseEther, encodeFunctionData } from "viem";
import { getToken, type NetworkName } from "../../config/contracts.js";
import { wethAbi } from "../../abis/weth.js";
import { getChain } from "../../config/chains.js";

export function registerWrapEth(server: McpServer) {
  server.registerTool(
    "build_wrap_eth",
    {
      description:
        "Build an unsigned transaction to wrap ETH into WETH (vbETH) on Katana. On Katana, WETH is a yield-generating Vault Bridge token. The user must sign and send the returned transaction.",
      inputSchema: {
        amount: z
          .string()
          .describe("Amount of ETH to wrap, in ETH (e.g. '1.5')"),
        network: z
          .enum(["mainnet", "testnet"])
          .default("mainnet")
          .describe("Katana mainnet or Bokuto testnet"),
      },
    },
    async ({ amount, network }) => {
      const weth = getToken(network as NetworkName, "WETH");
      if (!weth) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `WETH contract not found for ${network}`,
              }),
            },
          ],
          isError: true,
        };
      }

      const value = parseEther(amount);
      const chain = getChain(network as NetworkName);

      const tx = {
        to: weth.address,
        data: encodeFunctionData({
          abi: wethAbi,
          functionName: "deposit",
        }),
        value: value.toString(),
        chainId: chain.id,
        description: `Wrap ${amount} ETH into WETH (vbETH)`,
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(tx) },
        ],
      };
    }
  );

  server.registerTool(
    "build_unwrap_eth",
    {
      description:
        "Build an unsigned transaction to unwrap WETH (vbETH) back into ETH on Katana. The user must sign and send the returned transaction.",
      inputSchema: {
        amount: z
          .string()
          .describe("Amount of WETH to unwrap, in ETH units (e.g. '1.5')"),
        network: z
          .enum(["mainnet", "testnet"])
          .default("mainnet")
          .describe("Katana mainnet or Bokuto testnet"),
      },
    },
    async ({ amount, network }) => {
      const weth = getToken(network as NetworkName, "WETH");
      if (!weth) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `WETH contract not found for ${network}`,
              }),
            },
          ],
          isError: true,
        };
      }

      const value = parseEther(amount);
      const chain = getChain(network as NetworkName);

      const tx = {
        to: weth.address,
        data: encodeFunctionData({
          abi: wethAbi,
          functionName: "withdraw",
          args: [value],
        }),
        value: "0",
        chainId: chain.id,
        description: `Unwrap ${amount} WETH (vbETH) into ETH`,
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(tx) },
        ],
      };
    }
  );
}
