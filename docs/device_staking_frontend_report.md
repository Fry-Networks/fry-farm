# Device Staking Frontend — Implementation Report

## Overview

Complete frontend implementation for the device staking feature, adding 13 new files and modifying 2 existing files. The implementation follows existing NFT staking patterns throughout.

## Files Created

| # | File | Lines | Purpose |
|---|------|-------|---------|
| 1 | `frontend/src/types/deviceStaking.ts` | 171 | TypeScript interfaces for all device staking data models |
| 2 | `frontend/src/services/deviceStakingApi.ts` | 104 | API service with 16 functions (GET/POST/PUT) for backend communication |
| 3 | `frontend/src/device_staking_func.ts` | 516 | 13 Algorand smart contract interaction functions |
| 4 | `frontend/src/pages/deviceStake.tsx` | 19 | Page wrapper: PageBg + Navbar + DeviceStakeTable + Footer |
| 5 | `frontend/src/pages/devicePoolStats.tsx` | 322 | Pool detail page with stats, requirements, multipliers, positions, announcements |
| 6 | `frontend/src/pages/deviceDashboard.tsx` | 19 | Page wrapper for creator dashboard |
| 7 | `frontend/src/components/pages/deviceStake/deviceStakeTable.tsx` | 162 | Pool listing with tabs (MyLive/MyEnded/Live/Ended/All), search, create button |
| 8 | `frontend/src/components/pages/deviceStake/deviceTable.tsx` | 267 | Ant Design Table with expandable rows, staking mode badges, action buttons |
| 9 | `frontend/src/components/pages/deviceStake/deviceDashboard.tsx` | 270 | Creator dashboard: analytics, pause/resume, announcements CRUD |
| 10 | `frontend/src/Modals/website/CreateDevicePoolWizard.tsx` | 847 | 8-step creation wizard with full deploy flow |
| 11 | `frontend/src/Modals/website/DeviceStakeModal.tsx` | 246 | Stake modal: escrow (NFT grid selection) or verified-hold (register) |
| 12 | `frontend/src/Modals/website/DeviceClaimModal.tsx` | 179 | Claim modal with pending rewards calculation and fee breakdown |
| 13 | `frontend/src/Modals/website/DeviceUnstakeModal.tsx` | 222 | Unstake modal: escrow (batch unstake) or verified-hold (unregister) |

## Files Modified

| # | File | Changes |
|---|------|---------|
| 14 | `frontend/src/Home.tsx` | Added 3 imports + 3 routes (`/device-stake`, `/device-pool-stats`, `/device-dashboard`) |
| 15 | `frontend/src/components/layout/navbar.tsx` | Updated `isStakeActive`, added "Device Stake" to desktop dropdown + mobile drawer |

## Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/device-stake` | `DeviceStake` | Pool listing page |
| `/device-pool-stats?appId=xxx` | `DevicePoolStats` | Pool detail/stats page |
| `/device-dashboard?appId=xxx` | `DeviceDashboard` | Creator dashboard (restricted to pool creator) |

## UX Flows

### Pool Discovery
1. User clicks "Device Stake" in Stake dropdown (desktop) or Stake section (mobile drawer)
2. Pool list loads with tab filtering and search
3. Expanding a row shows action buttons that adapt to staking mode

### Pool Creation (8-Step Wizard)
1. **Mode**: Choose verified-hold (default) or escrow, set verifier address
2. **Collection**: Set collection mode (creator/whitelist/both), auto-fetch image + NFD name
3. **Token**: Select reward token via TokenSelector, show balance
4. **Rewards**: Choose model (fixed_rate/proportional/apr), set parameters, lock period, end date, deposit amount
5. **Fees**: Configure deposit/withdraw/claim fee basis points
6. **Requirements**: Toggle on/off, add dynamic entries (token_balance, staking_position, nft_holding, multi_device, wallet_age)
7. **Multipliers**: Toggle on/off, add dynamic entries (stake_duration, token_balance, device_count, requirement_met)
8. **Review & Deploy**: Full summary, deploy flow (auth → fee → contract create → MBR → opt-in → deposit → backend POST)

### Staking (Escrow Mode)
1. User clicks "Stake NFT" → DeviceStakeModal opens
2. Loads eligible NFTs from wallet, grid selection with checkboxes
3. For each selected: opt-in contract → stake on-chain → record in backend

