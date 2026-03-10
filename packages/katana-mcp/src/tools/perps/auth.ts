import { createHmac, randomUUID } from "crypto";
import { type Address, zeroAddress } from "viem";
import {
  PERPS_API,
  PERPS_EIP712_DOMAIN,
  PERPS_CONTRACTS,
  type NetworkName,
} from "../../config/contracts.js";

// ─── Env helpers ───────────────────────────────────────────────────────────

function getApiKey(): string | undefined {
  return process.env.PERPS_API_KEY;
}

function getApiSecret(): string | undefined {
  return process.env.PERPS_API_SECRET;
}

export function requireAuth(): { apiKey: string; apiSecret: string } | null {
  const apiKey = getApiKey();
  const apiSecret = getApiSecret();
  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret };
}

// ─── HMAC signing ──────────────────────────────────────────────────────────

export function signHmac(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

// ─── Nonce generation (UUID v1-like using random UUID) ─────────────────────

export function generateNonce(): string {
  return randomUUID();
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────

function getBaseUrl(network: NetworkName): string {
  return PERPS_API[network].rest;
}

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 429 && retries > 0) {
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    return fetchWithRetry(url, init, retries - 1);
  }
  return res;
}

export async function perpsGet(
  path: string,
  params?: Record<string, string>,
  network: NetworkName = "mainnet"
): Promise<unknown> {
  const url = new URL(path, getBaseUrl(network));
  const queryString = params
    ? new URLSearchParams(params).toString()
    : "";
  if (queryString) url.search = queryString;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Add auth if available
  const auth = requireAuth();
  if (auth && params) {
    headers["KP-API-KEY"] = auth.apiKey;
    headers["KP-HMAC-SIGNATURE"] = signHmac(queryString, auth.apiSecret);
  } else if (auth) {
    headers["KP-API-KEY"] = auth.apiKey;
  }

  const res = await fetchWithRetry(url.toString(), { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Perps API ${res.status}: ${body}`);
  }
  return res.json();
}

export async function perpsAuthGet(
  path: string,
  params: Record<string, string>,
  network: NetworkName = "mainnet"
): Promise<unknown> {
  const auth = requireAuth();
  if (!auth) {
    throw new Error(
      "PERPS_API_KEY and PERPS_API_SECRET environment variables are required for authenticated endpoints. " +
        "Generate API keys at https://perps.katana.network/ (or sandbox)."
    );
  }

  const nonce = generateNonce();
  const allParams = { nonce, ...params };
  const queryString = new URLSearchParams(allParams).toString();

  const url = new URL(path, getBaseUrl(network));
  url.search = queryString;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "KP-API-KEY": auth.apiKey,
    "KP-HMAC-SIGNATURE": signHmac(queryString, auth.apiSecret),
  };

  const res = await fetchWithRetry(url.toString(), { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Perps API ${res.status}: ${body}`);
  }
  return res.json();
}

export async function perpsAuthPost(
  path: string,
  body: object,
  network: NetworkName = "mainnet"
): Promise<unknown> {
  const auth = requireAuth();
  if (!auth) {
    throw new Error(
      "PERPS_API_KEY and PERPS_API_SECRET environment variables are required for trade endpoints."
    );
  }

  const stringifiedBody = JSON.stringify(body);
  const url = new URL(path, getBaseUrl(network));

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "KP-API-KEY": auth.apiKey,
    "KP-HMAC-SIGNATURE": signHmac(stringifiedBody, auth.apiSecret),
  };

  const res = await fetchWithRetry(url.toString(), {
    method: "POST",
    headers,
    body: stringifiedBody,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Perps API ${res.status}: ${body}`);
  }
  return res.json();
}

export async function perpsAuthDelete(
  path: string,
  body: object,
  network: NetworkName = "mainnet"
): Promise<unknown> {
  const auth = requireAuth();
  if (!auth) {
    throw new Error(
      "PERPS_API_KEY and PERPS_API_SECRET environment variables are required for trade endpoints."
    );
  }

  const stringifiedBody = JSON.stringify(body);
  const url = new URL(path, getBaseUrl(network));

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "KP-API-KEY": auth.apiKey,
    "KP-HMAC-SIGNATURE": signHmac(stringifiedBody, auth.apiSecret),
  };

  const res = await fetchWithRetry(url.toString(), {
    method: "DELETE",
    headers,
    body: stringifiedBody,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Perps API ${res.status}: ${body}`);
  }
  return res.json();
}

// ─── EIP-712 typed data builders ───────────────────────────────────────────

export function getDomain(network: NetworkName) {
  return PERPS_EIP712_DOMAIN[network];
}

// Convert UUID nonce to uint128 for EIP-712
export function nonceToUint128(nonce: string): string {
  const hex = `0x${nonce.replace(/-/g, "")}`;
  return BigInt(hex).toString();
}

const ORDER_TYPE_ENUM: Record<string, number> = {
  market: 0,
  limit: 1,
  stopLossMarket: 2,
  stopLossLimit: 3,
  takeProfitMarket: 4,
  takeProfitLimit: 5,
};

