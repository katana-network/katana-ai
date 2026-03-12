import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatUnits, type Address } from "viem";
import { getClient } from "../../clients.js";
import { KAT_CONTRACTS, type NetworkName } from "../../config/contracts.js";
import { gaugeVoterAbi } from "../../abis/kat.js";

export function registerGetGauges(server: McpServer) {
  server.registerTool(
    "get_kat_gauges",
    {
      description:
        "Get all active gauges and their current vote weights. Shows which liquidity pools are receiving KAT emission incentives and the total voting power allocated to each. Useful for deciding how to allocate gauge votes.",
      inputSchema: {
        activeOnly: z
          .boolean()
          .default(true)
          .describe("If true (default), only returns active gauges. Set to false to include all gauges."),
      },
    },
    async ({ activeOnly }) => {
      const client = getClient("mainnet" as NetworkName);
      const voterAddr = KAT_CONTRACTS.mainnet.gaugeVoter;

      // Try active gauges first, fall back to all gauges if it reverts
      let gauges: readonly `0x${string}`[];
      try {
        gauges = await client.readContract({
          address: voterAddr,
          abi: gaugeVoterAbi,
          functionName: activeOnly ? "getActiveGauges" : "getAllGauges",
        }) as readonly `0x${string}`[];
      } catch {
        // getActiveGauges may revert if no gauges exist yet; try getAllGauges
        try {
          gauges = await client.readContract({
            address: voterAddr,
            abi: gaugeVoterAbi,
            functionName: "getAllGauges",
          }) as readonly `0x${string}`[];
        } catch {
          // No gauges available at all
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  gauges: [],
                  totalGauges: 0,
                  totalVotingPowerCast: "0",
                  note: "No gauges found. The gauge system may not be active yet.",
                }),
              },
            ],
          };
        }
      }

      let totalPower: bigint;
      try {
        totalPower = await client.readContract({
          address: voterAddr,
          abi: gaugeVoterAbi,
          functionName: "totalVotingPowerCast",
        }) as bigint;
      } catch {
        totalPower = 0n;
      }

      // Fetch vote weight for each gauge in parallel
      const gaugeDetails = await Promise.all(
        gauges.map(async (gauge) => {
          const [votes, alive] = await Promise.allSettled([
            client.readContract({
              address: voterAddr,
              abi: gaugeVoterAbi,
              functionName: "gaugeVotes",
              args: [gauge as Address],
            }),
            client.readContract({
              address: voterAddr,
              abi: gaugeVoterAbi,
              functionName: "isAlive",
              args: [gauge as Address],
            }),
          ]);

          const votesVal = votes.status === "fulfilled" ? (votes.value as bigint) : 0n;
          const aliveVal = alive.status === "fulfilled" ? (alive.value as boolean) : true;

          const votesNum = Number(votesVal);
          const totalNum = Number(totalPower);
          const sharePercent =
            totalNum > 0 ? ((votesNum / totalNum) * 100).toFixed(2) : "0.00";

          return {
            gauge,
            votes: formatUnits(votesVal, 18),
            sharePercent: `${sharePercent}%`,
            isAlive: aliveVal,
          };
        })
      );

      const response = {
        gauges: gaugeDetails,
        totalGauges: gaugeDetails.length,
        totalVotingPowerCast: formatUnits(totalPower, 18),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response) }],
      };
    }
  );
}
