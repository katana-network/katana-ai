import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerBuildStake } from "./build-stake.js";
import { registerBuildDepositVault } from "./build-deposit-vault.js";
import { registerBuildConvertToVault } from "./build-convert-to-vault.js";
import { registerBuildBeginWithdrawal } from "./build-begin-withdrawal.js";
import { registerBuildWithdraw } from "./build-withdraw.js";
import { registerBuildCancelWithdrawal } from "./build-cancel-withdrawal.js";
import { registerBuildVote } from "./build-vote.js";
import { registerBuildResetVotes } from "./build-reset-votes.js";
import { registerBuildMerge } from "./build-merge.js";
import { registerBuildSplit } from "./build-split.js";
import { registerGetLocks } from "./get-locks.js";
import { registerGetGauges } from "./get-gauges.js";

export function registerKatTools(server: McpServer) {
  registerBuildStake(server);
  registerBuildDepositVault(server);
  registerBuildConvertToVault(server);
  registerBuildBeginWithdrawal(server);
  registerBuildWithdraw(server);
  registerBuildCancelWithdrawal(server);
  registerBuildVote(server);
  registerBuildResetVotes(server);
  registerBuildMerge(server);
  registerBuildSplit(server);
  registerGetLocks(server);
  registerGetGauges(server);
}