const ORDER_SIDE_ENUM: Record<string, number> = {
  buy: 0,
  sell: 1,
};

const TRIGGER_TYPE_ENUM: Record<string, number> = {
  none: 0,
  last: 1,
  index: 2,
};

const TIME_IN_FORCE_ENUM: Record<string, number> = {
  gtc: 0,
  gtx: 1,
  ioc: 2,
  fok: 3,
};

const SELF_TRADE_PREVENTION_ENUM: Record<string, number> = {
  dc: 0,
  co: 1,
  cn: 2,
  cb: 3,
};

const ZERO_PRICE = "0.00000000";

export const ORDER_TYPES = {
  Order: [
    { name: "nonce", type: "uint128" },
    { name: "wallet", type: "address" },
    { name: "marketSymbol", type: "string" },
    { name: "orderType", type: "uint8" },
    { name: "orderSide", type: "uint8" },
    { name: "quantity", type: "string" },
    { name: "limitPrice", type: "string" },
    { name: "triggerPrice", type: "string" },
    { name: "triggerType", type: "uint8" },
    { name: "callbackRate", type: "string" },
    { name: "conditionalOrderId", type: "uint128" },
    { name: "isReduceOnly", type: "bool" },
    { name: "timeInForce", type: "uint8" },
    { name: "selfTradePrevention", type: "uint8" },
    { name: "isLiquidationAcquisitionOnly", type: "bool" },
    { name: "delegatedPublicKey", type: "address" },
    { name: "clientOrderId", type: "string" },
  ],
} as const;

export function buildOrderTypedData(params: {
  nonce: string;
  wallet: string;
  market: string;
  type: string;
  side: string;
  quantity: string;
  price?: string;
  triggerPrice?: string;
  triggerType?: string;
  reduceOnly?: boolean;
  timeInForce?: string;
  selfTradePrevention?: string;
  clientOrderId?: string;
}) {
  return {
    nonce: nonceToUint128(params.nonce),
    wallet: params.wallet,
    marketSymbol: params.market,
    orderType: ORDER_TYPE_ENUM[params.type] ?? 0,
    orderSide: ORDER_SIDE_ENUM[params.side] ?? 0,
    quantity: params.quantity,
    limitPrice: params.price ?? ZERO_PRICE,
    triggerPrice: params.triggerPrice ?? ZERO_PRICE,
    triggerType: params.triggerType
      ? TRIGGER_TYPE_ENUM[params.triggerType] ?? 0
      : 0,
    callbackRate: ZERO_PRICE,
    conditionalOrderId: "0",
    isReduceOnly: params.reduceOnly ?? false,
    timeInForce: params.timeInForce
      ? TIME_IN_FORCE_ENUM[params.timeInForce] ?? 0
      : 0,
    selfTradePrevention: params.selfTradePrevention
      ? SELF_TRADE_PREVENTION_ENUM[params.selfTradePrevention] ?? 0
      : 0,
    isLiquidationAcquisitionOnly: false,
    delegatedPublicKey: zeroAddress,
    clientOrderId: params.clientOrderId ?? "",
  };
}

export const CANCEL_BY_WALLET_TYPES = {
  OrderCancellationByWallet: [
    { name: "nonce", type: "uint128" },
    { name: "wallet", type: "address" },
    { name: "delegatedKey", type: "address" },
  ],
} as const;

export const CANCEL_BY_ORDER_ID_TYPES = {
  OrderCancellationByOrderId: [
    { name: "nonce", type: "uint128" },
    { name: "wallet", type: "address" },
    { name: "delegatedKey", type: "address" },
    { name: "orderIds", type: "string[]" },
  ],
} as const;

export const CANCEL_BY_MARKET_TYPES = {
  OrderCancellationByMarketSymbol: [
    { name: "nonce", type: "uint128" },
    { name: "wallet", type: "address" },
    { name: "delegatedKey", type: "address" },
    { name: "marketSymbol", type: "string" },
  ],
} as const;

export const WITHDRAWAL_TYPES = {
  Withdrawal: [
    { name: "nonce", type: "uint128" },
    { name: "wallet", type: "address" },
    { name: "quantity", type: "string" },
    { name: "maximumGasFee", type: "string" },
    { name: "bridgeAdapter", type: "address" },
    { name: "bridgeAdapterPayload", type: "bytes" },
  ],
} as const;

export const WALLET_ASSOCIATION_TYPES = {
  WalletAssociation: [
    { name: "nonce", type: "uint128" },
    { name: "wallet", type: "address" },
  ],
} as const;

// LayerZero endpoint IDs for cross-chain withdrawals
export const LZ_ENDPOINT_IDS: Record<string, number> = {
  katana: 30375,
  ethereum: 30101,
  arbitrum: 30110,
  avalanche: 30106,
  base: 30184,
  berachain: 30362,
  optimism: 30111,
  scroll: 30214,
};
