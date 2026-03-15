import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData } from "viem";
import { KAT_CONTRACTS } from "../../config/contracts.js";
import { getChain } from "../../config/chains.js";
import { votingEscrowAbi } from "../../abis/kat.js";

export function registerBuildMerge(server: McpServer) {
  server.registerTool(
    "build_kat_merge",
    {
      description:
        "Build an unsigned transaction to merge two vKAT positions into one. The 'from' NFT is burned and its KAT is added to the 'to' position. Both positions must have their votes reset first.",
      inputSchema: {
        fromTokenId: z
          .string()
          .describe("The vKAT NFT token ID to merge FROM (will be burned)"),
        toTokenId: z
          .string()
          .describe("The vKAT NFT token ID to merge INTO (receives the KAT)"),
      },
    },
    async ({ fromTokenId, toTokenId }) => {
      const chain = getChain("mainnet");
      const escrowAddr = KAT_CONTRACTS.mainnet.votingEscrow;

      const data = encodeFunctionData({
        abi: votingEscrowAbi,
        functionName: "merge",
        args: [BigInt(fromTokenId), BigInt(toTokenId)],
      });

      const tx = {
        to: escrowAddr,
        data,
        value: "0",
        chainId: chain.id,
        description: `Merge vKAT #${fromTokenId} → #${toTokenId} (burns #${fromTokenId})`,
        note: "Both positions must have votes reset first. The 'from' NFT is burned.",
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(tx) }],
      };
    }
  );
}
