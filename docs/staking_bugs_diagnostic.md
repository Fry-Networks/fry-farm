# Staking Bugs Diagnostic Report

**Date:** 2026-03-16
**Scope:** Two user-reported bugs on fry.farm staking — phantom claims and incorrect staked amount display
**Type:** Diagnostic only — no code changes, no transactions, no state modifications

---

## 1. Executive Summary

| Bug | Severity | Status |
|-----|----------|--------|
| **Phantom Claims** (legacy V1 reward formula) | Critical | **Resolved** — 9 claims refunded (46.45 FRY), V2 contract deployed with 128-bit math fix |
| **Incorrect Staked Amount Display** | High | **Root cause found** — 3 distinct sub-bugs identified, unfixed |

**Phantom Claims** were caused by V1's integer-truncating reward formula. Users paid fees on claims that returned 0 reward. All 9 affected claims across 6 wallets have been refunded on-chain. V2 contract is live with a 128-bit wide-multiply fix.

**Incorrect Staked Amount Display** has three root causes: (1) pool TVL inflation via `$inc` on re-stake, (2) wrong formula in the profile page reward calculation, and (3) no synchronization between on-chain box state and MongoDB. The main staking page reads correct data from contract boxes; the profile page reads from MongoDB which can be stale or inflated.

---

## 2. System Architecture — Dual Source of Truth

The staking system maintains two independent data stores that are never reconciled:

```
┌─────────────────────────────────────────────────────────────────┐
│                        ON-CHAIN (Algorand)                      │
│                                                                 │
│  Contract Global State          Per-User Box Storage (32 bytes) │
│  ├─ total_staked                ├─ [0:8]   stakedAmount         │
│  ├─ total_stakers               ├─ [8:16]  stakeTime            │
│  ├─ apr                         ├─ [16:24] pendingReward        │
│  ├─ reward_token_amount         └─ [24:32] cumulativeClaimed    │
│  └─ rewards_distributed                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                    (no sync mechanism)
                              │
┌─────────────────────────────────────────────────────────────────┐
│                         OFF-CHAIN (MongoDB)                     │
│                                                                 │
│  Staking (pool-level)           StakingToken (per-user)         │
│  ├─ totalAmountStaked           ├─ totalStaked                  │
│  ├─ totalStakers                ├─ wallet                       │
│  ├─ aprRate                     ├─ poolId / appId               │
│  ├─ stakingTime                 └─ (timestamps)                 │
│  └─ stakingContractId                                           │
└─────────────────────────────────────────────────────────────────┘
```

**Which page reads from where:**

| Page | Data Source | Correctness |
|------|------------|-------------|
| Main staking page (`sTable.tsx`) | On-chain boxes via `getUserData()` / `getUsersStakeData()` | Correct |
| Profile staking page (`PstakeTable.tsx`) | MongoDB via REST API | Can be stale/inflated |
| Stats endpoint (`getUserStakingStats`) | MongoDB aggregation | Can be stale/inflated |

---

## 3. Bug 1: Phantom Claims (Legacy V1 Reward Formula)

### Root Cause

The V1 reward formula used integer arithmetic that truncated to 0 for short staking durations:

```
V1 formula: (staked * apr * ((duration * 100) / 31104000)) / 1000000
                                ^^^^^^^^^^^^^^^^^^^^^^^^
                                This intermediate result truncates to 0
                                when duration < 311,040 seconds (~3.6 days)
```

When `(duration * 100) / 31104000` evaluates to 0 (integer division), the entire reward is 0. However:

1. The `claimTokens()` call **succeeded** (sending 0 reward tokens)
2. The separate, non-atomic fee transfer still **charged** the user
3. `claimTokens()` **reset** `stake_time` to `now`, erasing all accrued staking duration

This means users paid fees and lost accrued time for a 0-reward claim.

### V2 Fix

`contracts/fry_staking_v2/contract.py:302-330` — The `_calc_reward()` subroutine uses 128-bit wide-multiply arithmetic:

```python
# contract.py:324-329
h, l = op.mulw(staked, duration)        # 128-bit: staked * duration
h2, l2 = op.mulw(l, apr)               # multiply low word by apr
h_final = h * apr + h2                  # combine high words
divisor = UInt64(10000) * UInt64(SECONDS_PER_YEAR)
qh, ql, _rh, _rl = op.divmodw(h_final, l2, UInt64(0), divisor)
return ql
```

This eliminates intermediate truncation by multiplying everything first (128-bit), then dividing once at the end.

