import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatUnits, type Address } from "viem";
import { getClient } from "../../clients.js";
import { MORPHO_CONTRACTS, type NetworkName } from "../../config/contracts.js";
import { morphoAbi } from "../../abis/morpho.js";
import { erc20Abi } from "../../abis/erc20.js";

const inputSchema = {
  marketIds: z
    .string()
    .describe(
      "Comma-separated Morpho market IDs (bytes32 hex strings). Get these from the Morpho UI or on-chain events."
    ),
  network: z
    .enum(["mainnet", "testnet"])
    .default("mainnet")
    .describe("Katana mainnet or Bokuto testnet"),
};

export function registerGetMarkets(server: McpServer) {
  server.registerTool(
    "get_morpho_markets",
    {
      description:
        "Get details for one or more Morpho Blue markets on Katana. Returns market parameters (loan token, collateral token, oracle, IRM, LLTV) and current state (total supply, total borrow, utilization rate, fee).",
      inputSchema,
    },
    async ({ marketIds, network }) => {
      const net = network as NetworkName;
      const client = getClient(net);
      const morpho = MORPHO_CONTRACTS.mainnet.morpho;

      const ids = marketIds.split(",").map((id) => id.trim() as `0x${string}`);

      const markets = await Promise.allSettled(
        ids.map(async (id) => {
          // Get market params and state in parallel
          const [params, state] = await Promise.all([
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

          // Get token symbols and decimals
          const [loanSymbol, loanDecimals, collateralSymbol, collateralDecimals] =
            await Promise.all([
              client.readContract({ address: params.loanToken as Address, abi: erc20Abi, functionName: "symbol" }).catch(() => "N/A"),
              client.readContract({ address: params.loanToken as Address, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
              client.readContract({ address: params.collateralToken as Address, abi: erc20Abi, functionName: "symbol" }).catch(() => "N/A"),
              client.readContract({ address: params.collateralToken as Address, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
            ]);

          const totalSupplyAssets = state[0];
          const totalBorrowAssets = state[2];
          const utilization =
            totalSupplyAssets > 0n
              ? Number((totalBorrowAssets * 10000n) / totalSupplyAssets) / 100
              : 0;

          return {
            id,
            params: {
              loanToken: { address: params.loanToken, symbol: loanSymbol, decimals: loanDecimals },
              collateralToken: { address: params.collateralToken, symbol: collateralSymbol, decimals: collateralDecimals },
              oracle: params.oracle,
              irm: params.irm,
              lltv: `${Number(params.lltv) / 1e16}%`,
              lltvRaw: params.lltv.toString(),
            },
            state: {
              totalSupplyAssets: formatUnits(totalSupplyAssets, loanDecimals),
              totalSupplyShares: state[1].toString(),
              totalBorrowAssets: formatUnits(totalBorrowAssets, loanDecimals),
              totalBorrowShares: state[3].toString(),
              utilization: `${utilization.toFixed(2)}%`,
              lastUpdate: new Date(Number(state[4]) * 1000).toISOString(),
              fee: `${Number(state[5]) / 1e16}%`,
            },
          };
        })
      );

      const results = markets.map((r, i) =>
        r.status === "fulfilled"
          ? r.value
          : { id: ids[i], error: (r.reason as Error).message }
      );

      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ network, markets: results }, null, 2) },
        ],
      };
    }
  );
}
