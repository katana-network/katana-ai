import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData } from "viem";
import { KAT_CONTRACTS } from "../../config/contracts.js";
import { getChain } from "../../config/chains.js";
import { gaugeVoterAbi } from "../../abis/kat.js";

export function registerBuildResetVotes(server: McpServer) {
  server.registerTool(
    "build_kat_reset_votes",
    {
      description:
        "Build an unsigned transaction to reset all gauge votes for a legacy vKAT position (gauge voting was sunset November 17, 2026). Only needed when a pre-sunset vKAT NFT still has active votes, which block withdrawal. Alternatively, use build_kat_begin_withdrawal with resetVotes=true to do both atomically.",
      inputSchema: {
        tokenId: z
          .string()
          .describe("The vKAT NFT token ID to reset votes for"),
      },
    },
    async ({ tokenId }) => {
      const chain = getChain("mainnet");
      const voterAddr = KAT_CONTRACTS.mainnet.gaugeVoter;

      const data = encodeFunctionData({
        abi: gaugeVoterAbi,
        functionName: "reset",
        args: [BigInt(tokenId)],
      });

      const tx = {
        to: voterAddr,
        data,
        value: "0",
        chainId: chain.id,
        description: `Reset all gauge votes for vKAT #${tokenId}`,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(tx) }],
      };
    }
  );
}
