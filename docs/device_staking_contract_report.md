# FryDeviceStaking Contract Report

## Overview

FryDeviceStaking is a DePIN (Decentralized Physical Infrastructure Network) device NFT staking contract built on Algorand using PuyaPy. It supports two staking modes:

- **Escrow (mode 0):** Users transfer NFTs into the contract. The contract holds the NFTs in escrow and returns them on unstake. Escrow stakers automatically pass device verification.
- **Verified-hold (mode 1):** Users register as holders and retain custody of their NFTs. An authorized verifier attests to the user's device holdings off-chain, updating on-chain verification fields that gate reward eligibility.

The contract supports three reward models (fixed rate, proportional, APR-based), configurable fee structures, NFT collection verification via creator address or whitelist, and a device verification multiplier that scales rewards.

Source: 487 lines of PuyaPy. Compiled approval TEAL: 2,233 lines.

## Contract Artifacts

| Artifact | Path |
|----------|------|
| Contract source | `/opt/fry-farm/contracts/fry_device_staking/contract.py` |
| Approval TEAL | `/opt/fry-farm/contracts/fry_device_staking/FryDeviceStaking.approval.teal` |
| Clear TEAL | `/opt/fry-farm/contracts/fry_device_staking/FryDeviceStaking.clear.teal` |
| ARC32 spec | `/opt/fry-farm/contracts/fry_device_staking/FryDeviceStaking.arc32.json` |
| ARC56 spec | `/opt/fry-farm/contracts/fry_device_staking/FryDeviceStaking.arc56.json` |
| TypeScript client | `/opt/fry-farm/frontend/src/contracts/FryDeviceStakingClient.ts` |
| Compiled TEAL | `/opt/fry-farm/frontend/src/contracts/FryDeviceStakingCompiled.ts` |

## Global State (23 fields: 19 uints + 4 byte slices)

| # | Field | Type | Description |
|---|-------|------|-------------|
| 1 | `creator` | bytes | Pool creator address. Has admin authority over pool configuration. |
| 2 | `collection_creator` | bytes | NFT collection creator address used for creator-based collection verification. |
| 3 | `fee_recipient` | bytes | Address that receives deposit, withdrawal, and claim fees. |
| 4 | `verifier` | bytes | Authorized verifier address that can call `update_verification`. |
| 5 | `reward_token_id` | uint64 | Reward token ASA ID. Set to 0 for ALGO rewards. |
| 6 | `reward_model` | uint64 | Reward calculation model: 0 = fixed rate, 1 = proportional, 2 = APR. |
| 7 | `collection_mode` | uint64 | NFT collection verification mode: 0 = creator address, 1 = whitelist, 2 = both (creator OR whitelist). |
| 8 | `nft_value` | uint64 | Generic NFT value parameter (reserved for future use or UI display). |
| 9 | `rate_per_day` | uint64 | Reward tokens per NFT per day (used by fixed rate model, model 0). |
| 10 | `total_reward_pool` | uint64 | Total reward pool size (used by proportional model, model 1). |
| 11 | `apr_rate` | uint64 | Annual percentage rate in basis points (used by APR model, model 2). |
| 12 | `value_per_nft` | uint64 | Value assigned to each NFT for APR reward calculation (model 2). |
| 13 | `pool_end_time` | uint64 | Unix timestamp when the pool stops accruing rewards. 0 = no end. |
| 14 | `lock_period` | uint64 | Minimum lock period in seconds before unstaking is allowed. 0 = no lock. |
| 15 | `total_nfts_staked` | uint64 | Current total number of NFTs staked across all users (escrow mode counter). |
| 16 | `total_rewards_claimed` | uint64 | Cumulative reward tokens distributed to all users. |
| 17 | `deposit_fee_bps` | uint64 | Deposit fee in basis points (reserved; not currently applied in contract logic). |
| 18 | `withdraw_fee_bps` | uint64 | Withdrawal fee in basis points (reserved; not currently applied in contract logic). |
| 19 | `claim_fee_bps` | uint64 | Claim fee in basis points (reserved; not currently applied in contract logic). |
| 20 | `is_active` | uint64 | Pool active flag: 1 = active, 0 = paused. Staking/registration blocked when paused. |
| 21 | `total_reward_balance` | uint64 | Available reward balance in the contract. Decremented on each claim. |
| 22 | `staking_mode` | uint64 | Staking mode: 0 = escrow (NFT transfer), 1 = verified-hold (custody retained). |
| 23 | `total_verified_holders` | uint64 | Count of registered verified-hold participants (mode 1 only). |

