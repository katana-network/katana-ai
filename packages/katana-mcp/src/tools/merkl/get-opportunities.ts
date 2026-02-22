import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const MERKL_API = "https://api.merkl.xyz/v4";
const KATANA_CHAIN_ID = 747474;

const inputSchema = {
  protocol: z
    .enum(["all", "morpho", "sushi-swap"])
    .default("all")
    .describe("Filter by protocol: 'morpho' for lending/vaults, 'sushi-swap' for DEX pools, 'all' for everything"),
  action: z
    .enum(["all", "POOL", "LEND", "BORROW", "HOLD", "DROP"])
    .default("all")
    .describe("Filter by action type: POOL (LP), LEND (supply/vault), BORROW, HOLD (token holding), DROP (airdrop)"),
  campaigns: z
    .boolean()
    .default(false)
    .describe("Include detailed campaign breakdowns (reward tokens, durations, distribution types)"),
};

interface MerklOpportunity {
  chainId: number;
  type: string;
  identifier: string;
  name: string;
  status: string;
  action: string;
  tvl: number;
  apr: number;
  dailyRewards: number;
  liveCampaigns: number;
  tokens: Array<{ symbol: string; address: string; decimals: number }>;
  protocol?: { id: string; name: string };
  aprRecord?: {
    cumulated: number;
    breakdowns: Array<{
      identifier: string;
      type: string;
      value: number;
    }>;
  };
  rewardsRecord?: {
    total: number;
    breakdowns: Array<{
      token: { symbol: string; address: string; decimals: number };
      amount: number;
      value: number;
      distributionType: string;
    }>;
  };
  campaigns?: Array<{
    id: string;
    type: string;
    amount: string;
    startTimestamp: number;
    endTimestamp: number;
    apr: number;
    dailyRewards: number;
    distributionType: string;
    rewardToken: { symbol: string; address: string; decimals: number; price: number };
    campaignStatus: { status: string };
  }>;
}

export function registerGetMerklOpportunities(server: McpServer) {
  // @ts-expect-error TS2589: Zod + MCP SDK deep type inference
  server.registerTool(
    "get_merkl_opportunities",
    {
      description:
        "Get all incentivized DeFi opportunities on Katana with reward APRs from Merkl. Shows reward campaigns for Sushi V3 pools and Morpho markets/vaults. Returns TVL, total APR (native + reward), daily rewards in USD, and reward token details. Use alongside list_morpho_markets or get_pools to see full yield picture (native APY + reward APR).",
      inputSchema,
    },
    async ({ protocol, action, campaigns }) => {
      const params = new URLSearchParams();
      params.set("chainId", KATANA_CHAIN_ID.toString());

      if (protocol !== "all") {
        params.set("mainProtocolId", protocol);
      }
      if (action !== "all") {
        params.set("action", action);
      }
      if (campaigns) {
        params.set("campaigns", "true");
      }

      const url = `${MERKL_API}/opportunities?${params.toString()}`;

      let data: MerklOpportunity[];
      try {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Merkl API returned ${res.status}: ${res.statusText}`);
        }
        data = await res.json() as MerklOpportunity[];
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { error: `Failed to fetch Merkl opportunities: ${(err as Error).message}` },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      // Filter to only LIVE opportunities
      const live = data.filter((o) => o.status === "LIVE");

      const results = live.map((o) => {
        const base: Record<string, unknown> = {
          name: o.name,
          identifier: o.identifier,
          type: o.type,
          action: o.action,
          protocol: o.protocol?.name ?? o.protocol?.id ?? "unknown",
          status: o.status,
          tvl: `$${o.tvl.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
          totalApr: `${o.apr.toFixed(2)}%`,
          dailyRewards: `$${o.dailyRewards.toFixed(2)}`,
          liveCampaigns: o.liveCampaigns,
          tokens: o.tokens?.map((t) => t.symbol) ?? [],
        };

        // APR breakdown — exclude zero-APR entries
        if (o.aprRecord?.breakdowns?.length) {
          const nonZero = o.aprRecord.breakdowns.filter((b) => b.value > 0);
          if (nonZero.length) {
            base.aprBreakdown = nonZero.map((b) => ({
              type: b.type,
              apr: `${b.value.toFixed(2)}%`,
              identifier: b.identifier,
            }));
          }
        }

        // Reward breakdown — exclude zero-value entries
        if (o.rewardsRecord?.breakdowns?.length) {
          const nonZero = o.rewardsRecord.breakdowns.filter((b) => b.value > 0);
          if (nonZero.length) {
            base.rewardTokens = nonZero.map((b) => ({
              token: b.token?.symbol ?? "unknown",
              address: b.token?.address,
              dailyValue: `$${b.value.toFixed(2)}`,
              dailyAmount: b.amount,
              distributionType: b.distributionType,
            }));
          }
        }

        // Campaign details (if requested) — only live campaigns
        if (campaigns && o.campaigns?.length) {
          const liveCampaigns = o.campaigns.filter(
            (c) => c.campaignStatus?.status === "LIVE"
          );
          if (liveCampaigns.length) {
            base.campaigns = liveCampaigns.map((c) => ({
              id: c.id,
              type: c.type,
              rewardToken: c.rewardToken?.symbol,
              rewardTokenAddress: c.rewardToken?.address,
              rewardTokenPrice: c.rewardToken?.price,
              apr: `${c.apr.toFixed(2)}%`,
              dailyRewards: `$${c.dailyRewards.toFixed(2)}`,
              distributionType: c.distributionType,
              start: new Date(c.startTimestamp * 1000).toISOString(),
              end: new Date(c.endTimestamp * 1000).toISOString(),
            }));
          }
        }

        return base;
      });

      // Sort by TVL descending
      results.sort((a, b) => {
        const tvlA = parseFloat((a.tvl as string).replace(/[$,]/g, ""));
        const tvlB = parseFloat((b.tvl as string).replace(/[$,]/g, ""));
        return tvlB - tvlA;
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                chainId: KATANA_CHAIN_ID,
                protocol: protocol === "all" ? "all protocols" : protocol,
                action: action === "all" ? "all actions" : action,
                totalOpportunities: results.length,
                opportunities: results,
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
