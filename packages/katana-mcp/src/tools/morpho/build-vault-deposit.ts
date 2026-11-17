import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseUnits, encodeFunctionData, formatUnits, type Address } from "viem";
import { getClient } from "../../clients.js";
import { type NetworkName } from "../../config/contracts.js";
import { metaMorphoAbi } from "../../abis/metamorpho.js";
import { erc20Abi } from "../../abis/erc20.js";
import { getTokenDecimals } from "./token-meta.js";
import { quoteSafe, withBackoff } from "./swap-utils.js";
import { getChain } from "../../config/chains.js";

export function registerBuildVaultDeposit(server: McpServer) {
  server.registerTool(
    "build_morpho_vault_deposit",
    {
      description:
        "Build an unsigned transaction to deposit into a Morpho vault on Katana — MetaMorpho (v1) or Vault V2 (both ERC-4626). Vaults allocate deposits across Morpho Blue markets (v1) or through adapters (V2) — simpler than direct market supply. Use list_morpho_vaults to discover vaults first, and prefer listed vaults without RED warnings. User must approve the vault to spend the underlying asset.",
      inputSchema: {
        vault: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
          .describe("Morpho vault address — MetaMorpho (v1) or Vault V2 (from list_morpho_vaults)"),
        amount: z
          .string()
          .describe("Amount of underlying asset to deposit (human-readable, e.g. '1000')"),
        receiver: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
          .describe("Address to receive vault shares (usually the user's own address)"),
        network: z
          .enum(["mainnet", "testnet"])
          .default("mainnet")
          .describe("Katana mainnet or Bokuto testnet"),
      },
    },
    quoteSafe(async ({ vault, amount, receiver, network }) => {
      const net = network as NetworkName;
      const client = getClient(net);
      const chain = getChain(net);
      const vaultAddr = vault as Address;

      // Read vault metadata to get asset and preview shares
      const [asset, vaultSymbol, vaultDecimals] = await Promise.all([
        withBackoff(() => client.readContract({ address: vaultAddr, abi: metaMorphoAbi, functionName: "asset" })),
        withBackoff(() => client.readContract({ address: vaultAddr, abi: metaMorphoAbi, functionName: "symbol" })),
        withBackoff(() => client.readContract({ address: vaultAddr, abi: metaMorphoAbi, functionName: "decimals" })),
      ]);

      const assetAddr = asset as Address;

      // Get asset info
      const [assetSymbol, assetDecimals] = await Promise.all([
        withBackoff(() => client.readContract({ address: assetAddr, abi: erc20Abi, functionName: "symbol" })).catch(() => "UNKNOWN"),
        getTokenDecimals(client, assetAddr),
      ]);

      const assets = parseUnits(amount, assetDecimals as number);

      // Preview how many shares the user will receive
      const previewShares = await withBackoff(() => client.readContract({
        address: vaultAddr,
        abi: metaMorphoAbi,
        functionName: "previewDeposit",
        args: [assets],
      }));

      const data = encodeFunctionData({
        abi: metaMorphoAbi,
        functionName: "deposit",
        args: [assets, receiver as Address],
      });

      const tx = {
        to: vaultAddr,
        data,
        value: "0",
        chainId: chain.id,
        description: `Deposit ${amount} ${assetSymbol} into ${vaultSymbol} vault`,
        note: `User must approve vault (${vaultAddr}) to spend ${assetSymbol} first.`,
        vault: {
          address: vaultAddr,
          symbol: vaultSymbol as string,
        },
        asset: {
          address: assetAddr,
          symbol: assetSymbol as string,
          decimals: assetDecimals as number,
        },
        preview: {
          sharesReceived: formatUnits(previewShares as bigint, vaultDecimals as number),
        },
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(tx) }],
      };
    }, { annotatePublicRpc: false })
  );
}