### Affected Users and Refund Status

**9 phantom claims across 3 pools and 6 wallets — ALL REFUNDED**

Source: `scripts/phantom_claims_manifest.json` and `scripts/phantom_claims_refund_log.json`

| # | Wallet (truncated) | Pool App ID | Pool Name | Fee Charged (FRY) | Refund TX |
|---|-------------------|-------------|-----------|-------------------|-----------|
| 1 | HQK4C6...UFO5UOQ | 3465579498 | Fry → Fry | 0.000915 | XQEEIB... |
| 2 | XETLSD...GWPF4Q | 3465579498 | Fry → Fry | 1.253940 | KHQTP6... |
| 3 | D7F477...VVGBGY | 3465579498 | Fry → Fry | 0.141336 | 3S5HDY... |
| 4 | WFOELF...EJ73XE | 3465579498 | Fry → Fry | 0.052148 | T2V2BH... |
| 5 | XETLSD...GWPF4Q | 3468848937 | USDC → Fry | 8.889226 | 65U5AW... |
| 6 | SAF4L4...OLUIQ | 3468848937 | USDC → Fry | 4.724316 | GGJ4LX... |
| 7 | HQK4C6...UFO5UOQ | 3468848937 | USDC → Fry | 5.030721 | P75RC4... |
| 8 | D7F477...VVGBGY | 3468848937 | USDC → Fry | 7.895858 | HACXRW... |
| 9 | K6YAEL...3BGQ | 3469720617 | Fry → Fry | 18.461827 | MY55KC... |

**Total refunded:** 46.450287 FRY (46,450,287 micro-units)
**Refund date:** 2026-03-13T22:41–22:42 UTC

### Residual Risk in V2

`contract.py:278` — `claimTokens()` still resets `stake_time` unconditionally:

```python
# contract.py:277-278
# Reset stake time to now
user_box.replace(8, op.itob(Global.latest_timestamp))
```

This line executes regardless of whether any reward was sent. If reward ever calculates to 0 in V2 (e.g., `apr` is set to 0 during a pool reconfiguration, or `duration` is 0 in a same-block claim), the same phantom claim pattern recurs:
- User calls `claimTokens()` → reward = 0 → no transfer → but `stake_time` is reset
- Fee is still charged (non-atomic, separate transfer in frontend)
- User loses accrued time

The V2 128-bit math makes reward=0 far less likely (only when `apr=0` or `duration=0`), but the structural vulnerability remains.

---

## 4. Bug 2: Incorrect Staked Amount Display

### Sub-Bug 2a: Pool TVL Inflation on Re-Stake

**Files:** `backend/controllers/stackingController.js:199-208`, `frontend/.../sTable.tsx:315-320`

**The backend update handler:**

```javascript
// stackingController.js:199-208
const { totalAmountStaked, ...otherUpdatedData } = updatedData;
const updateOperation = {
    $set: {
        ...otherUpdatedData,
        totalStakers: newTotalStakers,
    },
};
if (totalAmountStaked !== undefined && !isNaN(totalAmountStaked)) {
    updateOperation.$inc = { totalAmountStaked: totalAmountStaked };
}
```

The backend uses `$inc` (increment) on `totalAmountStaked`, expecting a **delta** (the new amount being staked).

**The frontend sends the wrong value:**

```javascript
// sTable.tsx:315-318 (line numbers from the full file)
const { stakedAmount, stakeTime } = StakerData;
const apr_response = await authAxios.put(`/staking/update/${args._id}`, {
    aprRate: getStakingRecord.apr / 100,
    totalAmountStaked: Number(stakedAmount) / 1_000_000,  // ← BUG
    totalStakers: 1,
    stakingTime: stakeTime,
});
```

`StakerData` comes from `getUserData()` which reads the on-chain box. After a re-stake, `stakedAmount` in the box is the user's **TOTAL** staked balance (old + new), not just the new deposit delta.

**Example of inflation:**

1. User stakes 100 FRY → box says `stakedAmount = 100` → backend `$inc: 100` → MongoDB `totalAmountStaked = 100` ✓
2. User stakes 50 more FRY → box says `stakedAmount = 150` → backend `$inc: 150` → MongoDB `totalAmountStaked = 250` ✗ (should be 150)
3. User stakes 25 more FRY → box says `stakedAmount = 175` → backend `$inc: 175` → MongoDB `totalAmountStaked = 425` ✗ (should be 175)

Every re-stake inflates `totalAmountStaked` by the user's entire existing balance.

