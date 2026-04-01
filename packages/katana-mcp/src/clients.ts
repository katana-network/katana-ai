import { createPublicClient, http, type PublicClient } from "viem";
import { katana, bokuto, type NetworkName } from "./config/chains.js";

const clients: Partial<Record<NetworkName, PublicClient>> = {};

export function getClient(network: NetworkName): PublicClient {
  if (!clients[network]) {
    const chain = network === "mainnet" ? katana : bokuto;
    const rpcUrl =
      network === "mainnet"
        ? process.env.KATANA_RPC_URL || "https://rpc.katana.network/"
        : process.env.BOKUTO_RPC_URL || "https://rpc-bokuto.katanarpc.com";

    clients[network] = createPublicClient({
      chain,
      transport: http(rpcUrl),
      batch: {
        multicall: {
          batchSize: 50,
          wait: 10,
        },
      },
    });
  }
  return clients[network]!;
}
