import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseUnits, encodeFunctionData, type Address } from "viem";
import { KAT_CONTRACTS } from "../../config/contracts.js";
import { getChain } from "../../config/chains.js";
import { avKatVaultAbi } from "../../abis/kat.js";

export function registerBuildDepositVault(server: McpServer) {
  server.registerTool(
    "build_kat_deposit_vault",
    {
      description:
        "Build an unsigned transaction to deposit KAT into the avKAT vault (ERC-4626). Returns liquid, transferable avKAT shares that auto-compound rewards. User must first approve the avKAT vault to spend their KAT. Note: KAT is currently non-transferable — this will revert until KAT unlock (expected after Q1 2026).",
      inputSchema: {
        amount: z
          .string()
          .describe("Amount of KAT to deposit (human-readable, e.g. '1000')"),
        receiver: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
          .describe("Address to receive avKAT shares (usually the user's own address)"),
      },
    },
    async ({ amount, receiver }) => {
      const chain = getChain("mainnet");
      const vaultAddr = KAT_CONTRACTS.mainnet.avKatVault;
      const assets = parseUnits(amount, 18);

      const data = encodeFunctionData({
        abi: avKatVaultAbi,
        functionName: "deposit",
        args: [assets, receiver as Address],
      });

      const tx = {
        to: vaultAddr,
        data,
        value: "0",
        chainId: chain.id,
        description: `Deposit ${amount} KAT → avKAT vault`,
        note: `User must approve avKAT vault (${vaultAddr}) to spend KAT first. KAT is currently non-transferable — this will revert until unlock.`,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(tx) }],
      };
    }
  );
}
