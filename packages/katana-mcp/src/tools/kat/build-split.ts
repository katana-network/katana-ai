import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseUnits, encodeFunctionData } from "viem";
import { KAT_CONTRACTS } from "../../config/contracts.js";
import { getChain } from "../../config/chains.js";
import { votingEscrowAbi } from "../../abis/kat.js";

export function registerBuildSplit(server: McpServer) {
  server.registerTool(
    "build_kat_split",
    {
      description:
        "Build an unsigned transaction to split a vKAT position into two. Creates a new vKAT NFT with the specified amount of KAT, reducing the original position accordingly. The original position must have its votes reset first.",
      inputSchema: {
        tokenId: z
          .string()
          .describe("The vKAT NFT token ID to split FROM"),
        amount: z
          .string()
          .describe("Amount of KAT to split into the new position (human-readable, e.g. '500')"),
      },
    },
    async ({ tokenId, amount }) => {
      const chain = getChain("mainnet");
      const escrowAddr = KAT_CONTRACTS.mainnet.votingEscrow;
      const value = parseUnits(amount, 18);

      const data = encodeFunctionData({
        abi: votingEscrowAbi,
        functionName: "split",
        args: [BigInt(tokenId), value],
      });

      const tx = {
        to: escrowAddr,
        data,
        value: "0",
        chainId: chain.id,
        description: `Split ${amount} KAT from vKAT #${tokenId} into a new position`,
        note: "The original position must have votes reset first. Returns a new token ID.",
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(tx) }],
      };
    }
  );
}
