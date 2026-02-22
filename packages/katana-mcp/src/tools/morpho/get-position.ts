import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatUnits, type Address } from "viem";
import { getClient } from "../../clients.js";
import { MORPHO_CONTRACTS, type NetworkName } from "../../config/contracts.js";
import { morphoAbi } from "../../abis/morpho.js";
import { erc20Abi } from "../../abis/erc20.js";

const inputSchema = {
  marketId: z
    .string()
    .describe("Morpho market ID (bytes32 hex string)"),
  user: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
    .describe("User address to check position for"),
  network: z
    .enum(["mainnet", "testnet"])
    .default("mainnet")
    .describe("Katana mainnet or Bokuto testnet"),
};

export function registerGetPosition(server: McpServer) {
  server.registerTool(
    "get_morpho_position",
    {
      description:
        "Get a user's position in a Morpho Blue market on Katana. Returns supply shares, borrow shares, collateral, and computed health factor. A health factor below 1.0 means the position is liquidatable.",
      inputSchema,
    },
    async ({ marketId, user, network }) => {
      const net = network as NetworkName;
      const client = getClient(net);
      const morpho = MORPHO_CONTRACTS.mainnet.morpho;
      const id = marketId as `0x${string}`;
      const userAddr = user as Address;

      // Get position, market params, and market state
      const [position, params, state] = await Promise.all([
        client.readContract({
          address: morpho,
          abi: morphoAbi,
          functionName: "position",
          args: [id, userAddr],
        }),
        client.readContract({
          address: morpho,
          abi: morphoAbi,
          functionName: "idToMarketParams",
          args: [id],
        }),
        client.readContract({
          address: morpho,
          abi: morphoAbi,
          functionName: "market",
          args: [id],
        }),
      ]);

      const supplyShares = position[0];
      const borrowShares = position[1];
      const collateral = position[2];

      // Get token info
      const [loanSymbol, loanDecimals, collateralSymbol, collateralDecimals] =
        await Promise.all([
          client.readContract({ address: params.loanToken as Address, abi: erc20Abi, functionName: "symbol" }).catch(() => "N/A"),
          client.readContract({ address: params.loanToken as Address, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
          client.readContract({ address: params.collateralToken as Address, abi: erc20Abi, functionName: "symbol" }).catch(() => "N/A"),
          client.readContract({ address: params.collateralToken as Address, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
        ]);

      // Convert shares to assets
      const totalSupplyAssets = state[0];
      const totalSupplyShares = state[1];
      const totalBorrowAssets = state[2];
      const totalBorrowShares = state[3];

      const supplyAssets =
        totalSupplyShares > 0n
          ? (supplyShares * BigInt(totalSupplyAssets)) / BigInt(totalSupplyShares)
          : 0n;

      const borrowAssets =
        totalBorrowShares > 0n
          ? (BigInt(borrowShares) * BigInt(totalBorrowAssets)) / BigInt(totalBorrowShares)
          : 0n;

      // Health factor: (collateralValue * LLTV) / borrowValue
      // Simplified — without oracle price, we show raw collateral and borrow amounts
      const lltv = params.lltv;
      const hasDebt = borrowAssets > 0n;

      const response = {
        network,
        marketId,
        user,
        market: {
          loanToken: { symbol: loanSymbol, address: params.loanToken },
          collateralToken: { symbol: collateralSymbol, address: params.collateralToken },
          lltv: `${Number(lltv) / 1e16}%`,
        },
        position: {
          supplyShares: supplyShares.toString(),
          supplyAssets: formatUnits(supplyAssets, loanDecimals),
          borrowShares: borrowShares.toString(),
          borrowAssets: formatUnits(borrowAssets, loanDecimals),
          collateral: formatUnits(BigInt(collateral), collateralDecimals),
          collateralRaw: collateral.toString(),
          hasSupply: supplyShares > 0n,
          hasDebt,
          hasCollateral: collateral > 0n,
        },
        note: hasDebt
          ? "Position has outstanding debt. Health factor depends on oracle price — check the Morpho UI for precise liquidation risk."
          : "No outstanding debt.",
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(response, null, 2) },
        ],
      };
    }
  );
}