**Same bug exists in the migration handler** (`sTable.tsx:719-724`):

```javascript
// sTable.tsx:719-724
await authAxios.put(`/staking/update/${v2Pool._id}`, {
    aprRate: getStakingRecord.apr / 100,
    totalAmountStaked: Number(stakerData.stakedAmount) / 1_000_000,  // ← Same bug
    totalStakers: 1,
    stakingTime: stakerData.stakeTime,
});
```

### Sub-Bug 2b: Profile Page Reward Formula is Wrong

**File:** `frontend/src/components/pages/profile/stake/PstakeTable.tsx:165`

```javascript
// PstakeTable.tsx:165
reward: `${pool.totalAmountStaked
    ? ((pool.totalAmountStaked * pool.aprRate * ((now - pool.stakingTime) / 31104000)) / 1_000_000).toFixed(3)
    : '0'}`,
```

**Three errors in this formula:**

1. **Uses `pool.totalAmountStaked`** (the pool-wide total from MongoDB, which is inflated per Sub-Bug 2a) instead of the user's individual staked amount. This means every user sees a reward calculated from the entire pool's (inflated) TVL, not their own stake.

2. **Uses `pool.stakingTime`** — this field in MongoDB is overwritten to the last staker's `stakeTime` on every `PUT /staking/update/:id` call (see `sTable.tsx:319`). It does not represent the current user's stake start time. The reward duration `(now - pool.stakingTime)` is therefore the time since the *last person staked in this pool*, not since the current user staked.

3. **Divides by 1,000,000** — but `pool.totalAmountStaked` is already stored in standard units (not micro-units) because the frontend divides by 1,000,000 before sending to the backend (`sTable.tsx:317`: `Number(stakedAmount) / 1_000_000`). This double-division makes the displayed reward 1,000,000x too small, partially masking the inflation from errors #1 and #2.

**Net effect:** The displayed reward is wrong in both magnitude and per-user attribution. In some cases the errors partially cancel out (inflation up, double-division down), making the bug appear intermittent.

### Sub-Bug 2c: No On-Chain ↔ MongoDB Sync Mechanism

The main staking page reads from on-chain contract boxes and is always correct:

```typescript
// staking_func.ts:547-568 — getUserData() reads directly from boxes
let box = await algokit.getAppBoxValue(stakingId, stakerData.nameRaw, algod)
const stakedAmount = algosdk.decodeUint64(box.slice(0, 8), 'mixed')
const stakeTime = algosdk.decodeUint64(box.slice(8, 16), 'mixed')
```

The profile page reads from MongoDB and can be wrong:

```typescript
// PstakeTable.tsx:92-106 — builds staked amount from MongoDB records
const stakedAmountMap: Record<string, number> = {}
const allPoolKeys = new Set([...Object.keys(stakerMaxMap), ...Object.keys(tokenMaxMap)])
allPoolKeys.forEach((poolId) => {
    stakedAmountMap[poolId] = Math.max(stakerMaxMap[poolId] || 0, tokenMaxMap[poolId] || 0)
})
```

**Known missing records:** `backend/scripts/recoverMissingStakes.js` identifies **36 wallet positions** that have on-chain box data but no corresponding `StakingToken` record in MongoDB:

| Pool App ID | Pool Name | Missing Records |
|-------------|-----------|-----------------|
| 3468848937 | USDC → Fry | 4 |
| 3469720617 | Fry → Fry | 13 |
| 3470020844 | Fry → Fry | 4 |
| 3473560676 | Fry Node → Fry Node | 10 |
| 3473562061 | Fry VPN → Fry VPN | 1 |
| 3473563847 | Fry → Fry | 1 |
| 3473573376 | Fry → Fry | 1 |
| 3473574550 | Fry Node → Fry Node | 2 |

**Root cause of missing records:** The on-chain stake transaction succeeds, but the subsequent fee transfer can fail. Since the backend API call (`POST /stakingtoken/add`) happens *after* the fee transfer in the frontend flow, a fee failure means no MongoDB record is created even though the user's tokens are staked on-chain.

---

## 5. Reward Calculation Integrity — Full Path Trace

### On-Chain (Contract)

```
contract.py:303  _calc_reward(staked, apr, duration)
                  → staked * apr * duration / (10000 * 31104000)
                  → 128-bit wide multiply, single final division
                  → Result in micro-units (same scale as staked)
```

### Frontend Estimate (staking_func.ts)

