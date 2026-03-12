import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData } from "viem";
import { KAT_CONTRACTS } from "../../config/contracts.js";
import { getChain } from "../../config/chains.js";
import { votingEscrowAbi } from "../../abis/kat.js";

export function registerBuildWithdraw(server: McpServer) {
  server.registerTool(
    "build_kat_withdraw",
    {
      description:
        "Build an unsigned transaction to complete a vKAT withdrawal after the cooldown period has started. Returns KAT minus the exit fee. The fee depends on how long the user waited: 25% (immediate rage quit) down to 2.5% (after full 45-day cooldown). Must call build_kat_begin_withdrawal first.",
      inputSchema: {
        tokenId: z
          .string()
          .describe("The vKAT NFT token ID to withdraw"),
      },
    },
    async ({ tokenId }) => {
      const chain = getChain("mainnet");
      const escrowAddr = KAT_CONTRACTS.mainnet.votingEscrow;

      const data = encodeFunctionData({
        abi: votingEscrowAbi,
        functionName: "withdraw",
        args: [BigInt(tokenId)],
      });

      const tx = {
        to: escrowAddr,
        data,
        value: "0",
        chainId: chain.id,
        description: `Withdraw vKAT #${tokenId} → KAT (minus exit fee)`,
        note: "Exit fee: 25% at day 0, decays to 2.5% at day 45. Must have called beginWithdrawal first.",
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(tx) }],
      };
    }
  );
}
