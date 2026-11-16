import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseUnits, formatUnits, encodeFunctionData, type Address } from "viem";
import { getClient } from "../../clients.js";
import { KAT_CONTRACTS } from "../../config/contracts.js";
import { getChain } from "../../config/chains.js";
import { avKatVaultAbi, votingEscrowAbi } from "../../abis/kat.js";
import { getExitParams, formatExitNote } from "./exit-params.js";

export function registerBuildWithdrawVault(server: McpServer) {
  server.registerTool(
    "build_kat_withdraw_vault",
    {
      description:
        "Build an unsigned transaction to unstake avKAT through the vault — step 1 of exiting avKAT back to KAT. Calls withdrawTokenId on the avKAT vault, which burns avKAT and mints a new vKAT NFT holding the underlying KAT. Then call build_kat_begin_withdrawal with the new token ID (find it with get_kat_locks) to start the exit cooldown, and build_kat_withdraw to receive KAT. Cooldown and exit fee are read live from the on-chain ExitQueue and returned as exitParams. The KAT value unstaked must be at least the VotingEscrow minimum lock (minDeposit, read live — 230 KAT at time of writing); smaller amounts are rejected. No approval is needed when the owner sends the transaction. For an instant exit at the market rate instead, swap avKAT for KAT on Katana Swap.",
      inputSchema: {
        amount: z
          .string()
          .describe("Amount to unstake (human-readable, e.g. '1000'), in the unit given by amountIn"),
        amountIn: z
          .enum(["avKAT", "KAT"])
          .default("avKAT")
          .describe("'avKAT' (default) = amount of avKAT to unstake, converted to its KAT value at the current exchange rate. 'KAT' = exact amount of underlying KAT to withdraw"),
        owner: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
          .describe("Address that holds the avKAT (the transaction sender)"),
        receiver: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
          .optional()
          .describe("Address to receive the vKAT NFT (defaults to owner)"),
      },
    },
    async ({ amount, amountIn, owner, receiver }) => {
      const chain = getChain("mainnet");
      const client = getClient("mainnet");
      const vaultAddr = KAT_CONTRACTS.mainnet.avKatVault;
      const nftReceiver = (receiver ?? owner) as Address;
      const parsed = parseUnits(amount, 18);

      // withdrawTokenId takes the KAT (assets) amount, not avKAT shares
      const assets =
        amountIn === "KAT"
          ? parsed
          : await client.readContract({
              address: vaultAddr,
              abi: avKatVaultAbi,
              functionName: "convertToAssets",
              args: [parsed],
            });

      // The vault mints a vKAT lock for the withdrawn KAT, so the escrow's minimum lock size applies.
      // Below it, withdrawTokenId reverts with AmountTooSmall().
      const minDeposit = await client.readContract({
        address: KAT_CONTRACTS.mainnet.votingEscrow,
        abi: votingEscrowAbi,
        functionName: "minDeposit",
      });
      if (assets < minDeposit) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Amount too small: ${formatUnits(assets, 18)} KAT is below the minimum of ${formatUnits(minDeposit, 18)} KAT that can be unstaked through the vault (withdrawTokenId would revert with AmountTooSmall). Unstake at least ${formatUnits(minDeposit, 18)} KAT worth of avKAT, or swap avKAT for KAT on Katana Swap instead.`,
                katAmount: formatUnits(assets, 18),
                minimumKat: formatUnits(minDeposit, 18),
              }),
            },
          ],
          isError: true,
        };
      }

      const [data, exitParams] = await Promise.all([
        encodeFunctionData({
          abi: avKatVaultAbi,
          functionName: "withdrawTokenId",
          args: [assets, nftReceiver, owner as Address],
        }),
        getExitParams("mainnet"),
      ]);

      const katAmount = formatUnits(assets, 18);

      const tx = {
        to: vaultAddr,
        data,
        value: "0",
        chainId: chain.id,
        description:
          amountIn === "KAT"
            ? `Unstake ${katAmount} KAT from the avKAT vault → new vKAT NFT`
            : `Unstake ${amount} avKAT (${katAmount} KAT) from the avKAT vault → new vKAT NFT`,
        katAmount,
        minimumKat: formatUnits(minDeposit, 18),
        note: `Burns avKAT and mints a new vKAT NFT to ${nftReceiver}. The NFT earns no rewards. Next: get the token ID with get_kat_locks, then build_kat_begin_withdrawal, then build_kat_withdraw. ${formatExitNote(exitParams)}`,
        exitParams,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(tx) }],
      };
    }
  );
}
