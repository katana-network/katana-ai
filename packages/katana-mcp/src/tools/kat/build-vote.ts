import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData, type Address } from "viem";
import { KAT_CONTRACTS } from "../../config/contracts.js";
import { getChain } from "../../config/chains.js";
import { gaugeVoterAbi } from "../../abis/kat.js";

export function registerBuildVote(server: McpServer) {
  server.registerTool(
    "build_kat_vote",
    {
      description:
        "Build an unsigned transaction to vote on gauges with a vKAT position. Directs KAT emission incentives to liquidity pools. Weights are in basis points (10000 = 100%). Votes persist across epochs until changed or reset. Only vKAT holders can vote directly — avKAT holders' votes are managed by the CompoundStrategy.",
      inputSchema: {
        tokenId: z
          .string()
          .describe("The vKAT NFT token ID to vote with"),
        votes: z
          .string()
          .describe(
            'JSON array of vote allocations, e.g. \'[{"gauge":"0x...","weight":5000},{"gauge":"0x...","weight":5000}]\'. Weights in basis points (10000 = 100%). Must sum to 10000.'
          ),
      },
    },
    async ({ tokenId, votes }) => {
      const chain = getChain("mainnet");
      const voterAddr = KAT_CONTRACTS.mainnet.gaugeVoter;

      let parsed: Array<{ gauge: string; weight: number }>;
      try {
        parsed = JSON.parse(votes);
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Invalid votes JSON. Expected: [{\"gauge\":\"0x...\",\"weight\":5000}]",
              }),
            },
          ],
          isError: true,
        };
      }

      const totalWeight = parsed.reduce((sum, v) => sum + v.weight, 0);
      if (totalWeight !== 10000) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Vote weights must sum to 10000 (100%). Got ${totalWeight}.`,
              }),
            },
          ],
          isError: true,
        };
      }

      const voteArgs = parsed.map((v) => ({
        gauge: v.gauge as Address,
        weight: BigInt(v.weight),
      }));

      const data = encodeFunctionData({
        abi: gaugeVoterAbi,
        functionName: "vote",
        args: [BigInt(tokenId), voteArgs],
      });

      const tx = {
        to: voterAddr,
        data,
        value: "0",
        chainId: chain.id,
        description: `Vote on ${parsed.length} gauge(s) with vKAT #${tokenId}`,
        note: "Votes persist across epochs until changed or reset.",
        gauges: parsed,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(tx) }],
      };
    }
  );
}
