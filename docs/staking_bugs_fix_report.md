# Staking Bugs Fix Report

**Date:** 2026-03-16
**Diagnostic:** `/opt/fry-farm/docs/staking_bugs_diagnostic.md`
**Scope:** 4 fixes for TVL inflation, profile reward formula, missing stakes, and orphan stake prevention

---

## Fix Summary

| Fix | Priority | Status | Files Modified |
|-----|----------|--------|----------------|
| 1B: Backend `$inc` → `$set` | P0 | Done | `backend/controllers/stackingController.js` |
| 1A: Frontend sends pool `totalStaked` | P0 | Done | `frontend/src/components/pages/stake/sTable.tsx` |
| 2: Profile page on-chain reads | P0 | Done | `frontend/src/components/pages/profile/stake/PstakeTable.tsx` |
| 3: Missing stakes recovery | P1 | Already done | (script confirmed all 36 records exist) |
| 4: Resilient backend updates | P1 | Done | `frontend/src/components/pages/stake/sTable.tsx` |

---

## Fix 1B — Backend `$inc` → `$set`

**File:** `backend/controllers/stackingController.js` line 207

```diff
 if (totalAmountStaked !== undefined && !isNaN(totalAmountStaked)) {
-    updateOperation.$inc = { totalAmountStaked: totalAmountStaked };
+    updateOperation.$set.totalAmountStaked = totalAmountStaked;
 }
```

**Effect:** The `totalAmountStaked` field is now set to exactly what the frontend sends (the authoritative on-chain pool total), not incremented. This makes the operation idempotent — retries and race conditions converge to the correct value.

---

## Fix 1A — Frontend Sends Pool-Wide `totalStaked`

**File:** `frontend/src/components/pages/stake/sTable.tsx`

### Interface update (line 37-46)

```diff
 interface StakingRecord {
   apr: number
   lockPeriod: number
   poolStartTime: number
   poolEndTime: number
   rewardToken?: number
   stakeToken?: number
   poolTime?: number
+  totalStaked?: number
 }
```

### Stake handler (line 318)

```diff
-          totalAmountStaked: Number(stakedAmount) / 1_000_000,
+          totalAmountStaked: Number(getStakingRecord.totalStaked ?? 0) / 1_000_000,
```

### Withdraw handler (line 434, 443, 447, 451)

```diff
-      const getStakingRecord = await getStakingData(args.stakingContractId, activeAddress!, signer);
+      const getStakingRecord = await getStakingData(args.stakingContractId, activeAddress!, signer) as StakingRecord;
```

```diff
-      if (!getStakingRecord || typeof (getStakingRecord as { apr: number }).apr !== 'number') {
+      if (!getStakingRecord || typeof getStakingRecord.apr !== 'number') {
```

```diff
-      const calculateAPR = (getStakingRecord as { apr: number }).apr / 100;
+      const calculateAPR = getStakingRecord.apr / 100;
```

```diff
-        totalAmountStaked: Number(stakedAmount) / 1_000_000,
+        totalAmountStaked: Number(getStakingRecord.totalStaked ?? 0) / 1_000_000,
```

### Migration handler (line 716)

```diff
-        totalAmountStaked: Number(stakerData.stakedAmount) / 1_000_000,
+        totalAmountStaked: Number(getStakingRecord.totalStaked ?? 0) / 1_000_000,
```

**Effect:** All three call sites now send the pool's on-chain `total_staked` global state value (from `getStakingData()`) instead of the individual user's staked amount. Combined with Fix 1B, MongoDB's `totalAmountStaked` always matches the on-chain truth.

---

## Fix 2 — Profile Page On-Chain Reads

**File:** `frontend/src/components/pages/profile/stake/PstakeTable.tsx`

### New import (line 7)

```diff
+import { getUserData } from '../../../../staking_func'
```

### On-chain data fetch (added after pool filter, before price fetch)

```typescript
const onChainDataMap: Record<number, { stakedAmount: number; stakeTime: number }> = {}
await Promise.allSettled(
  userPools.map(async (pool: any) => {
    try {
      const contractId = Number(pool.stakingContractId)
      if (!contractId || !activeAddress) return
      const data = await getUserData(contractId, activeAddress)
      onChainDataMap[contractId] = {
        stakedAmount: Number(data.stakedAmount),
        stakeTime: Number(data.stakeTime),
      }
    } catch {
      // User may not have a box (e.g., creator-only, or box deleted after full unstake)
    }
  })
)
```

