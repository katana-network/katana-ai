import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatUnits, parseUnits } from "viem";
import { getClient } from "../../clients.js";
import { SUSHI_CONTRACTS, type NetworkName } from "../../config/contracts.js";
import { sushiV3QuoterAbi } from "../../abis/sushi-v3-quoter.js";
import { sushiV2RouterAbi } from "../../abis/sushi-v2-router.js";
import { resolveToken, knownTokenList, V3_FEE_TIERS } from "./utils.js";

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
  network: z
    .enum(["mainnet", "testnet"])
    .default("mainnet")
    .describe("Katana mainnet or Bokuto testnet"),
};

export function registerGetQuote(server: McpServer) {
  server.registerTool(
    "get_swap_quote",
    {
      description:
        "Get a swap quote from SushiSwap on Katana. Tries all V3 fee tiers (0.01%, 0.05%, 0.3%, 1%) and V2, returns the best price. Read-only — no transaction is built.",
      inputSchema,
    },
    async ({ tokenIn, tokenOut, amountIn, network }) => {
      const net = network as NetworkName;
      const client = getClient(net);

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
      const sushi = SUSHI_CONTRACTS.mainnet; // TODO: testnet contracts when available

      // Try all V3 fee tiers
      const v3Quotes = await Promise.allSettled(
        V3_FEE_TIERS.map(async (fee) => {
          const result = await client.simulateContract({
            address: sushi.v3QuoterV2,
            abi: sushiV3QuoterAbi,
            functionName: "quoteExactInputSingle",
            args: [
              {
                tokenIn: inToken.address,
                tokenOut: outToken.address,
                amountIn: amountInWei,
                fee,
                sqrtPriceLimitX96: 0n,
              },
            ],
          });
          return {
            source: `V3 (${fee / 10000}%)`,
            fee,
            amountOut: result.result[0],
            gasEstimate: result.result[3],
          };
        })
      );

      // Try V2
      const v2Quote = await (async () => {
        try {
          const amounts = await client.readContract({
            address: sushi.v2Router,
            abi: sushiV2RouterAbi,
            functionName: "getAmountsOut",
            args: [amountInWei, [inToken.address, outToken.address]],
          });
          return {
            source: "V2",
            fee: 3000,
            amountOut: amounts[amounts.length - 1],
            gasEstimate: 0n,
          };
        } catch {
          return null;
        }
      })();

      // Collect successful quotes
      const quotes: Array<{
        source: string;
        fee: number;
        amountOut: string;
        amountOutRaw: string;
        gasEstimate: string;
      }> = [];

      for (const result of v3Quotes) {
        if (result.status === "fulfilled") {
          const q = result.value;
          quotes.push({
            source: q.source,
            fee: q.fee,
            amountOut: formatUnits(q.amountOut, outToken.decimals),
            amountOutRaw: q.amountOut.toString(),
            gasEstimate: q.gasEstimate.toString(),
          });
        }
      }

      if (v2Quote) {
        quotes.push({
          source: v2Quote.source,
          fee: v2Quote.fee,
          amountOut: formatUnits(v2Quote.amountOut, outToken.decimals),
          amountOutRaw: v2Quote.amountOut.toString(),
          gasEstimate: v2Quote.gasEstimate.toString(),
        });
      }

      // Sort by best output
      quotes.sort((a, b) => {
        const aBig = BigInt(a.amountOutRaw);
        const bBig = BigInt(b.amountOutRaw);
        return bBig > aBig ? 1 : bBig < aBig ? -1 : 0;
      });

      const response = {
        network,
        tokenIn: { symbol: inToken.symbol, address: inToken.address },
        tokenOut: { symbol: outToken.symbol, address: outToken.address },
        amountIn,
        quotes,
        bestQuote: quotes[0] || null,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response) }],
      };
    }
  );
}
