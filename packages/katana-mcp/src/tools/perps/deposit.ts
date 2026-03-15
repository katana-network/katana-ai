import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseUnits, encodeFunctionData, type Address } from "viem";
import { getChain } from "../../config/chains.js";
import { PERPS_CONTRACTS, type NetworkName } from "../../config/contracts.js";

// Exchange_v1.deposit(uint256 quantityInPips, address wallet)
// quantityInPips: vbUSDC amount in 8-decimal "pips" (1 USDC = 100000000 pips)
const exchangeDepositAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "quantityInPips", type: "uint64" },
      { name: "wallet", type: "address" },
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
      const exchangeAddr = PERPS_CONTRACTS[net].exchange;

      // vbUSDC has 6 decimals, but perps uses 8-decimal "pips"
      // 1 USDC = 1_000_000 (6 dec) on-chain, but 100_000_000 (8 dec) in pips
      const quantityInPips = parseUnits(quantity, 8);

      const data = encodeFunctionData({
        abi: exchangeDepositAbi,
        functionName: "deposit",
        args: [quantityInPips, wallet as Address],
      });

      // vbUSDC address — users should get this from get_perps_exchange → quoteTokenAddress
      // but we include it in the note for convenience
      const tx = {
        to: exchangeAddr,
        data,
        value: "0",
        chainId: chain.id,
        description: `Deposit ${quantity} vbUSDC into Katana Perps`,
        note: `User must approve Exchange (${exchangeAddr}) to spend vbUSDC first. Use get_perps_exchange to get the quoteTokenAddress (vbUSDC). Wallet must be associated via associate_perps_wallet before first deposit.`,
        exchange: exchangeAddr,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(tx) }],
      };
    }
  );
}