### Staking (Verified Hold Mode)
1. User clicks "Register" → DeviceStakeModal opens
2. Shows explanation that NFT stays in wallet
3. Registers on-chain (box payment only) → records in backend

### Claiming Rewards
1. User clicks "Claim" → DeviceClaimModal opens
2. Calculates pending rewards from on-chain box data
3. Shows fee breakdown (fee % → net amount)
4. Claims on-chain → records in backend with txId

### Unstaking
- **Escrow**: Loads positions, checks lock period, batch unstake with auto-claim
- **Verified Hold**: Single unregister call with auto-claim

### Pool Stats Page
- Header with staking mode + status badges
- 6-card stats grid
- Pool details key/value table
- Requirements panel with per-item check/cross (if wallet connected)
- Multipliers panel with type/stackable badges
- Staked devices grid
- Announcements list

### Creator Dashboard
- Pause/Resume pool actions
- Status breakdown grid
- Requirement compliance percentage bars
- Multiplier distribution
- Total claimed display
- Staker growth by month
- Announcement CRUD (create form + existing list)

## Contract Functions (device_staking_func.ts)

| Function | Description |
|----------|-------------|
| `createDevicePool()` | ATC deploy with `init_device_pool` (17 params), schema 19/4, MBR payment |
| `optInDeviceContractToAsset()` | Opt contract into ASA |
| `depositDeviceRewards()` | ASA token deposit |
| `depositDeviceRewardsAlgo()` | ALGO deposit |
| `stakeDeviceNft()` | Escrow stake: NFT transfer + box payment + fee |
| `unstakeDeviceNft()` | Escrow unstake + fee |
| `registerDeviceHolder()` | Verified-hold register: box payment only |
| `unregisterDeviceHolder()` | Verified-hold unregister + fee |
| `claimDeviceRewardsOnChain()` | Claim with box ref + fee |
| `setDeviceVerifier()` | Update verifier address |
| `pauseDevicePool()` | Pause pool |
| `resumeDevicePool()` | Resume pool |
| `updateDeviceEndTime()` | Update end time |
| `calculateDevicePendingRewards()` | Client-side reward estimation from box data |
| `getDevicePoolData()` | Read global state |

## Key Differences from NFT Staking

- **appId**: `string` (not `number`) — converted to `Number()` only for contract calls
- **BOX_PRICE**: `348,100` microAlgos (864-byte boxes vs 64 for NFT staking)
- **Global state schema**: `numGlobalInts: 19, numGlobalByteSlices: 4` (vs 17/3)
- **Staking modes**: `escrow` (lock NFT) and `verified-hold` (keep NFT, verifier confirms)
- **Reward model**: String enum (`fixed_rate`/`proportional`/`apr`) instead of numeric
- **Requirements & multipliers**: Dynamic arrays in pool config and positions
- **Announcements**: Pool-level announcement system with priority levels
- **Creator dashboard**: Analytics and management page

## Verification

- `npx tsc --noEmit` passes with 0 errors
- No new dependencies required
- All contract artifacts already exist (`FryDeviceStakingClient.ts`, `FryDeviceStakingCompiled.ts`)

## Backups

Backups of modified files stored in `/opt/fry-farm/backups/`:
- `Home.tsx.bak.<timestamp>`
- `navbar.tsx.bak.<timestamp>`

## Rollback

```bash
rm -f frontend/src/types/deviceStaking.ts
rm -f frontend/src/services/deviceStakingApi.ts
rm -f frontend/src/device_staking_func.ts
rm -f frontend/src/pages/deviceStake.tsx
rm -f frontend/src/pages/devicePoolStats.tsx
rm -f frontend/src/pages/deviceDashboard.tsx
rm -rf frontend/src/components/pages/deviceStake/
rm -f frontend/src/Modals/website/CreateDevicePoolWizard.tsx
rm -f frontend/src/Modals/website/DeviceStakeModal.tsx
rm -f frontend/src/Modals/website/DeviceClaimModal.tsx
rm -f frontend/src/Modals/website/DeviceUnstakeModal.tsx
cp backups/Home.tsx.bak.TIMESTAMP frontend/src/Home.tsx
cp backups/navbar.tsx.bak.TIMESTAMP frontend/src/components/layout/navbar.tsx
```
