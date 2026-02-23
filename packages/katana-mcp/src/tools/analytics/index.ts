import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetTokenPrices } from "./token-prices.js";
import { registerGetGasPrice } from "./gas-price.js";
import { registerTxLookup } from "./tx-lookup.js";
import { registerContractReference } from "./contract-reference.js";

export function registerAnalyticsTools(server: McpServer) {
  registerGetTokenPrices(server);    // get_token_prices
  registerGetGasPrice(server);       // get_gas_price
  registerTxLookup(server);          // tx_lookup
  registerContractReference(server); // get_contract_reference
}
