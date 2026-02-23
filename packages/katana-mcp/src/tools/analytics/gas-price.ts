import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatGwei, formatEther } from "viem";
import { getClient } from "../../clients.js";
import { type NetworkName } from "../../config/contracts.js";

const inputSchema = {
  network: z
    .enum(["mainnet", "testnet"])
    .default("mainnet")
    .describe("Katana mainnet or Bokuto testnet"),
};

export function registerGetGasPrice(server: McpServer) {
  server.registerTool(
    "get_gas_price",
    {
      description:
        "Get current gas prices on Katana. Returns the latest block's base fee, estimated max fee and priority fee (EIP-1559), and cost estimates for common transaction types (transfer, swap, supply). Katana uses 1-second blocks with EIP-1559 gas pricing.",
      inputSchema,
    },
    async ({ network }) => {
      const net = network as NetworkName;
      const client = getClient(net);

      const [gasPrice, block, feeEstimate] = await Promise.all([
        client.getGasPrice(),
        client.getBlock({ blockTag: "latest" }),
        client.estimateFeesPerGas().catch(() => null),
      ]);

      const baseFee = block.baseFeePerGas;

      // Common gas limits for cost estimates
      const txTypes = [
        { label: "ETH transfer", gasLimit: 21000n },
        { label: "ERC20 transfer", gasLimit: 65000n },
        { label: "ERC20 approve", gasLimit: 46000n },
        { label: "Sushi V3 swap", gasLimit: 200000n },
        { label: "Morpho supply", gasLimit: 250000n },
        { label: "Morpho borrow", gasLimit: 300000n },
      ];

      const costEstimates = txTypes.map((tx) => {
        const costWei = gasPrice * tx.gasLimit;
        return {
          type: tx.label,
          gasLimit: tx.gasLimit.toString(),
          costETH: formatEther(costWei),
        };
      });

      const response: Record<string, unknown> = {
        network,
        blockNumber: block.number?.toString(),
        blockTimestamp: block.timestamp
          ? new Date(Number(block.timestamp) * 1000).toISOString()
          : null,
        gasPrice: {
          wei: gasPrice.toString(),
          gwei: formatGwei(gasPrice),
        },
        baseFee: baseFee
          ? { wei: baseFee.toString(), gwei: formatGwei(baseFee) }
          : null,
      };

      if (feeEstimate) {
        response.eip1559 = {
          maxFeePerGas: {
            wei: feeEstimate.maxFeePerGas.toString(),
            gwei: formatGwei(feeEstimate.maxFeePerGas),
          },
          maxPriorityFeePerGas: {
            wei: feeEstimate.maxPriorityFeePerGas.toString(),
            gwei: formatGwei(feeEstimate.maxPriorityFeePerGas),
          },
        };
      }

      response.costEstimates = costEstimates;

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(response) },
        ],
      };
    }
  );
}
