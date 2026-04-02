import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseUnits, encodeFunctionData, formatUnits, type Address } from "viem";
import { getClient } from "../../clients.js";
import { type NetworkName } from "../../config/contracts.js";
import { metaMorphoAbi } from "../../abis/metamorpho.js";
import { erc20Abi } from "../../abis/erc20.js";
import { getChain } from "../../config/chains.js";

export function registerBuildVaultWithdraw(server: McpServer) {
  server.registerTool(
    "build_morpho_vault_withdraw",
    {
      description:
        "Build an unsigned transaction to withdraw from a MetaMorpho vault (ERC-4626) on Katana. Supports two modes: withdraw by asset amount (specify exact assets to receive) or redeem by share amount (specify vault shares to burn). Use get_morpho_vault_detail to check withdrawal liquidity first — withdrawals may fail if market utilization is too high.",
      inputSchema: {
        vault: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
          .describe("MetaMorpho vault address (from list_morpho_vaults)"),
        amount: z
          .string()
          .describe("Amount to withdraw or redeem (human-readable, e.g. '1000')"),
        mode: z
          .enum(["withdraw", "redeem"])
          .default("withdraw")
          .describe("'withdraw' = specify asset amount to receive, 'redeem' = specify shares to burn"),
        receiver: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
          .describe("Address to receive the withdrawn assets"),
        owner: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
          .describe("Address that owns the vault shares (usually same as receiver)"),
        network: z
          .enum(["mainnet", "testnet"])
          .default("mainnet")
          .describe("Katana mainnet or Bokuto testnet"),
      },
    },
    async ({ vault, amount, mode, receiver, owner, network }) => {
      const net = network as NetworkName;
      const client = getClient(net);
      const chain = getChain(net);
      const vaultAddr = vault as Address;

      // Read vault metadata
      const [asset, vaultSymbol, vaultDecimals] = await Promise.all([
        client.readContract({ address: vaultAddr, abi: metaMorphoAbi, functionName: "asset" }),
        client.readContract({ address: vaultAddr, abi: metaMorphoAbi, functionName: "symbol" }),
        client.readContract({ address: vaultAddr, abi: metaMorphoAbi, functionName: "decimals" }),
      ]);

      const assetAddr = asset as Address;
      const vaultDec = vaultDecimals as number;

      const [assetSymbol, assetDecimals] = await Promise.all([
        client.readContract({ address: assetAddr, abi: erc20Abi, functionName: "symbol" }).catch(() => "UNKNOWN"),
        client.readContract({ address: assetAddr, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
      ]);

      const assetDec = assetDecimals as number;
      const ownerAddr = owner as Address;
      const receiverAddr = receiver as Address;

      if (mode === "redeem") {
        // Redeem: user specifies shares to burn, receives proportional assets
        const shares = parseUnits(amount, vaultDec);

        const previewAssets = await client.readContract({
          address: vaultAddr,
          abi: metaMorphoAbi,
          functionName: "previewRedeem",
          args: [shares],
        });

        const maxRedeemable = await client.readContract({
          address: vaultAddr,
          abi: metaMorphoAbi,
          functionName: "maxRedeem",
          args: [ownerAddr],
        });

        const data = encodeFunctionData({
          abi: metaMorphoAbi,
          functionName: "redeem",
          args: [shares, receiverAddr, ownerAddr],
        });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              to: vaultAddr,
              data,
              value: "0",
              chainId: chain.id,
              description: `Redeem ${amount} ${vaultSymbol} shares for ${assetSymbol}`,
              vault: { address: vaultAddr, symbol: vaultSymbol as string },
              asset: { address: assetAddr, symbol: assetSymbol as string, decimals: assetDec },
              preview: {
                sharesBurned: amount,
                assetsReceived: formatUnits(previewAssets as bigint, assetDec),
              },
              maxRedeemable: formatUnits(maxRedeemable as bigint, vaultDec),
            }),
          }],
        };
      }

      // Withdraw: user specifies exact asset amount to receive
      const assets = parseUnits(amount, assetDec);

      const previewShares = await client.readContract({
        address: vaultAddr,
        abi: metaMorphoAbi,
        functionName: "previewWithdraw",
        args: [assets],
      });

      const maxWithdrawable = await client.readContract({
        address: vaultAddr,
        abi: metaMorphoAbi,
        functionName: "maxWithdraw",
        args: [ownerAddr],
      });

      const data = encodeFunctionData({
        abi: metaMorphoAbi,
        functionName: "withdraw",
        args: [assets, receiverAddr, ownerAddr],
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            to: vaultAddr,
            data,
            value: "0",
            chainId: chain.id,
            description: `Withdraw ${amount} ${assetSymbol} from ${vaultSymbol} vault`,
            vault: { address: vaultAddr, symbol: vaultSymbol as string },
            asset: { address: assetAddr, symbol: assetSymbol as string, decimals: assetDec },
            preview: {
              assetsReceived: amount,
              sharesBurned: formatUnits(previewShares as bigint, vaultDec),
            },
            maxWithdrawable: formatUnits(maxWithdrawable as bigint, assetDec),
            note: parseFloat(formatUnits(maxWithdrawable as bigint, assetDec)) < parseFloat(amount)
              ? `WARNING: Max withdrawable (${formatUnits(maxWithdrawable as bigint, assetDec)} ${assetSymbol}) is less than requested amount. Some vault markets may have high utilization locking liquidity. Use get_morpho_vault_detail to inspect per-market liquidity.`
              : undefined,
          }),
        }],
      };
    }
  );
}
