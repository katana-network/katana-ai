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
    .describe("Amount of loan token to withdraw (human-readable, e.g. '500')"),
  onBehalf: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
    .describe("Address that owns the supply position"),
  receiver: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
    .describe("Address to receive the withdrawn tokens"),
  network: z
    .enum(["mainnet", "testnet"])
    .default("mainnet")
    .describe("Katana mainnet or Bokuto testnet"),
};

export function registerBuildWithdraw(server: McpServer) {
  server.registerTool(
    "build_morpho_withdraw",
    {
      description:
        "Build an unsigned transaction to withdraw supplied assets from a Morpho Blue market on Katana. Withdraws from a lending position. May fail if insufficient liquidity in the market.",
      inputSchema,
    },
    async ({ marketId, amount, onBehalf, receiver, network }) => {
      const net = network as NetworkName;
      const client = getClient(net);
      const chain = getChain(net);
      const morphoAddr = MORPHO_CONTRACTS.mainnet.morpho;
      const id = marketId as `0x${string}`;

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
        functionName: "withdraw",
        args: [
          {
            loanToken: params.loanToken,
            collateralToken: params.collateralToken,
            oracle: params.oracle,
            irm: params.irm,
            lltv: params.lltv,
          },
          assets,
          0n, // shares = 0 means withdraw by asset amount
          onBehalf as Address,
          receiver as Address,
        ],
      });

      const tx = {
        to: morphoAddr,
        data,
        value: "0",
        chainId: chain.id,
        description: `Withdraw ${amount} ${loanSymbol} from Morpho market`,
        morphoAddress: morphoAddr,
        loanToken: { symbol: loanSymbol, address: params.loanToken },
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(tx, null, 2) }],
      };
    }
  );
}
