---
name: kat
description: Activate when the user asks about the KAT token, staking KAT, vKAT locks, avKAT vault, gauge voting, exit fees, cooldown periods, or building applications that interact with the KAT token ecosystem on Katana Network.
allowed-tools: get_contract_reference, get_token_prices, get_balances, build_approve, get_merkl_opportunities, get_merkl_user_rewards, build_claim_rewards, build_kat_stake, build_kat_deposit_vault, build_kat_convert_to_vault, build_kat_begin_withdrawal, build_kat_withdraw, build_kat_cancel_withdrawal, build_kat_vote, build_kat_reset_votes, build_kat_merge, build_kat_split, get_kat_locks, get_kat_gauges
model: opus
license: MIT
metadata:
  author: katana
  version: '1.0.0'
---

# KAT Token — Katana Network

The KAT token ecosystem on Katana Network, including staking (vKAT), auto-compounding vaults (avKAT), gauge voting, and exit mechanics.

## KAT Token Overview

KAT is the native ERC-20 token of the Katana Foundation, deployed on Katana Network (chain ID 747474). It has 18 decimals.

**KAT is fully transferable as of March 18, 2026.** All token flows — `transfer()`, `transferFrom()`, staking (KAT → vKAT), and vault deposits (KAT → avKAT) — are enabled. The unlock was a permanent one-time operation called by the UNLOCKER role via `unlockAndRenounceUnlocker()`.

KAT itself has **no voting power**. Users must convert it into one of two staking derivatives to participate in governance and earn rewards.

## The Three Token Types

| Token | Standard | Transferable | Voting Power | Rewards |
|-------|----------|-------------|-------------|---------|
| **KAT** | ERC-20 | Yes (since March 18, 2026) | None | None |
| **vKAT** | ERC-721 (soulbound NFT) | No (soulbound) | Yes — 1:1 with locked amount | Manual claim via Merkl |
| **avKAT** | ERC-4626 vault shares | Yes (liquid, tradeable) | Delegated to CompoundStrategy | Auto-compounded |

### vKAT (Active Staking)
A soulbound NFT representing a locked KAT position in the VotingEscrow contract. Each lock is a separate NFT with its own token ID. Users can hold multiple vKAT NFTs. Grants direct gauge voting power. Exiting requires a 45-day cooldown with a sliding exit fee (2.5%–25%).

### avKAT (Passive Staking)
A liquid, transferable ERC-4626 vault token. The vault holds a "master vKAT" internally. The CompoundStrategy handles voting and reward reinvestment automatically. The exchange rate appreciates as rewards compound. Users can exit instantly by selling avKAT on a DEX (no cooldown, no protocol fee, subject to market slippage) or redeem through the vault (triggers standard 45-day cooldown).

## Contract Addresses (Mainnet)

| Contract | Address | Purpose |
|----------|---------|---------|
| KAT Token | `0x7F1f4b4b29f5058fA32CC7a97141b8D7e5ABDC2d` | ERC-20 token |
| VotingEscrow | `0x4d6fC15Ca6258b168225D283262743C623c13Ead` | Lock KAT → mint vKAT NFT |
| NFT Lock | `0x106F7D67Ea25Cb9eFf5064CF604ebf6259Ff296d` | ERC-721 contract for vKAT positions |
| avKAT Vault | `0x7231dbaCdFc968E07656D12389AB20De82FbfCeB` | ERC-4626 auto-compounding vault |
| GaugeVoter | `0x5e755A3C5dc81A79DE7a7cEF192FFA60964c9352` | Vote vKAT power on gauges |
| CompoundStrategy | `0x60233D1c150F9C08D886906d597aA79a205b0463` | Auto-compounds avKAT vault rewards |
| Exit Queue | `0x6dE9cAAb658C744aD337Ca5d92D084c97ffF578d` | Manages cooldown & exit fee calculation |
| Curve | `0x38b8B74330b2F918C22F7936aCf773C6D963C73c` | Voting power decay & exit fee curve |
| Clock | `0x17049d374A2bcdA70F8939C21ad92bcF6B2A95ab` | Epoch timing |
| Swapper | `0x92D2e00b6D2BB50B87a9BE971a82B1F00ac44768` | Swaps non-KAT rewards to KAT for compounding |
| Merkl Distributor | `0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae` | Merkle-based reward claiming |
| UNLOCKER | `0x92D8Ce89fF02C640daf0B7c23d497cCF1880C390` | Role that can unlock KAT transfers |

