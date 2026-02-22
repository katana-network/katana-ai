import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatEther, formatUnits, type Address } from "viem";
import { getClient } from "../../clients.js";
import { getTokens, type NetworkName } from "../../config/contracts.js";
import { erc20Abi } from "../../abis/erc20.js";

const inputSchema = {
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address"),
  network: z
    .enum(["mainnet", "testnet"])
    .default("mainnet")
    .describe("Katana mainnet (747474) or Bokuto testnet (737373)"),
  tokens: z
    .string()
    .optional()
    .describe(
      "Comma-separated token symbols to check (e.g. 'WETH,USDC'). If omitted, checks all known tokens."
    ),
};

export function registerGetBalances(server: McpServer) {
  // @ts-expect-error TS2589: Zod + MCP SDK deep type inference
  server.registerTool(
    "get_balances",
    {
      description:
        "Get ETH and token balances for an address on Katana. Returns native ETH balance plus all known token balances (KAT, WETH, USDC, USDT, WBTC, USDS, AUSD, etc).",
      inputSchema,
    },
    async ({ address, network, tokens }) => {
      const client = getClient(network as NetworkName);
      const account = address as Address;

      const ethBalance = await client.getBalance({ address: account });

      const allTokens = getTokens(network as NetworkName);
      const tokenSymbols = tokens
        ? tokens.split(",").map((t: string) => t.trim().toUpperCase())
        : Object.keys(allTokens);

      const filteredSymbols = tokenSymbols.filter((sym: string) => allTokens[sym]);

      const balanceResults = await Promise.allSettled(
        filteredSymbols.map((sym: string) =>
          client.readContract({
            address: allTokens[sym].address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [account],
          })
        )
      );

      const tokenBalances = filteredSymbols
        .map((sym: string, i: number) => {
          const result = balanceResults[i];
          if (result.status !== "fulfilled") return null;
          const token = allTokens[sym];
          const raw = result.value as bigint;
          return {
            symbol: token.symbol,
            name: token.name,
            address: token.address,
            balance: formatUnits(raw, token.decimals),
            rawBalance: raw.toString(),
          };
        })
        .filter(Boolean);

      const response = {
        network,
        address,
        eth: {
          balance: formatEther(ethBalance),
          rawBalance: ethBalance.toString(),
        },
        tokens: tokenBalances,
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(response, null, 2) },
        ],
      };
    }
  );
}
