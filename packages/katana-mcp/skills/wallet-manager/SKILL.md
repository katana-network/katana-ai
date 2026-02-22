---
name: wallet-manager
description: Activate when the user asks about wallet balances, token transfers, ETH wrapping/unwrapping, or ERC20 token approvals on Katana Network.
allowed-tools: get_balances, build_wrap_eth, build_unwrap_eth, build_transfer, build_approve
model: opus
license: MIT
metadata:
  author: katana
  version: '1.0.0'
---

# Wallet Manager — Katana Network

Core wallet operations: check balances, transfer tokens, wrap/unwrap ETH, and manage ERC20 approvals.

## Katana Basics

- Mainnet chain ID: **747474** / Testnet (Bokuto): **737373**
- Gas token: ETH
- WETH on Katana is **vbETH** (Vault Bridge ETH) — a yield-generating token that implements the WETH9 interface. Wrapping ETH earns bridge yield automatically.
- Every tool accepts `network`: `"mainnet"` (default) or `"testnet"`.

## Unsigned Transaction Model

All `build_*` tools return unsigned transaction data as JSON (`{to, data, value, chainId}`). The agent **never signs or sends** transactions. The user's wallet handles signing and submission.

## Known Tokens

| Symbol | Decimals | Notes |
|--------|----------|-------|
| KAT | 18 | Katana governance token |
| WETH | 18 | Yield-generating vbETH |
| WBTC | 8 | Wrapped Bitcoin |
| USDC | 6 | USD stablecoin |
| USDT | 6 | USD stablecoin |
| USDS | 18 | USD stablecoin |
| AUSD | 18 | USD stablecoin |
| LBTC | 8 | Liquid Bitcoin |
| weETH | 18 | Wrapped eETH |
| wstETH | 18 | Wrapped stETH |
| MORPHO | 18 | Morpho governance token |
| SUSHI | 18 | SushiSwap token |

## Tools

### get_balances

Check ETH and token balances for an address.

- `address` (required): `0x`-prefixed Ethereum address
- `tokens` (optional): comma-separated symbols to check (e.g. `"WETH,USDC"`). Omit to check all known tokens.
- `network`: `"mainnet"` | `"testnet"`

Returns native ETH balance plus all matching ERC20 balances with human-readable amounts.

### build_wrap_eth / build_unwrap_eth

Wrap ETH into WETH (vbETH) or unwrap back to ETH.

- `amount` (required): amount in ETH units (e.g. `"1.5"`)
- `network`: `"mainnet"` | `"testnet"`

Mention to users that WETH on Katana earns yield — wrapping is beneficial for DeFi participation.

### build_transfer

Transfer ETH or any ERC20 token.

- `to` (required): recipient address
- `token` (required): symbol (e.g. `"ETH"`, `"USDC"`) or contract address
- `amount` (required): human-readable amount (e.g. `"100"` for 100 USDC)
- `network`: `"mainnet"` | `"testnet"`

For ETH: produces a native value transfer. For ERC20: produces a `transfer()` call.

**Always confirm the recipient address with the user before building.** Transfers are irreversible.

### build_approve

Approve a spender contract to use ERC20 tokens.

- `token` (required): symbol or contract address
- `spender` (required): contract address to approve
- `amount` (optional): human-readable amount, or `"max"` for unlimited. Defaults to max.
- `network`: `"mainnet"` | `"testnet"`

Common spender addresses (mainnet):

| Protocol | Contract | Address |
|----------|----------|---------|
| Sushi V3 | SwapRouter | `0x4e1d81A3E627b9294532e990109e4c21d217376C` |
| Sushi V3 | PositionManager | `0x2659C6085D26144117D904C46B48B6d180393d27` |
| Sushi V2 | Router | `0x69cC349932ae18ED406eeB917d79b9b3033fB68E` |
| Morpho | Core | `0xD50F2DffFd62f94Ee4AEd9ca05C61d0753268aBc` |
| Morpho | Bundler3 | `0xA8C5e23C9C0DF2b6fF716486c6bBEBB6661548C8` |

If the user seems security-conscious, warn that `"max"` grants unlimited spending approval. Suggest exact amounts instead.

## Workflows

### Check Portfolio
1. `get_balances` with the user's address
2. Optionally use `get_token_prices` (analytics) to show USD values

### Send Tokens
1. Confirm recipient address and amount with the user
2. `build_transfer` — returns unsigned tx for the user to sign

### Prepare for DeFi (Approval)
1. Determine which contract needs approval (swap router, Morpho, etc.)
2. `build_approve` with the correct spender address from the table above
3. Hand off to the relevant skill (swap-planner, lending-advisor)

### Wrap ETH for DeFi
1. `build_wrap_eth` — explain that WETH on Katana earns bridge yield
2. Proceed to swap, liquidity, or lending operations

## Warnings

- Token symbols are case-insensitive. Tools accept either symbol or raw `0x` address.
- Always verify the user has sufficient balance before building transfer/approve transactions — use `get_balances` first.
- The `build_approve` output includes the spender address. Double-check it matches the intended protocol.

## Cross-References

- **swap-planner**: approvals required before swaps and LP adds (V3 Router, V2 Router, PositionManager)
- **lending-advisor**: approvals required before Morpho supply (Morpho Core) and leverage loops (Bundler3)
- **analytics**: `get_token_prices` to show USD values alongside balances
