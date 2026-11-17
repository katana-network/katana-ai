import { createPublicClient, fallback, http, type PublicClient } from "viem";
import { katana, bokuto, type NetworkName } from "./config/chains.js";

const clients: Partial<Record<NetworkName, PublicClient>> = {};

/**
 * RPC URLs in priority order. A *_RPC_URL env var is tried first; the
 * public endpoints follow as backups. Duplicates are removed.
 */
export function getRpcUrls(network: NetworkName): string[] {
  const urls =
    network === "mainnet"
      ? [
          process.env.KATANA_RPC_URL,
          katana.rpcUrls.default.http[0], // https://rpc.katana.network/
          katana.rpcUrls.conduit.http[0], // https://rpc.katanarpc.com/ (backup)
        ]
      : [process.env.BOKUTO_RPC_URL, bokuto.rpcUrls.default.http[0]];

  return [...new Set(urls.filter((u): u is string => !!u))];
}

export function getClient(network: NetworkName): PublicClient {
  if (!clients[network]) {
    const chain = network === "mainnet" ? katana : bokuto;
    const urls = getRpcUrls(network);

    // On a transport failure (HTTP error, timeout, rate limit) viem retries the
    // request on the next URL. Contract reverts are not retried — they are real results.
    const transport =
      urls.length === 1
        ? http(urls[0])
        : fallback(urls.map((url) => http(url)));

    clients[network] = createPublicClient({
      chain,
      transport,
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
