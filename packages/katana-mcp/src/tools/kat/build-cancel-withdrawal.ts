import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData } from "viem";
import { KAT_CONTRACTS } from "../../config/contracts.js";
import { getChain } from "../../config/chains.js";
import { votingEscrowAbi } from "../../abis/kat.js";

export function registerBuildCancelWithdrawal(server: McpServer) {
  server.registerTool(
    "build_kat_cancel_withdrawal",
    {
      description:
        "Build an unsigned transaction to cancel an in-progress exit during the cooldown (after beginWithdrawal, before withdraw). The user is left holding a vKAT NFT, which earns no rewards since the November 17, 2026 sunset — deposit it back into avKAT with build_kat_convert_to_vault to resume earning.",
      inputSchema: {
        tokenId: z
          .string()
          .describe("The vKAT NFT token ID to cancel withdrawal for"),
      },
    },
    async ({ tokenId }) => {
      const chain = getChain("mainnet");
      const escrowAddr = KAT_CONTRACTS.mainnet.votingEscrow;

      const data = encodeFunctionData({
        abi: votingEscrowAbi,
        functionName: "cancelWithdrawalRequest",
        args: [BigInt(tokenId)],
      });

      const tx = {
        to: escrowAddr,
        data,
        value: "0",
        chainId: chain.id,
        description: `Cancel withdrawal for vKAT #${tokenId} — restores staking position`,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(tx) }],
      };
    }
  );
}