## Box Layout (864 bytes per user)

Each user's state is stored in a box keyed by the user's 32-byte address. The box is 864 bytes with the following layout:

| Byte Range | Field | Size (bytes) | Description |
|------------|-------|--------------|-------------|
| 0 -- 7 | `nft_count` | 8 | Number of NFTs staked (escrow) or attested by verifier (verified-hold). |
| 8 -- 15 | `first_stake_time` | 8 | Unix timestamp of initial stake or registration. Used for lock period checks. |
| 16 -- 23 | `last_claim_time` | 8 | Unix timestamp of most recent reward claim. Reward accrual starts from this time. |
| 24 -- 31 | `total_claimed` | 8 | Cumulative rewards claimed by this user. |
| 32 -- 831 | `nft_ids[0..99]` | 800 | Array of up to 100 NFT ASA IDs (8 bytes each). Escrow mode stores actual IDs; verified-hold mode leaves this zeroed. |
| 832 -- 839 | `is_verified` | 8 | Device verification flag: 1 = verified, 0 = not verified. Escrow stakers default to 1. |
| 840 -- 847 | `requirements_met` | 8 | Whether device requirements are met: 1 = yes, 0 = no. Escrow stakers default to 1. |
| 848 -- 855 | `effective_multiplier` | 8 | Reward multiplier in basis points (10000 = 1.0x). Applied to reward before distribution. |
| 856 -- 863 | `last_verification_time` | 8 | Unix timestamp of last verification update by verifier. |

**Total:** 4 header fields (32 bytes) + 100 NFT ID slots (800 bytes) + 4 device fields (32 bytes) = **864 bytes**.

## ABI Methods (16 total)

| # | Method | ABI Signature | Mode | Access | Description |
|---|--------|---------------|------|--------|-------------|
| 1 | `init_device_pool` | `init_device_pool(uint64,uint64,uint64,address,uint64,uint64,uint64,uint64,uint64,uint64,uint64,address,uint64,uint64,uint64,uint64,address)void` | Both | Anyone (create) | Creates the application and initializes all 23 global state fields. Called exactly once at contract creation. |
| 2 | `add_to_whitelist` | `add_to_whitelist(uint64)void` | Both | Creator | Appends an NFT ASA ID to the whitelist box (`wl`). Creates the box on first call. |
| 3 | `remove_from_whitelist` | `remove_from_whitelist(uint64)void` | Both | Creator | Removes an NFT ASA ID from the whitelist box using swap-with-last removal. Deletes the box if last entry is removed. |
| 4 | `opt_in_asset` | `opt_in_asset(uint64,pay)void` | Both | Anyone | Opts the contract into an ASA. Requires an MBR payment. Must be called before staking NFTs or depositing ASA rewards. |
| 5 | `deposit_rewards` | `deposit_rewards(axfer)void` | Both | Creator | Deposits ASA reward tokens into the contract. Increments `total_reward_balance`. |
| 6 | `deposit_rewards_algo` | `deposit_rewards_algo(pay)void` | Both | Creator | Deposits ALGO rewards into the contract. Only valid when `reward_token_id` is 0. |
| 7 | `stake_nft` | `stake_nft(axfer,pay)void` | Escrow only | Anyone | Transfers an NFT into escrow. Creates user box on first stake. Auto-claims pending rewards for existing stakers. Verifies collection membership. |
| 8 | `unstake_nft` | `unstake_nft(uint64)void` | Escrow only | Staker | Withdraws a specific NFT from escrow. Enforces lock period. Auto-claims rewards. Deletes box when last NFT is removed. |
| 9 | `register_holder` | `register_holder(pay)void` | Verified-hold only | Anyone | Creates a user box for verified-hold participation. User retains NFT custody. Requires MBR payment. Increments `total_verified_holders`. |
| 10 | `update_verification` | `update_verification(address,uint64,uint64,uint64,uint64)void` | Verified-hold only | Verifier | Attests a user's device holdings: sets `nft_count`, `is_verified`, `requirements_met`, `effective_multiplier`, and `last_verification_time`. Can be called even when pool is paused. |
| 11 | `unregister_holder` | `unregister_holder()void` | Verified-hold only | Holder | Removes a user's registration. Auto-claims pending rewards before deleting the box. Decrements `total_verified_holders`. |
| 12 | `set_verifier` | `set_verifier(address)void` | Both | Creator | Updates the authorized verifier address. |
| 13 | `claim_rewards` | `claim_rewards()void` | Both | Staker/Holder | Claims accrued rewards. Calculates reward based on the active reward model, applies verification multiplier, and transfers tokens. |
| 14 | `pause_pool` | `pause_pool()void` | Both | Creator | Pauses the pool by setting `is_active` to 0. Blocks new staking and registration. |
| 15 | `resume_pool` | `resume_pool()void` | Both | Creator | Resumes the pool by setting `is_active` to 1. |
| 16 | `update_end_time` | `update_end_time(uint64)void` | Both | Creator | Updates `pool_end_time` to a new Unix timestamp. |

