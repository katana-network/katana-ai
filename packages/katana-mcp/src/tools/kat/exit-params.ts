import { getClient } from "../../clients.js";
import { KAT_CONTRACTS, type NetworkName } from "../../config/contracts.js";
import { exitQueueAbi } from "../../abis/kat.js";

export interface ExitParams {
  cooldownSeconds: number;
  cooldownDays: number;
  maxFeeBps: number;
  maxFeePercent: string;
  minFeeBps: number;
  minFeePercent: string;
}

/**
 * Read current exit queue parameters from the on-chain ExitQueue contract.
 * These values can change over time (e.g. governance updates), so they
 * should always be fetched live rather than hardcoded.
 */
export async function getExitParams(
  network: NetworkName = "mainnet"
): Promise<ExitParams> {
  const client = getClient(network);
  const exitQueueAddr = KAT_CONTRACTS.mainnet.exitQueue;

  const [cooldown, maxFee, minFee] = await Promise.all([
    client.readContract({
      address: exitQueueAddr,
      abi: exitQueueAbi,
      functionName: "cooldown",
    }),
    client.readContract({
      address: exitQueueAddr,
      abi: exitQueueAbi,
      functionName: "feePercent",
    }),
    client.readContract({
      address: exitQueueAddr,
      abi: exitQueueAbi,
      functionName: "minFeePercent",
    }),
  ]);

  const cooldownSeconds = Number(cooldown);
  const maxFeeBps = Number(maxFee);
  const minFeeBps = Number(minFee);

  return {
    cooldownSeconds,
    cooldownDays: Math.round(cooldownSeconds / 86400),
    maxFeeBps,
    maxFeePercent: `${(maxFeeBps / 100).toFixed(1)}%`,
    minFeeBps,
    minFeePercent: `${(minFeeBps / 100).toFixed(1)}%`,
  };
}

/** Format exit params into a human-readable note string. */
export function formatExitNote(params: ExitParams): string {
  return `Cooldown: ${params.cooldownDays} days. Fee: ${params.maxFeePercent} (day 0) → ${params.minFeePercent} (day ${params.cooldownDays}).`;
}
