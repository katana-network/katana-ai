import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData } from "viem";
import { KAT_CONTRACTS } from "../../config/contracts.js";
import { getChain } from "../../config/chains.js";
import { votingEscrowAbi } from "../../abis/kat.js";

export function registerBuildBeginWithdrawal(server: McpServer) {
  server.registerTool(
    "build_kat_begin_withdrawal",
    {
      description:
        "Build an unsigned transaction to begin withdrawing a vKAT position. Starts the 45-day cooldown period. Exit fee decays from 25% (immediate) to 2.5% (after full cooldown). The vKAT position must NOT have active gauge votes — call build_kat_reset_votes first, or use resetVotesAndBeginWithdrawal to do both atomically.",
      inputSchema: {
        tokenId: z
          .string()
          .describe("The vKAT NFT token ID to begin withdrawal for"),
        resetVotes: z
          .boolean()
          .default(false)
          .describe("If true, uses resetVotesAndBeginWithdrawal to atomically reset votes and begin withdrawal"),
      },
    },
    async ({ tokenId, resetVotes }) => {
      const chain = getChain("mainnet");
      const escrowAddr = KAT_CONTRACTS.mainnet.votingEscrow;

      const functionName = resetVotes
        ? "resetVotesAndBeginWithdrawal"
        : "beginWithdrawal";

      const data = encodeFunctionData({
        abi: votingEscrowAbi,
        functionName,
        args: [BigInt(tokenId)],
      });

      const tx = {
        to: escrowAddr,
        data,
        value: "0",
        chainId: chain.id,
        description: `Begin withdrawal for vKAT #${tokenId}${resetVotes ? " (with vote reset)" : ""}`,
        note: "Starts 45-day cooldown. Fee: 25% (day 0) → 2.5% (day 45). Call build_kat_withdraw after cooldown.",
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(tx) }],
      };
    }
  );
}
