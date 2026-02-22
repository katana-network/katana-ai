import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatEther, formatGwei, formatUnits, type Hash } from "viem";
import { getClient } from "../../clients.js";
import { type NetworkName } from "../../config/contracts.js";

const inputSchema = {
  txHash: z
    .string()
    .describe("Transaction hash (0x-prefixed hex string)"),
  network: z
    .enum(["mainnet", "testnet"])
    .default("mainnet")
    .describe("Katana mainnet or Bokuto testnet"),
};

export function registerTxLookup(server: McpServer) {
  server.registerTool(
    "tx_lookup",
    {
      description:
        "Look up a transaction on Katana by hash. Returns full transaction details: status, block, from/to, value, gas used, effective gas price, and log count. Use this to check if a transaction succeeded, inspect its details, or debug failures.",
      inputSchema,
    },
    async ({ txHash, network }) => {
      const net = network as NetworkName;
      const client = getClient(net);
      const hash = txHash as Hash;

      // Fetch tx and receipt in parallel
      const [tx, receipt] = await Promise.allSettled([
        client.getTransaction({ hash }),
        client.getTransactionReceipt({ hash }),
      ]);

      if (tx.status === "rejected") {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { error: `Transaction not found: ${txHash}`, network },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      const txData = tx.value;

      const response: Record<string, unknown> = {
        network,
        hash: txData.hash,
        status: "pending",
        blockNumber: txData.blockNumber?.toString() ?? null,
        from: txData.from,
        to: txData.to,
        value: {
          wei: txData.value.toString(),
          eth: formatEther(txData.value),
        },
        nonce: txData.nonce,
        input: txData.input.length > 10
          ? {
              selector: txData.input.slice(0, 10),
              fullLength: txData.input.length,
              data: txData.input.length <= 202
                ? txData.input
                : txData.input.slice(0, 202) + "...",
            }
          : { raw: txData.input },
      };

      // Gas info from tx
      if (txData.type === "eip1559") {
        response.gasInfo = {
          type: "EIP-1559",
          maxFeePerGas: txData.maxFeePerGas
            ? formatGwei(txData.maxFeePerGas) + " gwei"
            : null,
          maxPriorityFeePerGas: txData.maxPriorityFeePerGas
            ? formatGwei(txData.maxPriorityFeePerGas) + " gwei"
            : null,
          gasLimit: txData.gas.toString(),
        };
      } else {
        response.gasInfo = {
          type: txData.type ?? "legacy",
          gasPrice: txData.gasPrice
            ? formatGwei(txData.gasPrice) + " gwei"
            : null,
          gasLimit: txData.gas.toString(),
        };
      }

      // Receipt info (if mined)
      if (receipt.status === "fulfilled") {
        const r = receipt.value;
        response.status = r.status === "success" ? "success" : "reverted";
        response.receipt = {
          gasUsed: r.gasUsed.toString(),
          effectiveGasPrice: formatGwei(r.effectiveGasPrice) + " gwei",
          costETH: formatEther(r.gasUsed * r.effectiveGasPrice),
          blockNumber: r.blockNumber.toString(),
          transactionIndex: r.transactionIndex,
          logsCount: r.logs.length,
          contractAddress: r.contractAddress ?? null,
        };

        // Include explorer link
        const explorer =
          net === "mainnet"
            ? "https://katanascan.io"
            : "https://bokuto.katanascan.io";
        response.explorerUrl = `${explorer}/tx/${txData.hash}`;
      }

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(response, null, 2) },
        ],
      };
    }
  );
}
