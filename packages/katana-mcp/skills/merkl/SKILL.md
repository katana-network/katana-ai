---
name: merkl
description: Activate when the user asks about DeFi rewards, incentives, yield farming campaigns, claiming rewards, or Merkl on Katana Network.
allowed-tools: get_merkl_opportunities, get_merkl_user_rewards, build_claim_rewards
model: opus
license: MIT
metadata:
  author: katana
  version: '1.0.0'
---

# Merkl Rewards — Katana Network

Discover incentivized DeFi opportunities and claim reward tokens distributed by Merkl on Katana.

## How Merkl Works

Merkl distributes extra reward tokens (KAT, MORPHO, SUSHI, etc.) to users who participate in DeFi on Katana — supplying to Morpho, providing Sushi LP, borrowing, or holding tokens.

- **Campaigns** target specific actions: POOL (Sushi LP), LEND (Morpho supply/vaults), BORROW (Morpho borrow), HOLD (token holding), DROP (airdrops)
- Rewards are computed **offchain every ~2 hours** based on user activity snapshots
- Merkle roots are pushed **onchain every ~8 hours** — only then can users claim
- Claiming submits a merkle proof to the Distributor contract (`0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae`)
- No approval needed to claim — the Distributor sends reward tokens directly to the user

## Tools

### get_merkl_opportunities

Browse all incentivized DeFi positions on Katana with reward APRs.

- `protocol` (optional): `"all"` (default), `"morpho"`, or `"sushi-swap"`
- `action` (optional): `"all"` (default), `"POOL"`, `"LEND"`, `"BORROW"`, `"HOLD"`, or `"DROP"`
- `campaigns` (optional): `true` to include detailed campaign breakdowns (reward tokens, durations, distribution types)

Returns LIVE opportunities sorted by TVL: name, total APR (native + reward), daily rewards in USD, reward token details, and protocol.

**APR breakdown:** `totalApr` includes both native protocol yield AND Merkl reward APR. The `aprBreakdown` array separates these components. Campaign APRs change as TVL fluctuates — high APRs in low-TVL pools compress as more capital enters.

### get_merkl_user_rewards

Check a user's unclaimed Merkl rewards.

- `userAddress` (required): `0x`-prefixed wallet address

Returns all pending reward tokens with: total earned, already claimed, unclaimed amount, unclaimed USD value, and proof availability. If `claimable` is false, the proofs are not yet available onchain (wait for next merkle root update).

### build_claim_rewards

Build an unsigned claim transaction.

- `userAddress` (required): wallet address to claim for
- `tokenAddresses` (optional): comma-separated token addresses to claim specific tokens. Omit to claim ALL available rewards in one transaction.

Fetches fresh merkle proofs from the Merkl API and encodes a `claim()` call. Gas-only — no token approval needed.

## Workflows

### Discover Best Yield
1. `get_merkl_opportunities` — see all incentivized positions with reward APRs
2. Compare with native yield from `list_morpho_markets` (lending) or `get_pools` (dex) — **total yield = native APY + Merkl reward APR**
3. Use dex or lending tools to enter the position

### Check and Claim Rewards
1. `get_merkl_user_rewards` — check unclaimed rewards and USD values
2. `build_claim_rewards` — build the claim transaction (no approval needed, gas-only)

### Optimize Yield Strategy (Multi-Skill)
1. `get_merkl_opportunities` with protocol filter — see what's incentivized
2. `list_morpho_markets` (lending) to see native lending rates alongside reward APRs
3. Use dex to swap into the right tokens or add LP
4. Use lending to supply to Morpho markets
5. Periodically check `get_merkl_user_rewards` to track accumulated rewards

## Warnings

- **Timing:** New positions won't show rewards immediately. Rewards are computed every ~2 hours.
- **Proof availability:** Merkle roots update every ~8 hours. `get_merkl_user_rewards` may show unclaimed amounts, but `claimable` will be false until proofs are onchain.
- **Dispute period:** After a merkle root update, there's a dispute window before rewards become claimable.
- **Stale proofs:** `build_claim_rewards` fetches proofs at build time. If the user waits too long to submit, a new merkle root may invalidate the proofs. Recommend claiming promptly.
- **Reward token liquidity:** Some reward tokens may not have deep on-chain liquidity. Use `get_token_prices` (analytics) to check before assuming rewards can be easily sold.

## Common Mistakes

- **Passing token symbols to `build_claim_rewards`.** The `tokenAddresses` parameter requires `0x`-prefixed contract addresses, NOT symbols like `"KAT"` or `"MORPHO"`. Get the correct addresses from `get_merkl_user_rewards` output, which lists each reward token with its address.
- **Trying to claim when proofs aren't available.** `get_merkl_user_rewards` may show unclaimed amounts but `claimable: false`. This means the merkle root hasn't been updated onchain yet (~8 hour cycle). Building a claim tx with stale/missing proofs will fail. Check `claimable` before calling `build_claim_rewards`.
- **Assuming rewards appear instantly.** After entering a new position, rewards won't show for ~2 hours (next offchain computation cycle). Don't call `get_merkl_user_rewards` immediately after a deposit and tell the user there are no rewards.

## Cross-References

- **lending**: supply to Morpho markets/vaults to earn LEND rewards
- **dex**: provide Sushi LP to earn POOL rewards
- **analytics**: `get_token_prices` to value reward tokens in USD
- **wallet-manager**: `get_balances` to check reward token balances after claiming
