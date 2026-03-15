# Perps Trader Skill

## Purpose
Trade perpetual futures on Katana Perps — a non-custodial, cross-margined perpetual futures DEX with a central limit order book. This skill covers market data, position management, order placement, and withdrawals.

## When to Activate
- User asks about perpetual futures, perps, or leveraged trading on Katana
- User wants to check perps market data, prices, funding rates, or liquidations
- User wants to view their perps positions, orders, or fills
- User wants to place or cancel perps orders
- User wants to withdraw from the perps exchange

## Allowed Tools

### Public Data (no auth needed)
| Tool | Purpose |
|------|---------|
| `get_perps_exchange` | Exchange info — fees, volume, open interest, contract addresses |
| `get_perps_markets` | Market info — leverage, margin, fees, index prices, funding |
| `get_perps_tickers` | 24h stats — OHLCV, bid/ask, mark/index prices |
| `get_perps_orderbook` | Order book snapshot (L1 best bid/ask or L2 full depth) |
| `get_perps_candles` | OHLCV candle data (1m to 1d intervals) |
| `get_perps_trades` | Recent public trade data |
| `get_perps_liquidations` | Recent liquidation data |
| `get_perps_funding_rates` | Historical funding rates (payments every 8h) |
| `get_perps_gas_fees` | Withdrawal gas fee estimates per destination chain |

### Authenticated Reads (need PERPS_API_KEY + PERPS_API_SECRET env vars)
| Tool | Purpose |
|------|---------|
| `get_perps_wallets` | Wallet state — equity, collateral, leverage, margin ratio, positions |
| `get_perps_positions` | Open positions — PnL, liquidation price, ADL risk |
| `get_perps_orders` | Open or historical orders with fills |
| `get_perps_fills` | Trade fill history — fees, PnL, maker/taker side |

### Trade Tools (need API key + EIP-712 wallet signature)
| Tool | Purpose |
|------|---------|
| `create_perps_order` | Build order — returns EIP-712 typed data for signing |
| `cancel_perps_order` | Cancel by order IDs, market, or all |
| `build_perps_withdraw` | Withdraw to Katana or cross-chain via Stargate |
| `associate_perps_wallet` | Associate wallet with API account (first-time setup) |
| `build_perps_deposit` | Deposit vbUSDC into the perps exchange (fund trading account) |

## Key Concepts

### Collateral & Margin
- **Collateral:** vbUSDC only, cross-margined across all positions
- **Initial Margin Fraction (IMF):** Margin to open a position (determines max leverage)
- **Maintenance Margin Fraction (MMF):** Margin to avoid liquidation
- **Margin Ratio:** totalMaintenanceMarginReq / equity — liquidation when > 1
- Larger positions require higher IMF (incremental margin)

### Order Types
| Type | Description |
|------|-------------|
| `market` | Execute immediately at best price |
| `limit` | Execute at specified price or better |
| `stopLossMarket` | Market order triggered at stop price |
| `stopLossLimit` | Limit order triggered at stop price |
| `takeProfitMarket` | Market order triggered at take profit price |
| `takeProfitLimit` | Limit order triggered at take profit price |

### Time In Force
| Value | Description |
|-------|-------------|
| `gtc` | Good-til-canceled (default, rests on book) |
| `gtx` | Post-only / maker only (canceled if crosses spread) |
| `ioc` | Immediate-or-cancel (fill what you can, cancel rest) |
| `fok` | Fill-or-kill (entire quantity or nothing) |

### Funding Payments
- Every 8 hours: 00:00, 08:00, 16:00 UTC
- Positive rate → longs pay shorts; negative → shorts pay longs
- Incentivizes order book price to converge with index price

### Precision
- All prices and quantities: 8 decimal zero-padded strings (e.g., "2500.05000000")

## Key Workflows

### 1. Check Market Overview
```
get_perps_markets → see all markets, leverage, fees
get_perps_tickers → 24h stats, current bid/ask, funding
get_perps_orderbook(market: "ETH-USD", level: 2, limit: 10) → depth
```

### 2. Analyze a Market
```
get_perps_candles(market: "ETH-USD", interval: "1h", limit: 24) → price history
get_perps_trades(market: "ETH-USD", limit: 20) → recent trades
get_perps_funding_rates(market: "ETH-USD", limit: 10) → funding history
get_perps_liquidations(market: "ETH-USD", limit: 10) → recent liquidations
```

### 3. Monitor Positions
```
get_perps_wallets(wallet: "0x...") → equity, margin, leverage
get_perps_positions(wallet: "0x...") → all positions with PnL
get_perps_orders(wallet: "0x...", closed: false) → open orders
get_perps_fills(wallet: "0x...", market: "ETH-USD") → fill history
```

### 4. Place an Order
```
create_perps_order(
  wallet: "0x...", market: "ETH-USD", type: "limit",
  side: "buy", quantity: "1.00000000", price: "2400.00000000",
  timeInForce: "gtc"
)
→ Returns EIP-712 typed data for signing
→ User signs, then re-calls with walletSignature to submit
```

### 5. Cancel Orders
```
cancel_perps_order(wallet: "0x...", orderIds: "uuid1,uuid2")  # specific
cancel_perps_order(wallet: "0x...", market: "ETH-USD")         # all in market
cancel_perps_order(wallet: "0x...")                              # all orders
```

### 6. Fund Trading Account
```
get_perps_exchange → get quoteTokenAddress (vbUSDC) and exchangeContractAddress
build_approve(spender: exchangeContractAddress, token: quoteTokenAddress, amount: "1000")
build_perps_deposit(wallet: "0x...", quantity: "1000")
```

### 7. Withdraw Funds
```
get_perps_gas_fees → check current gas fees
build_perps_withdraw(
  wallet: "0x...", quantity: "1000.00000000",
  maximumGasFee: "0.60000000", destinationChain: "arbitrum"
)
```

## Common Mistakes

- **Wrong market ID format.** Markets use the `"BASE-QUOTE"` format (e.g., `"ETH-USD"`, `"BTC-USD"`), NOT `"ETH"`, `"ETHUSD"`, or `"ETH/USD"`. Invalid market strings will return empty results or errors.
- **Wrong price/quantity precision.** All prices and quantities must be 8-decimal zero-padded strings (e.g., `"2500.05000000"`, `"1.00000000"`). Passing a plain number like `2500` or a string like `"2500.05"` will fail validation. Always pad to 8 decimal places.
- **Forgetting the two-step order flow.** `create_perps_order` does NOT submit the order. It returns EIP-712 typed data that the user must sign with their wallet. The signed result must then be re-submitted with the `walletSignature` parameter. Telling the user "your order is placed" after the first call is incorrect.
- **Not checking gas fees before withdrawal.** `build_perps_withdraw` requires a `maximumGasFee` parameter. Always call `get_perps_gas_fees` first to get current estimates per destination chain. Using a stale or too-low gas fee will cause the withdrawal to fail.
- **Confusing wallet address with API account.** Authenticated tools need both the wallet `0x` address AND valid `PERPS_API_KEY` / `PERPS_API_SECRET` env vars. First-time users must call `associate_perps_wallet` before any authenticated reads or trades will work.

## Safety Notes
- Trade tools return EIP-712 typed data — they never sign or hold private keys
- Always check margin ratio before placing leveraged orders
- Use `get_perps_gas_fees` before withdrawals to set `maximumGasFee` accurately
- Keep margin ratio well below 1 to avoid liquidation
- Stop loss orders are not guaranteed to fill at the stop price
- Funding payments can accumulate — check `totalFunding` on positions