## Reward Formulas

### Model 0: Fixed Rate

```
reward = nft_count * rate_per_day * elapsed_seconds / 86400
```

Pays a fixed number of tokens per NFT per day. Uses 128-bit intermediate multiplication to avoid overflow.

### Model 1: Proportional

```
reward = total_reward_pool * nft_count * elapsed_seconds / (total_nfts_staked * total_duration)
```

Distributes a fixed total reward pool proportionally based on each user's share of staked NFTs and time in the pool. `total_duration` is calculated from the user's `first_stake_time` to `pool_end_time`. Uses 128-bit arithmetic.

### Model 2: APR

```
reward = nft_count * value_per_nft * apr_rate * elapsed_seconds / (10000 * 31104000)
```

Calculates rewards as an annual percentage rate applied to the notional value of staked NFTs. `apr_rate` is in basis points (e.g., 500 = 5% APR). The year is defined as 360 days (31,104,000 seconds). Uses `mulw`/`divmodw` for 128-bit precision.

### Common Reward Adjustments

All three models share the following post-calculation steps:

1. **Time capping:** If `pool_end_time` is set and the current time exceeds it, elapsed time is capped at `pool_end_time`.
2. **Device verification gate:** If `is_verified == 0` or `requirements_met == 0`, the reward is set to zero.
3. **Multiplier application:** If `effective_multiplier != 10000`, the reward is scaled: `reward = reward * effective_multiplier / 10000`.
4. **Balance clamping:** The reward is clamped to `total_reward_balance` to prevent over-distribution.
5. **Claim time update:** `last_claim_time` is always updated to the current timestamp, even if the reward is zero.

## Verifier Pattern

The verifier pattern enables off-chain device attestation for verified-hold staking pools:

### Setup

1. The pool creator specifies a `verifier` address at pool creation via `init_device_pool`.
2. The verifier address can be changed at any time by the creator via `set_verifier`.

### Verification Flow

1. A user calls `register_holder` to create their box. The box is initialized with `is_verified = 0`, `requirements_met = 0`, and `effective_multiplier = 10000`.
2. An off-chain service (the verifier) inspects the user's wallet to confirm they hold the required device NFTs and meet any additional requirements.
3. The verifier calls `update_verification(user, nft_count, is_verified, requirements_met, effective_multiplier)` to write the attestation on-chain.

### Fields Updated by Verifier

| Field | Description |
|-------|-------------|
| `nft_count` | Number of qualifying NFTs the user holds (determines reward weight). |
| `is_verified` | 1 if the user's holdings are confirmed, 0 otherwise. Must be 1 for rewards. |
| `requirements_met` | 1 if additional device requirements are satisfied. Must be 1 for rewards. |
| `effective_multiplier` | Reward scaling factor in basis points. 10000 = 1.0x (no scaling). Values below 10000 reduce rewards; values above 10000 amplify them. |
| `last_verification_time` | Automatically set to `Global.latest_timestamp` on each update. |

### Key Properties

- The verifier can update a user's verification status **even when the pool is paused** (no `is_active` check in `update_verification`).
- Escrow stakers (mode 0) bypass the verifier entirely: their box is initialized with `is_verified = 1`, `requirements_met = 1`, and `effective_multiplier = 10000`.
- If a user's verification lapses (verifier sets `is_verified = 0`), they accrue zero rewards until re-verified, but their registration and box persist.

## Compilation

```bash
cd /opt/fry-farm/contracts
.venv/bin/puyapy --output-arc32 fry_device_staking
```

This produces the approval TEAL (2,233 lines), clear TEAL (7 lines), ARC32 JSON, and ARC56 JSON artifacts in the `fry_device_staking/` directory.
