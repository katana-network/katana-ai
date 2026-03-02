import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetPerpsExchange } from "./get-exchange.js";
import { registerGetPerpsMarkets } from "./get-markets.js";
import { registerGetPerpsTickers } from "./get-tickers.js";
import { registerGetPerpsOrderbook } from "./get-orderbook.js";
import { registerGetPerpsCandles } from "./get-candles.js";
import { registerGetPerpsTrades } from "./get-trades.js";
import { registerGetPerpsLiquidations } from "./get-liquidations.js";
import { registerGetPerpsFundingRates } from "./get-funding-rates.js";
import { registerGetPerpsGasFees } from "./get-gas-fees.js";
import { registerGetPerpsWallets } from "./get-wallets.js";
import { registerGetPerpsPositions } from "./get-positions.js";
import { registerGetPerpsOrders } from "./get-orders.js";
import { registerGetPerpsFills } from "./get-fills.js";
import { registerCreatePerpsOrder } from "./create-order.js";
import { registerCancelPerpsOrder } from "./cancel-order.js";
import { registerBuildPerpsWithdraw } from "./withdraw.js";
import { registerAssociatePerpsWallet } from "./associate-wallet.js";

export function registerPerpsTools(server: McpServer) {
  // Public data (no auth required)
  registerGetPerpsExchange(server);
  registerGetPerpsMarkets(server);
  registerGetPerpsTickers(server);
  registerGetPerpsOrderbook(server);
  registerGetPerpsCandles(server);
  registerGetPerpsTrades(server);
  registerGetPerpsLiquidations(server);
  registerGetPerpsFundingRates(server);
  registerGetPerpsGasFees(server);

  // Authenticated reads (API key required)
  registerGetPerpsWallets(server);
  registerGetPerpsPositions(server);
  registerGetPerpsOrders(server);
  registerGetPerpsFills(server);

  // Trade tools (API key + wallet signature)
  registerCreatePerpsOrder(server);
  registerCancelPerpsOrder(server);
  registerBuildPerpsWithdraw(server);
  registerAssociatePerpsWallet(server);
}
