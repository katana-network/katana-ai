import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseUnits, encodeFunctionData, type Address } from "viem";
import { getClient } from "../../clients.js";
import { MORPHO_CONTRACTS, getTokenByAddress, type NetworkName } from "../../config/contracts.js";
import { morphoAbi } from "../../abis/morpho.js";
import { erc20Abi } from "../../abis/erc20.js";
import { getChain } from "../../config/chains.js";

const inputSchema = {
  marketId: z
    .string()
    .describe("Morpho market ID (bytes32 hex string)"),
  amount: z
    .string()
    .describe("Amount of loan token to supply (human-readable, e.g. '1000')"),
  onBehalf: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
    .describe("Address to supply on behalf of (usually the user's own address)"),
  network: z
    .enum(["mainnet", "testnet"])
    .default("mainnet")
    .describe("Katana mainnet or Bokuto testnet"),
};

export function registerBuildSupply(server: McpServer) {
  server.registerTool(
    "build_morpho_supply",
    {
      description:
        "Build an unsigned transaction to supply (lend) assets to a Morpho Blue market on Katana. User earns interest on supplied assets. User must approve the Morpho contract to spend the loan token first.",
      inputSchema,
    },
    async ({ marketId, amount, onBehalf, network }) => {
      const net = network as NetworkName;
      const client = getClient(net);
      const chain = getChain(net);
      const morphoAddr = MORPHO_CONTRACTS.mainnet.morpho;
      const id = marketId as `0x${string}`;

      // Get market params to know the loan token
      const params = await client.readContract({
        address: morphoAddr,
        abi: morphoAbi,
        functionName: "idToMarketParams",
        args: [id],
      });

      // Try known token config first, then RPC
      const knownToken = getTokenByAddress(net, params.loanToken as string);
      let loanDecimals: number;
      let loanSymbol: string;
      if (knownToken) {
        loanDecimals = knownToken.decimals;
        loanSymbol = knownToken.symbol;
      } else {
        loanDecimals = await client.readContract({
          address: params.loanToken as Address, abi: erc20Abi, functionName: "decimals",
        }).catch(() => { throw new Error(`Cannot read decimals for loan token ${params.loanToken}. Token may not implement standard ERC20.`); });
        loanSymbol = await client.readContract({
          address: params.loanToken as Address, abi: erc20Abi, functionName: "symbol",
        }).catch(() => params.loanToken as string);
      }

      const assets = parseUnits(amount, loanDecimals);

      const data = encodeFunctionData({
        abi: morphoAbi,
        functionName: "supply",
        args: [
          {
            loanToken: params.loanToken,
            collateralToken: params.collateralToken,
            oracle: params.oracle,
            irm: params.irm,
            lltv: params.lltv,
          },
          assets,
          0n, // shares = 0 means supply by asset amount
          onBehalf as Address,
          "0x", // no callback data
        ],
      });

      const tx = {
        to: morphoAddr,
        data,
        value: "0",
        chainId: chain.id,
        description: `Supply ${amount} ${loanSymbol} to Morpho market`,
        note: `User must approve Morpho (${morphoAddr}) to spend ${loanSymbol} first.`,
        morphoAddress: morphoAddr,
        loanToken: { symbol: loanSymbol, address: params.loanToken },
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(tx, null, 2) }],
      };
    }
  );
}
