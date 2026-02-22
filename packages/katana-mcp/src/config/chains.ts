import { defineChain } from "viem";

export const katana = defineChain({
  id: 747474,
  name: "Katana",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ["https://rpc.katana.network/"] },
    tenderly: { http: ["https://katana.gateway.tenderly.co/"] },
    conduit: { http: ["https://rpc.katanarpc.com/"] },
  },
  blockExplorers: {
    default: { name: "Katanascan", url: "https://katanascan.com" },
  },
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
    },
  },
});

export const bokuto = defineChain({
  id: 737373,
  name: "Bokuto",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ["https://rpc-bokuto.katanarpc.com"] },
  },
  blockExplorers: {
    default: { name: "Katanascan Bokuto", url: "https://bokuto.katanascan.com" },
    blockscout: { name: "Blockscout", url: "https://explorer-bokuto.katanarpc.com" },
  },
  testnet: true,
});

export type NetworkName = "mainnet" | "testnet";

export function getChain(network: NetworkName) {
  return network === "mainnet" ? katana : bokuto;
}