```
staking_func.ts:499-501  estimateStakingReward()
                          → stakedAmount * (apr / 10000) * ((now - stakeTime) / 31104000)
                          → Uses floating-point JavaScript math
                          → stakedAmount and result are in micro-units
                          → Reads from on-chain boxes (correct source)
```

### Frontend Claim (staking_func.ts)

```
staking_func.ts:419-422  claimTokens()
                          → Same formula as estimateStakingReward
                          → Used to calculate updatedApr for the contract call
                          → Result: rewardClaimed = reward / 1_000_000 (line 479)
```

### Profile Page Display (PstakeTable.tsx)

```
PstakeTable.tsx:165  reward calculation
                     → pool.totalAmountStaked * pool.aprRate * ((now - pool.stakingTime) / 31104000) / 1_000_000
                     → WRONG: uses pool-wide TVL, not user stake
                     → WRONG: uses last-staker time, not user's time
                     → WRONG: double-divides by 1M (value already in standard units)
                     → Reads from MongoDB (stale source)
```

### Weak Points

1. **Non-atomic fee + backend update:** If fee transfer fails, backend record is never created
2. **`$inc` with absolute value:** Backend increments by total instead of delta
3. **`stakingTime` overwrite:** Pool-level field stores a single user's time, not meaningful for other users
4. **No reconciliation job:** Nothing ever corrects MongoDB drift from on-chain state

---

## 6. V1 → V2 Pool ID Mappings

Source: `scripts/resume_v2_setup.js`

| V1 App ID | V2 App ID |
|-----------|-----------|
| 3468848937 | 3476263283 |
| 3469720617 | 3476263325 |
| 3470020844 | 3476263363 |
| 3473560676 | 3476263400 |
| 3473562061 | 3476263447 |
| 3473563847 | 3476263499 |
| 3473565258 | 3476263540 |
| 3473566323 | 3476263573 |
| 3473573376 | 3476263617 |
| 3473574550 | 3476263663 |

Note: Pool `3465579498` (V1 Fry → Fry, where 4 of the 9 phantom claims occurred) does not have a V2 mapping. This pool pre-dates the V2 migration batch.

---

## 7. On-Chain Queries Needed (NOT EXECUTED)

The following Algorand Indexer queries would provide further diagnostic data. They are documented here for manual execution.

### 7a. Verify Pool TVL Against MongoDB

For each V2 pool, read the contract's global state `total_staked` and compare to MongoDB `totalAmountStaked`:

```bash
# For each V2 app ID (e.g., 3476263283):
curl "https://mainnet-idx.algonode.cloud/v2/applications/3476263283" \
  | jq '.application.params["global-state"]'
```

The `total_staked` global state value (base64-encoded uint64) is the authoritative TVL. Compare to MongoDB's `Staking.totalAmountStaked * 1_000_000` for the same `stakingContractId`.

### 7b. Enumerate All Stakers Per Pool

Read all boxes for a given app to get every staker's on-chain position:

```bash
# List box names (each is a 32-byte address):
curl "https://mainnet-idx.algonode.cloud/v2/applications/3476263283/boxes?limit=100"

# Read a specific box:
curl "https://mainnet-idx.algonode.cloud/v2/applications/3476263283/box?name=b64:<base64_address>"
```

Compare the set of box addresses to `StakingToken.find({ appId: 3476263283 })` wallets. Any box without a MongoDB record is a missing stake (beyond the 36 already identified for V1 pools).

### 7c. Check for Phantom Claims on V2 Pools

Search for claim transactions where the reward inner-transaction amount is 0 but a fee transfer exists:

```bash
# Find all app calls to a V2 pool's claimTokens method:
curl "https://mainnet-idx.algonode.cloud/v2/transactions?application-id=3476263283&limit=100" \
  | jq '[.transactions[] | select(."application-transaction"."application-args"[0] == "<claimTokens_selector>")]'
```

Filter for transactions with 0-amount inner asset transfers followed by a separate fee transfer from the same sender.

### 7d. Audit `stakingTime` Field Accuracy

For each pool in MongoDB, compare `stakingTime` to the most recent staker's box `stakeTime`:

```javascript
// Run in MongoDB shell:
db.stakings.find({}, { stakingContractId: 1, stakingTime: 1, totalAmountStaked: 1 })
```

Then for each pool, read the latest box `stakeTime` — they should match if `stakingTime` is being overwritten by the last staker (confirming Sub-Bug 2b).

---

## 8. Recommended Fixes (Prioritized)

### P0 — Critical (data corruption ongoing)

