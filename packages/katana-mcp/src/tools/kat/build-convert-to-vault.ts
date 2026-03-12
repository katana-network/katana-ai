import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData, type Address } from "viem";
import { KAT_CONTRACTS } from "../../config/contracts.js";
import { getChain } from "../../config/chains.js";
import { avKatVaultAbi } from "../../abis/kat.js";

export function registerBuildConvertToVault(server: McpServer) {
  server.registerTool(
    "build_kat_convert_to_vault",
    {
      description:
        "Build an unsigned transaction to convert a vKAT NFT into avKAT vault shares. This is a one-way operation — the vKAT NFT is consumed and merged into the vault's master position. User must approve the avKAT vault as an NFT operator first (setApprovalForAll on the NFT Lock contract).",
      inputSchema: {
        tokenId: z
          .string()
          .describe("The vKAT NFT token ID to deposit into the vault"),
        receiver: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
          .describe("Address to receive avKAT shares"),
      },
    },
    async ({ tokenId, receiver }) => {
      const chain = getChain("mainnet");
      const vaultAddr = KAT_CONTRACTS.mainnet.avKatVault;
      const nftLockAddr = KAT_CONTRACTS.mainnet.nftLock;

      const data = encodeFunctionData({
        abi: avKatVaultAbi,
        functionName: "depositTokenId",
        args: [BigInt(tokenId), receiver as Address],
      });

      const tx = {
        to: vaultAddr,
        data,
        value: "0",
        chainId: chain.id,
        description: `Convert vKAT #${tokenId} → avKAT vault shares (one-way, NFT consumed)`,
        note: `User must call setApprovalForAll(${vaultAddr}, true) on NFT Lock (${nftLockAddr}) first. This is irreversible — the vKAT NFT will be burned.`,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(tx) }],
      };
    }
  );
}
