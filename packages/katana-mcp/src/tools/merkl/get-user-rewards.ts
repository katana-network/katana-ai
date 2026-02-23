import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatUnits } from "viem";

const MERKL_API = "https://api.merkl.xyz/v4";
const KATANA_CHAIN_ID = 747474;

const inputSchema = {
  userAddress: z
    .string()
    .describe("User wallet address (0x-prefixed) to check rewards for"),
};

interface MerklRewardResponse {
  chain: { id: number; name: string; endOfDisputePeriod: number };
  rewards: Array<{
    root: string;
    distributionChainId: number;
    amount: string;
    claimed: string;
    pending: string;
    proofs: string[];
    recipient: string;
    token: {
      chainId: number;
      address: string;
      decimals: number;
      symbol: string;
      price: number;
    };
    breakdowns: Array<{
      amount: string;
      campaignId: string;
    }>;
  }>;
}

export function registerGetMerklUserRewards(server: McpServer) {
  server.registerTool(
    "get_merkl_user_rewards",
    {
      description:
        "Check a user's unclaimed Merkl rewards on Katana. Returns all pending reward tokens with amounts, USD values, and merkle proofs needed for claiming. Use build_claim_rewards to construct the claim transaction.",
      inputSchema,
    },
    async ({ userAddress }) => {
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
                { error: `Failed to fetch Merkl rewards: ${(err as Error).message}` },
              ),
            },
          ],
          isError: true,
        };
      }

      // Find Katana chain data
      const katanaData = data.find((d) => d.chain.id === KATANA_CHAIN_ID);

      if (!katanaData || katanaData.rewards.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  userAddress,
                  chainId: KATANA_CHAIN_ID,
                  totalRewardTokens: 0,
                  rewards: [],
                  note: "No Merkl rewards found for this address on Katana.",
                },
              ),
            },
          ],
        };
      }

      let totalUnclaimedUSD = 0;

      const rewards = katanaData.rewards
        .map((r) => {
          const unclaimedAmount = BigInt(r.amount) - BigInt(r.claimed);

          const decimals = r.token.decimals;
          const price = r.token.price ?? 0;

          const unclaimedFormatted = formatUnits(unclaimedAmount, decimals);
          const unclaimedUSD = parseFloat(unclaimedFormatted) * price;
          totalUnclaimedUSD += unclaimedUSD;

          return {
            symbol: r.token.symbol,
            address: r.token.address,
            unclaimed: unclaimedFormatted,
            unclaimedUSD: `$${unclaimedUSD.toFixed(2)}`,
          };
        })
        .filter((r) => r.unclaimed !== "0");

      // Sort by unclaimed USD value descending
      rewards.sort((a, b) => {
        const usdA = parseFloat(a.unclaimedUSD.replace("$", ""));
        const usdB = parseFloat(b.unclaimedUSD.replace("$", ""));
        return usdB - usdA;
      });

      const disputePeriodEnd = katanaData.chain.endOfDisputePeriod
        ? new Date(katanaData.chain.endOfDisputePeriod * 1000).toISOString()
        : null;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              userAddress,
              chainId: KATANA_CHAIN_ID,
              totalRewardTokens: rewards.length,
              totalUnclaimedUSD: `$${totalUnclaimedUSD.toFixed(2)}`,
              disputePeriodEnd,
              rewards,
            }),
          },
        ],
      };
    }
  );
}
