import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseUnits, encodeFunctionData, type Address } from "viem";
import { getExchangeInfo } from "./auth.js";
import { getChain } from "../../config/chains.js";
import { type NetworkName } from "../../config/contracts.js";

// Exchange_v2.deposit(uint256 quantityInAssetUnits, address depositorWallet)
// quantityInAssetUnits: vbUSDC amount in its native 6 decimals (1 USDC = 1_000_000).
// (The previous uint64 "pips" signature does not exist on the deployed contract.)
const VBUSDC_DECIMALS = 6;
const exchangeDepositAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "quantityInAssetUnits", type: "uint256" },
      { name: "depositorWallet", type: "address" },
    ],
    outputs: [],
  },
] as const;

export function registerBuildPerpsDeposit(server: McpServer) {
  server.registerTool(
    "build_perps_deposit",
    {
      description:
        "Build an unsigned transaction to deposit vbUSDC into the Katana Perps exchange. This funds a trading account on Katana Perps. The user must first approve the Exchange contract to spend their vbUSDC. Use get_perps_exchange to check the quoteTokenAddress (vbUSDC) and exchangeContractAddress.",
      inputSchema: {
        wallet: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
          .describe("Wallet address to deposit for (must be associated via associate_perps_wallet first)"),
        quantity: z
          .string()
          .describe("Amount of vbUSDC to deposit (human-readable, e.g. '1000' for 1000 USDC)"),
        network: z
          .enum(["mainnet", "testnet"])
          .default("mainnet")
          .describe("Katana mainnet or Bokuto testnet (sandbox)"),
      },
    },
    async ({ wallet, quantity, network }) => {
      const net = network as NetworkName;
      const chain = getChain(net);
      // Always target the exchange the API reports as current
      const exchangeInfo = await getExchangeInfo(net);
      const exchangeAddr = exchangeInfo.exchangeContractAddress;
      const quoteToken = exchangeInfo.quoteTokenAddress;

      const quantityInAssetUnits = parseUnits(quantity, VBUSDC_DECIMALS);

      const data = encodeFunctionData({
        abi: exchangeDepositAbi,
        functionName: "deposit",
        args: [quantityInAssetUnits, wallet as Address],
      });

      const tx = {
        to: exchangeAddr,
        data,
        value: "0",
        chainId: chain.id,
        description: `Deposit ${quantity} vbUSDC into Katana Perps`,
        note: `User must approve Exchange (${exchangeAddr}) to spend ${quantityInAssetUnits.toString()} units of vbUSDC${quoteToken ? ` (${quoteToken})` : ""} first. Wallet must be associated via associate_perps_wallet before first deposit.`,
        exchange: exchangeAddr,
        exchangeSource: exchangeInfo.source,
        quoteToken,
        quantityInAssetUnits: quantityInAssetUnits.toString(),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(tx) }],
      };
    }
  );
}