## Token Conversion Flows

```
KAT ──approve──→ VotingEscrow.createLock(amount) ──→ vKAT (NFT)
KAT ──approve──→ avKATVault.deposit(amount, receiver) ──→ avKAT (shares)

vKAT ──approve NFT──→ avKATVault (deposit NFT) ──→ avKAT   (one-way, NFT consumed)

vKAT ──beginWithdrawal──→ [45-day cooldown] ──withdraw──→ KAT (minus exit fee)
vKAT ──beginWithdrawal + withdraw (same block)──→ KAT     (rage quit, 25% fee)

avKAT ──sell on DEX──→ KAT                                 (instant, no protocol fee)
avKAT ──vault.redeem──→ triggers standard 45-day cooldown ──→ KAT
avKAT ──vault.withdrawTokenId──→ vKAT (new NFT) ──→ then standard exit
```

### Key conversion details:
- **KAT → vKAT**: Approve VotingEscrow, call `createLock(amount)`. Mints a soulbound NFT.
- **KAT → avKAT**: Approve vault, call `deposit(amount, receiver)`. Returns vault shares at current exchange rate.
- **vKAT → avKAT**: One-way. The NFT is consumed and merged into the vault's master position.
- **vKAT → KAT**: Call `beginWithdrawal(tokenId)`, wait 45-day cooldown, call `withdraw(tokenId)`. Fee decays from 25% → 2.5%.
- **avKAT → KAT (instant)**: Sell avKAT on SushiSwap. No cooldown, no protocol fee, subject to slippage.
- **avKAT → KAT (redeem)**: Call `vault.redeem(shares, receiver, owner)`. Triggers the standard 45-day cooldown.

## Exit Fee Mechanics

When unstaking vKAT, a fee is charged based on how long the user waits during the 45-day cooldown:

| Wait time | Fee |
|-----------|-----|
| 0 days (rage quit) | 25% |
| 15 days | ~16.7% |
| 30 days | ~8.3% |
| 45 days (full cooldown) | 2.5% |

**Formula (after stabilization period):**
```
feePercent = 25% - ((25% - 2.5%) × daysWaited / 45)
```

**Constants:** `MIN_FEE_BPS = 250` (2.5%), `MAX_FEE_BPS = 2500` (25%), `COOLDOWN = 3,888,000 seconds` (45 days).

**Cancel withdrawal**: During cooldown, `cancelWithdrawalRequest(tokenId)` restores the staking position and voting power.

### Stabilization period (Days 0–60 after TGE)

Elevated fees during the early period:
- Days 0–14: 80%
- Days 15–30: 60%
- Days 31–45: 45%
- Days 46–60: 30%
- Day 61+: Normal sliding scale (2.5%–25%)

## Gauge Voting

vKAT holders vote directly on gauges to direct KAT emission incentives to liquidity pools.

- **Vote**: `GaugeVoter.vote(tokenId, [{gauge, weight}])` — weights in basis points (10,000 = 100%)
- **Reset**: `GaugeVoter.reset(tokenId)` — clear all votes (required before withdrawing a vKAT position)
- **Combined**: `VotingEscrow.resetVotesAndBeginWithdrawal(tokenId)` — atomic reset + begin withdrawal
- Votes persist across epochs until changed or reset
- avKAT holders do **not** vote directly — the CompoundStrategy votes automatically

## vKAT Lock Management

- **Merge**: `VotingEscrow.merge(fromTokenId, toTokenId)` — combine two locks into one. Burns the "from" lock.
- **Split**: `VotingEscrow.split(tokenId, amount)` — create a new lock with a portion of KAT. Returns new token ID.

## Reward Distribution

Rewards come from three sources:
1. **KAT emission schedule** — protocol inflation
2. **Pool trading fees** — from Sushi DEX
3. **Exit fees** — from users who unstake

Distribution uses Merkle tree proofs via the Merkl Distributor. vKAT holders claim manually; avKAT holders get automatic compounding via the CompoundStrategy.

Use `get_merkl_user_rewards` to check unclaimed rewards and `build_claim_rewards` to build the claim transaction.

## Workflows

