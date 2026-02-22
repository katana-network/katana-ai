import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData, type Address } from "viem";
import { merklDistributorAbi } from "../../abis/merkl-distributor.js";

const MERKL_API = "https://api.merkl.xyz/v4";
const KATANA_CHAIN_ID = 747474;
const DISTRIBUTOR = "0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae" as Address;

const inputSchema = {
  userAddress: z
    .string()
    .describe("User wallet address to claim rewards for"),
  tokenAddresses: z
    .string()
    .optional()
    .describe(
      "Comma-separated token addresses to claim. If omitted, claims ALL available rewards."
    ),
};

interface MerklRewardResponse {
  chain: { id: number };
  rewards: Array<{
    amount: string;
    claimed: string;
    proofs: string[];
    token: {
      address: string;
      decimals: number;
      symbol: string;
      price: number;
    };
  }>;
}

export function registerBuildClaimRewards(server: McpServer) {
  server.registerTool(
    "build_claim_rewards",
    {
      description:
        "Build an unsigned transaction to claim Merkl rewards on Katana. Fetches current merkle proofs from the Merkl API and encodes a claim() call to the Distributor contract. Can claim all rewards at once or specific tokens only.",
      inputSchema,
    },
    async ({ userAddress, tokenAddresses }) => {
      const user = userAddress as Address;

      // Fetch latest proofs from Merkl API
      const url = `${MERKL_API}/users/${userAddress}/rewards?chainId=${KATANA_CHAIN_ID}`;

      let data: MerklRewardResponse[];
      try {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Merkl API returned ${res.status}: ${res.statusText}`);
        }
        data = await res.json() as MerklRewardResponse[];
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { error: `Failed to fetch Merkl proofs: ${(err as Error).message}` },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      const katanaData = data.find((d) => d.chain.id === KATANA_CHAIN_ID);

      if (!katanaData || katanaData.rewards.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { error: "No Merkl rewards found for this address on Katana." },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      // Filter to tokens with unclaimed balance and valid proofs
      const filterTokens = tokenAddresses
        ? tokenAddresses.split(",").map((t) => t.trim().toLowerCase())
        : null;

      const claimable = katanaData.rewards.filter((r) => {
        const unclaimed = BigInt(r.amount) - BigInt(r.claimed);
        if (unclaimed <= 0n) return false;
        if (r.proofs.length === 0) return false;
        if (filterTokens) {
          return filterTokens.includes(r.token.address.toLowerCase());
        }
        return true;
      });

      if (claimable.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: "No claimable rewards found.",
                  note: filterTokens
                    ? "None of the specified tokens have unclaimed rewards with valid proofs."
                    : "All rewards have already been claimed or proofs are not yet available.",
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      // Build claim arrays
      const users: Address[] = [];
      const tokens: Address[] = [];
      const amounts: bigint[] = [];
      const proofs: `0x${string}`[][] = [];

      const claimSummary: Array<Record<string, string>> = [];

      for (const r of claimable) {
        const unclaimed = BigInt(r.amount) - BigInt(r.claimed);
        const unclaimedFormatted =
          Number(unclaimed) / 10 ** r.token.decimals;

        users.push(user);
        tokens.push(r.token.address as Address);
        amounts.push(BigInt(r.amount)); // claim() takes the total cumulative amount
        proofs.push(r.proofs as `0x${string}`[]);

        claimSummary.push({
          token: r.token.symbol,
          address: r.token.address,
          unclaimed: unclaimedFormatted.toString(),
          unclaimedUSD: `$${(unclaimedFormatted * (r.token.price ?? 0)).toFixed(2)}`,
        });
      }

      // Encode the claim transaction
      const txData = encodeFunctionData({
        abi: merklDistributorAbi,
        functionName: "claim",
        args: [users, tokens, amounts, proofs],
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                transaction: {
                  to: DISTRIBUTOR,
                  data: txData,
                  value: "0",
                },
                distributor: DISTRIBUTOR,
                claimingFor: userAddress,
                tokensClaimed: claimSummary.length,
                summary: claimSummary,
                note: "This is an unsigned transaction. The user must sign and submit it.",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
