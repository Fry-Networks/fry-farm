# Device Staking — Mongoose Models Report

> Generated 2026-03-15. Covers 4 new Mongoose models for the DePIN device NFT staking feature.

---

## Models Created

| # | File | Model | Collection | Timestamps | Fields | Indexes |
|---|------|-------|------------|------------|--------|---------|
| 1 | `devicePoolSchema.js` | DevicePool | `devicePools` | Manual `createdAt` | 35+ | 4 |
| 2 | `devicePositionSchema.js` | DevicePosition | `devicePositions` | `{ timestamps: true }` | 25+ | 4 |
| 3 | `walletLinkSchema.js` | WalletLink | `walletLinks` | `{ timestamps: true }` | 2 + links subdoc | 1 (unique field) |
| 4 | `devicePoolAnnouncementSchema.js` | DevicePoolAnnouncement | `devicePoolAnnouncements` | `{ timestamps: true }` | 7 | 1 |

---

## Schema Details

### 1. DevicePool (`devicePools`)

**Pool Identity**: appId (String, required, unique), creator, name, description, imageUrl, status (enum: active/ended/paused)

**Staking Mode**: stakingMode (enum: verified-hold/escrow), verifierAddress, verificationIntervalMinutes (default 15), verificationGracePeriod (default 3)

**NFT Collection**: collectionCreator, collectionMode (enum: creator_address/whitelist/both), whitelist ([Number]), acceptedCollections array with nested identifiers (creatorAddress, contractAddress, collectionAddress, evmChainId)

**Rewards**: rewardTokenId (Number, required), rewardToken embedded object (id/name/symbol/image/decimals), rewardModel (enum: fixed_rate/proportional/apr), rewardPerDay, dailyPoolReward, apr, valuePerNft, rewardAmount

**Fees**: depositFeeBps (default 0), withdrawFeeBps (default 0), claimFeeBps (default 800)

**Timing**: startDate, endDate, lockPeriod (seconds, default 0)

**Stats**: totalStaked, totalStakers, tags

**Chain**: chainId (default algorand-mainnet), chainType (enum: algorand/evm/solana/cosmos)

**Requirements**: Array of subdocs — requirementId, type (enum: token_balance/staking_position/nft_holding/multi_device/wallet_age), label, description, params (Mixed), enforcement (enum: required/optional_boost)

**Boost Multipliers**: Array of subdocs — multiplierId, label, description, type (enum: stake_duration/token_balance/device_count/requirement_met), params (Mixed), stackable, maxMultiplier (default 100000 = 10x in bps)

**Announcements/Gating**: announcementsEnabled, gatedAccessEnabled, gatedAccessLabel

**Analytics**: Embedded object — totalUniqueStakers, deviceTypeBreakdown (Mixed), averageStakeDurationDays, retentionRate30d, lastAnalyticsUpdate

**Indexes**:
- `{ appId: 1 }` — unique (from field definition)
- `{ status: 1, chainId: 1 }` — pool listing queries
- `{ creator: 1 }` — creator dashboard
- `{ "acceptedCollections.identifiers.creatorAddress": 1 }` — collection lookup

### 2. DevicePosition (`devicePositions`)

**Core**: poolAppId, wallet, deviceNftId, deviceNftName, deviceChainId, stakingMode, status (enum: active/escrow_locked/requirements_not_met/verification_expired/unstaked), stakeTime, lastClaimTime, lockExpiry

**Verification**: lastVerificationTime, lastVerificationResult (enum: verified/failed/pending), consecutiveFailures

**Cross-chain**: sourceChainWallet

**Requirements**: requirementStatus array (requirementId/met/lastChecked/details), allRequiredMet (default true)

**Multipliers**: activeMultipliers array (multiplierId/currentMultiplier/lastChecked/qualifyingDetails), effectiveMultiplier (default 10000 = 1.0x in bps)

**Rewards**: totalClaimed, lastRewardsClaimed

**Escrow**: escrowTxId

**Indexes**:
- `{ poolAppId: 1, wallet: 1, deviceNftId: 1 }` — unique compound
- `{ poolAppId: 1, status: 1 }` — pool position queries
- `{ wallet: 1, status: 1 }` — user portfolio queries
- `{ status: 1, stakingMode: 1, lastVerificationTime: 1 }` — verification cron

### 3. WalletLink (`walletLinks`)

**Fields**: algorandAddress (String, required, unique), links array containing chainId, walletAddress, signatureProof, signedMessage, verifiedAt, active

**Index**: Unique on algorandAddress (from field definition)

### 4. DevicePoolAnnouncement (`devicePoolAnnouncements`)

**Fields**: poolAppId, creator, title (maxlength 200), body (maxlength 2000), priority (enum: normal/urgent), expiresAt, readBy ([String])

**Index**: `{ poolAppId: 1, createdAt: -1 }` — chronological listing per pool

---

## Naming Comparison with Existing Models

| Aspect | Existing Pattern | New Models |
|--------|-----------------|------------|
| Require | `const mongoose = require("mongoose");` | Same |
| Schema | `new mongoose.Schema({ ... })` | Same |
| Export | `mongoose.model("Name", schema, "collection")` | Same |
| Pool timestamps | Manual `createdAt: { type: Date, default: Date.now }` | `devicePoolSchema` uses manual `createdAt` |
| Position timestamps | `{ timestamps: true }` option | `devicePositionSchema` uses `{ timestamps: true }` |
| appId type | Number (nftStakingPool) | String (cross-chain support) |
| Indexes | `schema.index()` after definition | Same |

---

## Validation Results

| Check | Result |
|-------|--------|
| Files exist | 4/4 present |
| `node -c` syntax | All pass |
| Model require | All load without errors |
| Model names | DevicePool, DevicePosition, WalletLink, DevicePoolAnnouncement |
| Collection names | devicePools, devicePositions, walletLinks, devicePoolAnnouncements |
| Duplicate index warning | Fixed (removed redundant `schema.index` for appId unique) |
| No existing model modifications | Confirmed — no existing files changed |

---

## Rollback

```bash
rm -f /opt/fry-farm/backend/models/devicePoolSchema.js
rm -f /opt/fry-farm/backend/models/devicePositionSchema.js
rm -f /opt/fry-farm/backend/models/walletLinkSchema.js
rm -f /opt/fry-farm/backend/models/devicePoolAnnouncementSchema.js
rm -f /opt/fry-farm/docs/device_staking_models_report.md
```

Backup at: `/opt/fry-farm/backups/models_pre_device_<timestamp>/`
