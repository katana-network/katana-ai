import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData } from "viem";
import { KAT_CONTRACTS } from "../../config/contracts.js";
import { getChain } from "../../config/chains.js";
import { votingEscrowAbi } from "../../abis/kat.js";
import { getExitParams, formatExitNote } from "./exit-params.js";

export function registerBuildBeginWithdrawal(server: McpServer) {
  server.registerTool(
    "build_kat_begin_withdrawal",
    {
      description:
        "Build an unsigned transaction to begin the exit cooldown for a vKAT NFT. This is step 2 of unstaking avKAT (after build_kat_withdraw_vault mints the NFT) and also how a legacy vKAT position exits. Cooldown and fee bounds are read live from the on-chain ExitQueue and returned as exitParams; the exit fee decays linearly from the max fee (immediate) to the min fee (after the full cooldown). A legacy vKAT NFT that still has pre-sunset gauge votes needs resetVotes=true.",
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

      const [data, exitParams] = await Promise.all([
        encodeFunctionData({
          abi: votingEscrowAbi,
          functionName,
          args: [BigInt(tokenId)],
        }),
        getExitParams("mainnet"),
      ]);

      const tx = {
        to: escrowAddr,
        data,
        value: "0",
        chainId: chain.id,
        description: `Begin withdrawal for vKAT #${tokenId}${resetVotes ? " (with vote reset)" : ""}`,
        note: `Starts cooldown. ${formatExitNote(exitParams)} Call build_kat_withdraw after cooldown.`,
        exitParams,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(tx) }],
      };
    }
  );
}