**Fix the `$inc` / delta bug (Sub-Bug 2a)**

- **Where:** `sTable.tsx:317` and `sTable.tsx:722`
- **What:** Send the *new deposit amount* (the delta), not the full on-chain balance
- **How:** Change `totalAmountStaked: Number(stakedAmount) / 1_000_000` to `totalAmountStaked: args.adjustedStackValue / 1_000_000` (the actual amount being staked in this transaction, minus fee)
- **Alternative:** Change backend from `$inc` to `$set` with the on-chain `total_staked` value — this makes MongoDB self-correcting on every stake

### P0 — Critical (wrong data shown to users)

**Fix the profile reward formula (Sub-Bug 2b)**

- **Where:** `PstakeTable.tsx:165`
- **What:** Replace the MongoDB-based formula with an on-chain box read
- **How:** For each pool the user has staked in, call `getUserData(stakingContractId, activeAddress)` to get the user's actual `stakedAmount` and `stakeTime`, then calculate reward using the same formula as `estimateStakingReward()` in `staking_func.ts:499-501`
- **Bonus:** This also fixes the double-division and the wrong-timestamp issues

### P1 — High (missing records)

**Run the missing stakes recovery script**

- **Where:** `backend/scripts/recoverMissingStakes.js`
- **What:** Creates `StakingToken` records for 36 wallets that have on-chain stakes but no MongoDB record
- **Note:** Script is written and ready; needs to be executed with DB access

### P1 — High (structural)

**Make fee transfer failure non-blocking for backend updates**

- **Where:** `sTable.tsx:286-338` (stake handler)
- **What:** Move the `POST /stakingtoken/add` and `PUT /staking/update` calls to happen immediately after the contract call succeeds, before the fee transfer
- **Why:** Currently, if the fee transfer fails, the backend update never happens, creating orphan on-chain stakes

### P2 — Medium (residual risk)

**Guard `claimTokens()` against reward=0**

- **Where:** `contract.py:277-278`
- **What:** Only reset `stake_time` if a reward was actually sent
- **How:** Wrap the `user_box.replace(8, ...)` in a conditional: `if reward: user_box.replace(8, op.itob(Global.latest_timestamp))`
- **Note:** Requires contract redeployment

### P3 — Low (ongoing integrity)

**Add a reconciliation job**

- **What:** A periodic script that reads all on-chain box data and reconciles `Staking.totalAmountStaked` and `StakingToken.totalStaked` with authoritative on-chain values
- **Why:** Even after fixing the delta bug, historical data is already inflated and new edge cases may arise

---

## Appendix: File Reference

| File | Key Lines | Role |
|------|-----------|------|
| `contracts/fry_staking_v2/contract.py` | L17 (`SECONDS_PER_YEAR`), L100-148 (`stakeTokens`), L224-279 (`claimTokens`), L302-330 (`_calc_reward`) | V2 contract with 128-bit math |
| `backend/controllers/stackingController.js` | L199-208 (`$inc totalAmountStaked`) | Pool update handler — the `$inc` bug |
| `backend/controllers/stackingTokenController.js` | L10-43 (`addStakingToken` upsert), L175-229 (`getUserStakingStats`) | Per-user record upsert and stats aggregation |
| `backend/models/stakingSchema.js` | Full (99 lines) | Pool schema — `totalAmountStaked`, `stakingTime`, `totalStakers` |
| `backend/models/stakingTokenSchema.js` | Full (52 lines) | Per-user stake record schema |
| `frontend/src/staking_func.ts` | L247-318 (`stakeTokens`), L402-487 (`claimTokens`), L490-507 (`estimateStakingReward`), L547-568 (`getUserData`) | All on-chain operations |
| `frontend/src/components/pages/stake/sTable.tsx` | L289-338 (stake handler), L680-739 (migration handler) | Main staking page — sends wrong value to backend |
| `frontend/src/components/pages/profile/stake/PstakeTable.tsx` | L92-106 (staked amount map), L165 (reward formula) | Profile page — wrong formula, reads from MongoDB |
| `scripts/phantom_claims_manifest.json` | Full | 9 phantom claims, 6 wallets, 46.45 FRY |
| `scripts/phantom_claims_refund_log.json` | Full | All 9 refunded with TX IDs |
| `scripts/resume_v2_setup.js` | Pool map | 10 V1 → V2 pool ID mappings |
| `backend/scripts/recoverMissingStakes.js` | Full (278 lines) | 36 missing StakingToken records to recover |