### User staked amount (was line 151)

```diff
-        const userStakedAmount = stakedAmountMap[pool._id] || 0
+        const contractId = Number(pool.stakingContractId)
+        const onChainData = onChainDataMap[contractId]
+        const userStakedMicro = onChainData?.stakedAmount ?? (stakedAmountMap[pool._id] || 0)
```

### User staked display (was line 165)

```diff
-          userStaked: userStakedAmount > 0 ? `${(userStakedAmount / 1_000_000).toFixed(3)}` : '0',
+          userStaked: userStakedMicro > 0 ? `${(userStakedMicro / 1_000_000).toFixed(3)}` : '0',
```

### Reward formula (was line 166)

```diff
-          reward: `${pool.totalAmountStaked ? ((pool.totalAmountStaked * pool.aprRate * ((now - pool.stakingTime) / 31104000)) / 1_000_000).toFixed(3) : '0'}`,
+          reward: onChainData && onChainData.stakedAmount > 0 && pool.aprRate
+            ? `${((onChainData.stakedAmount * (pool.aprRate / 100) * ((now - onChainData.stakeTime) / 31104000)) / 1_000_000).toFixed(3)}`
+            : '0',
```

**Three bugs fixed:**
1. Uses user's individual `stakedAmount` from on-chain box (not pool-wide TVL)
2. Uses user's individual `stakeTime` from on-chain box (not last staker's time)
3. Correct unit math: micro-units × (aprRate/100) × time-fraction / 1M = standard units

---

## Fix 3 — Missing Stakes Recovery

**Status:** Already completed.

The dry run confirmed all 36 positions already exist in MongoDB:
```
Inserted: 0
Skipped:  36
Errors:   0
```

All records have IDs with prefix `69b32f2...`, indicating they were inserted in a prior batch recovery run.

---

## Fix 4 — Resilient Backend Updates

**File:** `frontend/src/components/pages/stake/sTable.tsx`

### Stake handler

Backend calls (`getStakingData`, `getUserData`, `POST /stakingtoken/add`, `PUT /staking/update`) wrapped in inner try/catch. Failure logs a warning but user always sees "Staking successful!" since the on-chain transaction succeeded.

### Withdraw handler

Same pattern — backend calls wrapped in inner try/catch. On-chain unstake success is never masked by backend update failure.

### Migration handler

Same pattern — backend calls wrapped in inner try/catch.

**Effect:** If algod node times out or the backend API is temporarily unreachable after a successful on-chain operation, the user is not shown a misleading error. This prevents the scenario where users think their stake failed and try again (causing double-stakes). MongoDB data will self-correct on the next successful operation.

---

## Verification Results

| Check | Result |
|-------|--------|
| `node -c backend/controllers/stackingController.js` | Pass |
| `cd frontend && npx tsc --noEmit` | Pass |
| Recovery script dry run | All 36 records already exist |

---

## Backup Locations

| File | Backup |
|------|--------|
| `sTable.tsx` | `/opt/fry-farm/backups/sTable.tsx.bak.*` |
| `PstakeTable.tsx` | `/opt/fry-farm/backups/PstakeTable.tsx.bak.*` |
| `stackingController.js` | `/opt/fry-farm/backups/stackingController.js.bak.*` |

---

## Deployment Required

1. **Backend:** Rebuild and restart the `fry-farm-backend` Docker container to pick up `stackingController.js` change
2. **Frontend:** Rebuild the frontend (`npm run build` or equivalent) and deploy to pick up `sTable.tsx` and `PstakeTable.tsx` changes

---

## Not In Scope

- **P2 contract fix** (`contract.py:278` — conditional `stake_time` reset): Requires contract redeployment and pool migration. Documented in diagnostic report.
- **`addStakingToken` `$inc` fix** (`stakingTokenController.js:24`): Per-user `StakingToken.totalStaked` also uses `$inc`, but this is lower priority since the profile page now reads on-chain data directly.
