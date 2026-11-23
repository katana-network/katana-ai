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

// Morpho Vault V2 has a liquidityAdapter() getter; MetaMorpho v1 does not.
const vaultV2Abi = [
  { type: "function", name: "liquidityAdapter", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

async function isVaultV2(client: ReturnType<typeof getClient>, vault: Address): Promise<boolean> {
  try {
    await withBackoff(() => client.readContract({ address: vault, abi: vaultV2Abi, functionName: "liquidityAdapter" }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Simulate the exact withdraw/redeem call from the owner. Vault V2 always
 * returns 0 from maxWithdraw/maxRedeem (ERC-4626 max* are not implemented
 * there), so simulation is the reliable liquidity check for both versions.
 */
async function simulateExit(
  client: ReturnType<typeof getClient>,
  vault: Address,
  owner: Address,
  data: `0x${string}`
): Promise<{ status: "ok" } | { status: "reverts"; reason: string } | { status: "unknown"; reason: string }> {
  try {
    await withBackoff(() => client.call({ account: owner, to: vault, data }));
    return { status: "ok" };
  } catch (e) {
    const msg = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message ?? "";
    const details = (e as { details?: string }).details ?? "";
    if (/revert/i.test(`${msg} ${details}`)) return { status: "reverts", reason: msg.split("\n")[0] };
    return { status: "unknown", reason: "could not simulate (RPC error or rate limit)" };
  }
}

function exitCheckNote(
  check: Awaited<ReturnType<typeof simulateExit>>,
  version: "v1" | "v2",
  callerNote: string
): string | undefined {
  if (check.status === "ok") return undefined;
  if (check.status === "reverts")
    return `WARNING: simulating this ${callerNote} from the owner reverts (${check.reason}). Likely causes: amount above the owner's balance, or not enough liquidity in the vault's ${version === "v2" ? "adapters (check liquidity with get_morpho_vault_detail)" : "markets (high utilization — check per-market liquidity with get_morpho_vault_detail)"}.`;
  return `Could not verify this ${callerNote} by simulation (${check.reason}). Check liquidity with get_morpho_vault_detail before submitting.`;
}

export function registerBuildVaultWithdraw(server: McpServer) {
  server.registerTool(
    "build_morpho_vault_withdraw",
    {
      description:
        "Build an unsigned transaction to withdraw from a Morpho vault on Katana — MetaMorpho (v1) or Vault V2 (both ERC-4626). Two modes: withdraw by asset amount (exact assets to receive) or redeem by share amount (shares to burn). Simulates the call from the owner and returns liquidityCheck (ok / reverts / unknown) — Vault V2 always reports 0 from maxWithdraw/maxRedeem, so the simulation is the reliable check. If it reverts, use get_morpho_vault_detail to inspect liquidity.",
      inputSchema: {
        vault: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
          .describe("Morpho vault address — MetaMorpho (v1) or Vault V2 (from list_morpho_vaults)"),
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
    quoteSafe(async ({ vault, amount, mode, receiver, owner, network }) => {
      const net = network as NetworkName;
      const client = getClient(net);
      const chain = getChain(net);
      const vaultAddr = vault as Address;

      // Read vault metadata
      const [asset, vaultSymbol, vaultDecimals] = await Promise.all([
        withBackoff(() => client.readContract({ address: vaultAddr, abi: metaMorphoAbi, functionName: "asset" })),
        withBackoff(() => client.readContract({ address: vaultAddr, abi: metaMorphoAbi, functionName: "symbol" })),
        withBackoff(() => client.readContract({ address: vaultAddr, abi: metaMorphoAbi, functionName: "decimals" })),
      ]);

      const assetAddr = asset as Address;
      const vaultDec = vaultDecimals as number;

      const [assetSymbol, assetDecimals] = await Promise.all([
        withBackoff(() => client.readContract({ address: assetAddr, abi: erc20Abi, functionName: "symbol" })).catch(() => "UNKNOWN"),
        getTokenDecimals(client, assetAddr),
      ]);

      const assetDec = assetDecimals as number;
      const ownerAddr = owner as Address;
      const receiverAddr = receiver as Address;
      const version: "v1" | "v2" = (await isVaultV2(client, vaultAddr)) ? "v2" : "v1";

      if (mode === "redeem") {
        // Redeem: user specifies shares to burn, receives proportional assets
        const shares = parseUnits(amount, vaultDec);

        const previewAssets = await withBackoff(() => client.readContract({
          address: vaultAddr,
          abi: metaMorphoAbi,
          functionName: "previewRedeem",
          args: [shares],
        }));

        const data = encodeFunctionData({
          abi: metaMorphoAbi,
          functionName: "redeem",
          args: [shares, receiverAddr, ownerAddr],
        });

        // v1 reports maxRedeem; V2 always returns 0, so it is omitted there
        const maxRedeemable =
          version === "v1"
            ? await withBackoff(() => client.readContract({ address: vaultAddr, abi: metaMorphoAbi, functionName: "maxRedeem", args: [ownerAddr] }))
            : null;
        const check = await simulateExit(client, vaultAddr, ownerAddr, data);

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
              vaultVersion: version,
              maxRedeemable: maxRedeemable === null ? null : formatUnits(maxRedeemable as bigint, vaultDec),
              liquidityCheck: check.status,
              note: exitCheckNote(check, version, "redeem"),
            }),
          }],
        };
      }

      // Withdraw: user specifies exact asset amount to receive
      const assets = parseUnits(amount, assetDec);

      const previewShares = await withBackoff(() => client.readContract({
        address: vaultAddr,
        abi: metaMorphoAbi,
        functionName: "previewWithdraw",
        args: [assets],
      }));

      const data = encodeFunctionData({
        abi: metaMorphoAbi,
        functionName: "withdraw",
        args: [assets, receiverAddr, ownerAddr],
      });

      // v1 reports maxWithdraw; V2 always returns 0, so it is omitted there
      const maxWithdrawable =
        version === "v1"
          ? await withBackoff(() => client.readContract({ address: vaultAddr, abi: metaMorphoAbi, functionName: "maxWithdraw", args: [ownerAddr] }))
          : null;
      const check = await simulateExit(client, vaultAddr, ownerAddr, data);

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
            vaultVersion: version,
            maxWithdrawable: maxWithdrawable === null ? null : formatUnits(maxWithdrawable as bigint, assetDec),
            liquidityCheck: check.status,
            note: exitCheckNote(check, version, "withdrawal"),
          }),
        }],
      };
    }, { annotatePublicRpc: false })
  );
}
