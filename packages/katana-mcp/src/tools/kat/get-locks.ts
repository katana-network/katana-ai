import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatUnits, type Address } from "viem";
import { getClient } from "../../clients.js";
import { KAT_CONTRACTS, type NetworkName } from "../../config/contracts.js";
import { votingEscrowAbi, gaugeVoterAbi } from "../../abis/kat.js";

export function registerGetLocks(server: McpServer) {
  server.registerTool(
    "get_kat_locks",
    {
      description:
        "Get all vKAT lock positions for an address. Returns each lock's token ID, locked KAT amount, lock start time, voting power, and whether it has active gauge votes. Useful for understanding a user's staking positions before voting, merging, splitting, or withdrawing.",
      inputSchema: {
        address: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
          .describe("Wallet address to query locks for"),
      },
    },
    async ({ address }) => {
      const client = getClient("mainnet" as NetworkName);
      const escrowAddr = KAT_CONTRACTS.mainnet.votingEscrow;
      const voterAddr = KAT_CONTRACTS.mainnet.gaugeVoter;
      const account = address as Address;

      // Get all owned token IDs
      const tokenIds = await client.readContract({
        address: escrowAddr,
        abi: votingEscrowAbi,
        functionName: "ownedTokens",
        args: [account],
      });

      if (tokenIds.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                address,
                locks: [],
                totalLocks: 0,
              }),
            },
          ],
        };
      }

      // Fetch details for each lock in parallel
      const lockDetails = await Promise.all(
        tokenIds.map(async (tokenId) => {
          const [lockedData, power, isVoting] = await Promise.all([
            client.readContract({
              address: escrowAddr,
              abi: votingEscrowAbi,
              functionName: "locked",
              args: [tokenId],
            }),
            client.readContract({
              address: escrowAddr,
              abi: votingEscrowAbi,
              functionName: "votingPower",
              args: [tokenId],
            }),
            client.readContract({
              address: voterAddr,
              abi: gaugeVoterAbi,
              functionName: "isVoting",
              args: [tokenId],
            }),
          ]);

          return {
            tokenId: tokenId.toString(),
            lockedAmount: formatUnits(BigInt(lockedData[0]), 18),
            lockStart: Number(lockedData[1]),
            votingPower: formatUnits(power, 18),
            isVoting,
          };
        })
      );

      const response = {
        address,
        locks: lockDetails,
        totalLocks: lockDetails.length,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response) }],
      };
    }
  );
}
