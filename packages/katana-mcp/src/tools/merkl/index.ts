import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetMerklOpportunities } from "./get-opportunities.js";
import { registerGetMerklUserRewards } from "./get-user-rewards.js";
import { registerBuildClaimRewards } from "./build-claim-rewards.js";

export function registerMerklTools(server: McpServer) {
  registerGetMerklOpportunities(server);  // get_merkl_opportunities
  registerGetMerklUserRewards(server);    // get_merkl_user_rewards
  registerBuildClaimRewards(server);      // build_claim_rewards
}