### Check KAT ecosystem state
1. `get_contract_reference` — all KAT ecosystem contract addresses
2. `get_token_prices` with `tokens: "KAT"` — current KAT price
3. `get_balances` — check KAT and avKAT balances

### Stake KAT → vKAT (Active staking)
1. `build_approve` — approve VotingEscrow (`0x4d6fC15Ca6258b168225D283262743C623c13Ead`) to spend KAT
2. Call `VotingEscrow.createLock(amount)` — mints a vKAT NFT

### Deposit KAT → avKAT (Passive staking)
1. `build_approve` — approve avKAT Vault (`0x7231dbaCdFc968E07656D12389AB20De82FbfCeB`) to spend KAT
2. Call `avKATVault.deposit(amount, receiver)` — returns avKAT shares

### Unstake vKAT → KAT
1. Ensure votes are reset: `GaugeVoter.reset(tokenId)` or use `resetVotesAndBeginWithdrawal`
2. `VotingEscrow.beginWithdrawal(tokenId)` — starts 45-day cooldown
3. Wait for cooldown to pass (fee decreases over time)
4. `VotingEscrow.withdraw(tokenId)` — receive KAT minus exit fee

### Exit avKAT → KAT (instant, no cooldown)
1. Sell avKAT on SushiSwap using `build_swap` (dex skill)
2. No protocol fee, subject to DEX slippage

### Claim rewards (vKAT holders)
1. `get_merkl_user_rewards` — check unclaimed rewards
2. `build_claim_rewards` — build the claim transaction

## Key Function Signatures

### VotingEscrow (vKAT)
```
createLock(uint256 amount) → uint256 tokenId
beginWithdrawal(uint256 tokenId)
withdraw(uint256 tokenId)
cancelWithdrawalRequest(uint256 tokenId)
resetVotesAndBeginWithdrawal(uint256 tokenId)
merge(uint256 fromTokenId, uint256 toTokenId)
split(uint256 tokenId, uint256 amount) → uint256 newTokenId
```

### avKAT Vault (ERC-4626)
```
deposit(uint256 assets, address receiver) → uint256 shares
redeem(uint256 shares, address receiver, address owner) → uint256 assets
convertToShares(uint256 assets) → uint256 shares
convertToAssets(uint256 shares) → uint256 assets
```

### GaugeVoter
```
vote(uint256 tokenId, (address gauge, uint256 weight)[])
reset(uint256 tokenId)
getAllGauges() → address[]
getActiveGauges() → address[]
```

### KAT Token
```
unlockAndRenounceUnlocker()    // one-time, irreversible — called by UNLOCKER role
locked() → bool                // true until unlock
transfer(address to, uint256 amount)
approve(address spender, uint256 amount)
```

## Common Mistakes

- **KAT is now unlocked.** As of March 18, 2026, KAT is fully transferable. All transfers, staking to vKAT, and depositing to avKAT are enabled.
- **Withdrawing without resetting votes.** A vKAT position with active gauge votes cannot begin withdrawal. Call `GaugeVoter.reset(tokenId)` first, or use the combined `resetVotesAndBeginWithdrawal(tokenId)`.
- **Confusing vKAT and avKAT exit paths.** vKAT requires a 45-day cooldown with exit fee. avKAT can be sold instantly on DEX with no protocol fee. Users wanting immediate exit should use the avKAT → DEX path.
- **Expecting instant rewards.** Merkl rewards are computed offchain every ~2 hours and merkle roots are pushed onchain every ~8 hours. New stakers won't see rewards immediately.
- **Approving the wrong contract.** Staking to vKAT requires approving VotingEscrow (`0x4d6f...3Ead`). Depositing to avKAT requires approving the vault (`0x7231...CeB`). Mixing these up will revert.

## Cross-References

- **wallet-manager**: `build_approve` for VotingEscrow or avKAT Vault approvals, `get_balances` to check KAT/avKAT balances
- **dex**: sell avKAT on SushiSwap for instant exit without cooldown
- **merkl**: `get_merkl_opportunities` to see KAT staking reward APRs, `get_merkl_user_rewards` to check claimable rewards
- **analytics**: `get_token_prices` for KAT price, `get_contract_reference` for all KAT ecosystem addresses
- **lending**: Morpho markets may accept avKAT as collateral
