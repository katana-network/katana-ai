import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseUnits, encodeFunctionData } from "viem";
import { KAT_CONTRACTS } from "../../config/contracts.js";
import { getChain } from "../../config/chains.js";
import { votingEscrowAbi } from "../../abis/kat.js";

export function registerBuildStake(server: McpServer) {
  server.registerTool(
    "build_kat_stake",
    {
      description:
        "Build an unsigned transaction to stake KAT → vKAT by creating a lock in the VotingEscrow contract. Returns a soulbound NFT (vKAT) with voting power. User must first approve VotingEscrow to spend their KAT. Note: KAT is currently non-transferable — this will revert until KAT unlock (expected after Q1 2026).",
      inputSchema: {
        amount: z
          .string()
          .describe("Amount of KAT to stake (human-readable, e.g. '1000')"),
      },
    },
    async ({ amount }) => {
      const chain = getChain("mainnet");
      const escrowAddr = KAT_CONTRACTS.mainnet.votingEscrow;
      const value = parseUnits(amount, 18);

      const data = encodeFunctionData({
        abi: votingEscrowAbi,
        functionName: "createLock",
        args: [value],
      });

      const tx = {
        to: escrowAddr,
        data,
        value: "0",
        chainId: chain.id,
        description: `Stake ${amount} KAT → vKAT (create lock in VotingEscrow)`,
        note: `User must approve VotingEscrow (${escrowAddr}) to spend KAT first. KAT is currently non-transferable — this will revert until unlock.`,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(tx) }],
      };
    }
  );
}
