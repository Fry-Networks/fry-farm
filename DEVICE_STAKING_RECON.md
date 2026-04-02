# DePIN Device NFT Staking — Architectural Recon Report

> Generated 2026-03-15 for the permissionless DePIN device NFT staking pools initiative.
> Covers fry.farm's existing staking, farming, NFT, and infrastructure systems.

---

## 1. Project Structure Map

```
/opt/fry-farm/
├── docker-compose.yml            # Single backend service (256MB limit)
├── deploy-backend.sh             # 1Password secret injection + docker rebuild
├── .env                          # Root secrets (restricted)
│
├── backend/                      # Express.js API (Node 18-alpine)
│   ├── index.js                  # Entry: Express, CORS, rate limiters, route mounting
│   ├── Dockerfile                # node:18-alpine, non-root, --omit=dev
│   ├── package.json              # algosdk 3.5.2, mongoose 8.9.2, express 4.21.2
│   ├── config/
│   │   ├── db.js                 # MongoDB connection (SSL cert mounted)
│   │   ├── logger.js             # Winston JSON structured logging
│   │   ├── redis.js              # ioredis 172.18.0.1:6379, exponential backoff
│   │   └── s3.js                 # AWS SDK v3, PutObjectCommand, public URLs
│   ├── routes/          (26)     # HTTP route definitions
│   ├── controllers/     (33)     # Request handlers
│   ├── services/        (11)     # Business logic & external integrations
│   ├── models/          (28)     # Mongoose schemas (27 collections)
│   ├── middleware/       (2)     # auth.js (JWT/admin), validate.js (Joi)
│   ├── crons/           (2)     # eventPointsCron, alphaArcadeResolutionCron
│   └── uploads/                  # Persistent file storage (volume mount)
│
├── frontend/                     # React 18 + TypeScript 5 + Vite 5 SPA
│   ├── Dockerfile                # node:18-slim build stage (not in compose)
│   ├── vite.config.ts            # @vitejs/plugin-react
│   ├── tailwind.config.js        # DaisyUI, dark mode class-based
│   ├── src/
│   │   ├── pages/       (12)     # Route targets (stake, farm, nft, swap, etc.)
│   │   ├── components/           # Reusable UI, layout, dashboard components
│   │   ├── Modals/               # 3 creation wizards + dashboard modals
│   │   ├── services/    (14)     # API clients, auth, token discovery, fees
│   │   ├── contracts/            # ARC32 smart contract clients
│   │   ├── context/              # PoolDataContext (selected pool state)
│   │   ├── contexts/             # ThemeContext (dark/light)
│   │   ├── hooks/                # Custom React hooks
│   │   ├── types/                # TypeScript type definitions
│   │   ├── interfaces/           # TypeScript interfaces
│   │   ├── staking_func.ts       # Staking contract interactions (866 lines)
│   │   ├── farming_func.ts       # Farming contract interactions (866 lines)
│   │   ├── nft_staking_func.ts   # NFT staking interactions (579 lines)
│   │   └── adminDashboard/       # Admin pages (users, staking, farming, settings)
│   └── dist/                     # Vite build output → served by nginx
│
├── contracts/                    # Algorand smart contracts (Algopy/PyTeal)
│   ├── fry_staking_v2/
│   │   └── contract.py           # ARC4 staking contract (128-bit math)
│   ├── fry_nft_staking/
│   │   └── contract.py           # ARC4 NFT staking contract (box storage)
│   └── .venv/                    # Python virtual environment
│
├── scripts/                      # Operations utilities
│   ├── create_v2_pools.js
│   ├── refundPhantomClaims.js
│   └── resume_v2_setup.js
│
└── backups/                      # Timestamped backups
```

**Key counts**: 98 backend JS files, 166 API endpoints, 28 Mongoose models, 2 smart contracts, 12 frontend pages, 3 creation wizards, 14 frontend services.

---

## 2. Smart Contract Inventory

### 2A. FryStaking V2 (`/opt/fry-farm/contracts/fry_staking_v2/contract.py`)

**Type**: Algopy ARC4 contract (compiled to TEAL)

**Global State**:
| Field | Type | Purpose |
|-------|------|---------|
| `authority` | Account | Contract admin/creator |
| `stake_token` | UInt64 | ASA ID users stake |
| `reward_token` | UInt64 | ASA ID for rewards |
| `reward_token_amount` | UInt64 | Total reward tokens deposited |
| `total_staked` | UInt64 | Sum of all staked tokens |
| `total_stakers` | UInt64 | Active staker count |
| `rewards_distributed` | UInt64 | Cumulative rewards paid out |
| `stake_start_time` | UInt64 | Pool open timestamp |
| `stake_end_time` | UInt64 | Pool close timestamp |
| `lock_period` | UInt64 | Minimum lock (seconds) |
| `apr` | UInt64 | Annual percentage rate (basis points) |

**Box Storage** (per-user):
- Key: user address (32 bytes)
- Size: 32 bytes (4 × UInt64)
- Fields: `staked_amount`, `stake_time`, `last_claim_time`, `rewards_claimed`

**Methods**:
| Method | Purpose |
|--------|---------|
| `init_staking()` | Deploy pool with tokens, APR, timing |
| `optInAsset()` | Opt contract into stake/reward ASAs |
| `assetReceive()` | Deposit reward tokens into pool |
| `stake()` | User deposits stake tokens → box created/updated |
| `claim()` | Calculate + distribute pending rewards |
| `withdraw()` | Remove staked tokens (after lock period) |

**Reward Formula** (128-bit math to prevent overflow):
```
pending = (staked_amount * apr * elapsed_seconds) / (SECONDS_PER_YEAR * 10000)
```
Where `SECONDS_PER_YEAR = 31,104,000` (360 × 86400) and APR is in basis points.

**Constants**:
- `BOX_SIZE`: 32 bytes
- `DEFAULT_TOKEN`: 735549981 (FRY sentinel for ASA ID 0)

### 2B. FryNftStaking (`/opt/fry-farm/contracts/fry_nft_staking/contract.py`)

**Type**: Algopy ARC4 contract (compiled to TEAL)

**Global State**:
| Field | Type | Purpose |
|-------|------|---------|
| `creator` | Account | Pool creator |
| `collection_creator` | Account | NFT collection creator address |
| `fee_recipient` | Account | Platform fee wallet |
| `reward_token_id` | UInt64 | Reward ASA ID |
| `reward_model` | UInt64 | 0=fixed_rate, 1=proportional, 2=apr |
| `collection_mode` | UInt64 | 0=creator_address, 1=whitelist, 2=both |
| `deposit_fee_bps` | UInt64 | Deposit fee in basis points |
| `withdraw_fee_bps` | UInt64 | Withdrawal fee in basis points |
| `claim_fee_bps` | UInt64 | Claim fee in basis points |
| `end_time` | UInt64 | Pool expiry timestamp |
| `lock_period` | UInt64 | NFT lock duration (seconds) |
| `apr` | UInt64 | APR for apr reward model |
| `value_per_nft` | UInt64 | Fixed value assigned per NFT |

**Box Storage** (per-user):
- Key: user address (32 bytes)
- Size: 832 bytes (4 metadata fields × 8 bytes + 100 NFT slots × 8 bytes)
- Fields: `nft_count`, `stake_time`, `last_claim_time`, `rewards_claimed`, + up to 100 NFT ASA IDs
- `MAX_NFTS`: 100 per user per pool

**Methods**:
| Method | Purpose |
|--------|---------|
| `init_pool()` | Create NFT staking pool |
| `add_to_whitelist()` | Add ASA IDs to collection whitelist |
| `stake_nft()` | Transfer NFT to contract (escrow) |
| `unstake_nft()` | Return NFT to user (after lock) |
| `claim_rewards()` | Calculate + pay rewards |

**Reward Models**:
- **Fixed Rate**: `reward_per_day * nft_count * days_staked`
- **Proportional**: `(user_nfts / total_nfts) * daily_pool_rewards * days`
- **APR**: `(value_per_nft * nft_count * apr * elapsed) / (SECONDS_PER_YEAR * 10000)`

**NFT Escrow Model**: NFTs are transferred to the contract address. The contract holds them and returns them on unstake. This is the ONLY holding pattern — no verified-hold exists.

**Constants**:
- `MAX_NFTS`: 100
- `USER_BOX_SIZE`: 832 bytes
- `SECONDS_PER_DAY`: 86400
- `SECONDS_PER_YEAR`: 31,104,000

---

## 3. API Endpoint Map

### Authentication (`/auth`) — 4 endpoints
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/auth/nonce` | - | Generate nonce for wallet signing |
| POST | `/auth/verify` | - | Verify signed txn → JWT cookie |
| POST | `/auth/logout` | - | Clear auth cookie |
| GET | `/auth/me` | JWT | Check authentication status |

### Staking (`/staking`) — 8 endpoints
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/staking/all` | - | List all staking pools |
| GET | `/staking/contract/:contractId` | - | Pool by contract ID |
| GET | `/staking/creator/:creatorId` | - | Pools by creator wallet |
| GET | `/staking/id/:id` | - | Pool by MongoDB ID |
| POST | `/staking/add` | JWT | Create staking pool |
| DELETE | `/staking/delete/:id` | JWT | Delete pool |
| PUT | `/staking/update/:id` | JWT | Update pool |
| GET | `/staking/:creatorId` | - | Legacy route |

### Farming (`/farming`) — 8 endpoints
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/farming/all` | - | List all farming pools |
| GET | `/farming/appId/:appId` | - | Pool by app ID |
| GET | `/farming/creator/:creatorId` | - | Pools by creator |
| POST | `/farming/add` | JWT | Create farming pool |
| PUT | `/farming/update/:appId` | JWT | Update pool |
| DELETE | `/farming/delete/:id` | JWT | Delete pool |
| GET | `/farming/:id` | - | Legacy (appId or creator) |

### NFT Staking (`/nftstaking`) — 13 endpoints
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/nftstaking/all` | - | List all NFT staking pools |
| GET | `/nftstaking/pool/:appId` | - | Pool by app ID |
| GET | `/nftstaking/creator/:wallet` | - | Pools by creator |
| POST | `/nftstaking/add` | JWT | Create NFT pool |
| PUT | `/nftstaking/update/:appId` | JWT | Update pool |
| POST | `/nftstaking/stake` | JWT | Stake NFT |
| GET | `/nftstaking/stakes/wallet/:wallet` | - | Staked NFTs by wallet |
| GET | `/nftstaking/stakes/pool/:appId` | - | NFTs in pool |
| POST | `/nftstaking/unstake` | JWT | Unstake NFT |
| POST | `/nftstaking/claim` | JWT | Claim rewards |
| GET | `/nftstaking/claims/:wallet` | - | Claim history |
| GET | `/nftstaking/nftprice/:asaId` | - | NFT price |

### Alpha Arcade / Prediction Markets (`/prediction-lp`) — 14+ endpoints
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/prediction-lp/stats` | - | Platform stats |
| GET | `/prediction-lp/markets/rewards` | - | Reward markets |
| GET | `/prediction-lp/markets/:marketAppId` | - | Market detail |
| GET | `/prediction-lp/markets` | - | List markets |
| GET | `/prediction-lp/orderbook/:marketAppId` | - | Orderbook |
| GET | `/prediction-lp/pools` | - | LP pools |
| GET | `/prediction-lp/pool/:poolId` | - | Pool detail |
| POST | `/prediction-lp/pool/create` | Admin | Create pool |
| PUT | `/prediction-lp/pool/update/:poolId` | Admin | Update pool |
| POST | `/prediction-lp/build-deposit` | JWT | Build deposit txn |
| POST | `/prediction-lp/build-withdraw` | JWT | Build withdrawal txn |
| POST | `/prediction-lp/record-deposit` | JWT | Record deposit |
| POST | `/prediction-lp/record-withdraw` | JWT | Record withdrawal |
| GET | `/prediction-lp/positions/:wallet` | - | User positions |
| GET | `/prediction-lp/position/:wallet/:poolId` | - | Specific position |
| POST | `/prediction-lp/admin/check-resolutions` | Admin | Check resolutions |
| GET | `/prediction-lp/admin/platform-stats` | Admin | Admin stats |

### Events (`/events`) — 14+ endpoints
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/events/active` | - | Active events |
| GET | `/events/` | - | All events |
| GET | `/events/:id` | - | Event detail |
| GET | `/events/:id/leaderboard` | - | Leaderboard |
| GET | `/events/:id/points/:wallet` | - | User points |
| POST | `/events/` | Admin | Create event |
| PUT | `/events/:id` | Admin | Update event |
| DELETE | `/events/:id` | Admin | Delete event |
| POST | `/events/:id/activate` | Admin | Activate |
| POST | `/events/:id/end` | Admin | End event |
| POST | `/events/:id/cancel` | Admin | Cancel event |
| POST | `/events/:id/challenges` | Admin | Add challenge |
| PUT | `/events/challenges/:challengeId` | Admin | Update challenge |
| DELETE | `/events/challenges/:challengeId` | Admin | Remove challenge |
| POST | `/events/:id/calculate-points` | Admin | Trigger point calc |
| POST | `/events/:id/airdrop` | Admin | Trigger airdrop |
| POST | `/events/:id/banner` | Admin | Upload banner |

### Community Events (`/community-events`) — 12+ endpoints
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/community-events/` | - | Public events |
| GET | `/community-events/mine` | JWT | User's events |
| GET | `/community-events/:id` | - | Event detail |
| GET | `/community-events/:id/leaderboard` | - | Leaderboard |
| GET | `/community-events/:id/points/:wallet` | - | User points |
| POST | `/community-events/` | JWT | Create event |
| PUT | `/community-events/:id` | JWT | Update event |
| POST | `/community-events/:id/fund` | JWT | Build funding txn |
| POST | `/community-events/:id/confirm-funding` | JWT | Confirm funding |
| POST | `/community-events/:id/cancel` | JWT | Cancel event |
| POST | `/community-events/:id/challenges` | JWT | Add challenge |
| PUT | `/community-events/challenges/:challengeId` | JWT | Update challenge |
| DELETE | `/community-events/challenges/:challengeId` | JWT | Remove challenge |
| POST | `/community-events/:id/banner` | JWT | Upload banner |
| PUT | `/community-events/:id/hide` | Admin | Hide event |
| POST | `/community-events/:id/admin-cancel` | Admin | Admin cancel |

### Rewards (`/rewards`) — 8+ endpoints
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/rewards/status?wallet=` | - | Wallet reward status |
| GET | `/rewards/config` | - | Rewards config |
| GET | `/rewards/leaderboard` | - | Claims leaderboard |
| POST | `/rewards/claim` | JWT | Claim daily reward |
| PUT | `/rewards/config` | RewardsAdmin | Update config |
| POST | `/rewards/admin/pause` | Admin | Pause rewards |
| POST | `/rewards/admin/resume` | Admin | Resume rewards |
| POST | `/rewards/admin/ban` | Admin | Ban wallet |
| POST | `/rewards/admin/unban` | Admin | Unban wallet |

### Other Route Groups (1-6 endpoints each)
| Route | Endpoints | Purpose |
|-------|-----------|---------|
| `/token` | 5 | Token CRUD (list, search, add, delete, update) |
| `/tokens` | 1 | Token discovery with search |
| `/swap` | 6 | Swap proxy (Folks, Vestige, Deflex quotes + txns) |
| `/withdraw` | 1 | Staking withdrawal |
| `/farmingwithdraw` | 1 | Farming withdrawal |
| `/claimreward` | 1 | Claim staking rewards |
| `/claimfarmrewards` | 1 | Claim farming rewards |
| `/stakerdata` | 1 | Staker data by creator |
| `/yieldfarming` | 1 | Yield farming data by creator |
| `/stakingtoken` | 1 | Staking token data |
| `/stakingfarmingtoken` | 1 | Farming token data |
| `/swaphistory` | 1 | User swap history |
| `/user` | 1 | User profile |
| `/gasfee` | 1 | Gas fee estimate by app ID |
| `/feeconfig` | 1 | Fee configuration |

### Rate Limiting
| Limiter | Limit | Window | Applied To |
|---------|-------|--------|------------|
| Global | 500 req | 15 min | All routes |
| Read | 300 req | 15 min | GET endpoints (most routes) |
| Write | 20 req | 15 min | `/withdraw`, `/farmingwithdraw` |
| Auth | 200 req | 5 min | `/auth` |

---

## 4. Service Layer Map

### algodService.js — Algorand Node Fallback
- **3 fallback nodes**: ATLAS00 (local `192.168.9.2:4190`), Nodely, Algonode
- **Circuit breaker per node**: max 3 failures → node marked offline, 30s probe interval
- **Exports**: `withFallback(operation)` wraps any algod call with automatic failover, `getAlgodClient()`
- **Auto-recovery**: probes offline nodes periodically, restores on success

### antiSybilService.js — Anti-Sybil Detection (15.7KB)
- **On-chain scoring**: wallet age (created-at-round via indexer), transaction activity (up to 500 txns analyzed), DeFi participation (Tinyman, Folks, Pact, Humble app IDs)
- **Balance checks**: min ALGO balance, min FRY balance (configurable in rewardsConfig)
- **Trust tiers (0–3)**: score thresholds configurable, affects reward multipliers and circuit breaker access
- **Caching**: 10min wallet info TTL, 30min on-chain score TTL
- **Active position checking**: queries staking/farming/NFT models for wallet positions

### circuitBreakerService.js — Claim Rate Control
- **4-level state machine**: Green → Yellow → Orange → Red
- **Thresholds**: hourly & daily counters, auto-reset
- **Tier gating by level**: Yellow = Tier 0 gets 10% pass, Orange = only Tier 2–3, Red = all paused
- **Multipliers**: Yellow 1.5×, Orange 2.0×, Red 3.0× baseline
- **Baseline**: configurable claims/hour (default 30), daily cap 500
- **Alert cooldowns**: Yellow 5min, Orange 1min, Red immediate
- **Manual pause override** with Discord webhook alert

### priceService.js — Asset Price Oracle
- **Primary**: Vestige (`api.vestigelabs.org`)
- **Fallbacks**: Tinyman, Pact
- **Consensus**: median-based outlier filtering (50% deviation threshold), conservative lower price if divergence >50%
- **ALGO/USD**: Binance (3 endpoint fallbacks: api.binance.com, api1.binance.com, data-api.binance.vision)
- **Manual overrides**: per-ASA price overrides in feeConfig
- **Cache TTL**: 60 seconds

### eventPointsService.js — Challenge Point Calculation (13.5KB)
- **Challenge types**: staking volume, farming volume, NFT staking, swap history, daily claim count
- **Point formula**: action_value × pointsMultiplier (per challenge)
- **USD valuation**: converts token amounts via priceService
- **Aggregation**: per-wallet across all challenges, rank calculation after aggregation
- **Filtering**: only active + not-ended events processed

### airdropService.js — Token Distribution
- **Modes**: proportional (by points share) or tiered (by rank brackets)
- **Qualification**: min points threshold filtering
- **Execution**: ASA transfers via Algorand from treasury wallet
- **Treasury signing**: rekeyed account (REWARD_MNEMONIC + REWARD_REKEY)
- **Tracking**: tx ID, status (pending/sent/failed) per recipient

### nftPriceOracleService.js — NFT Pricing
- **4-step fallback**: DappRadar (1hr cache, if API key) → Pera API (1hr, free) → Indexer last-sale (6hr) → creator-defined fallback
- **USD conversion**: converts NFT USD price to reward token amount

### alphaArcadeService.js — Prediction Markets
- **Alpha Arcade SDK**: `@alpha-arcade/sdk v0.3.0`
- **Matcher app ID**: 3078581851
- **Read-only client**: no-op signer (never signs transactions)
- **Indexer fallback**: Nodely + Algonode
- **USDC ASA**: 31566704, default spread 50 bps

### communityEventService.js — Community Events
- Event funding, confirmation, cancellation flows
- Challenge management (add/update/remove)

### autoScheduleService.js — Recurring Events
- Templates for daily, weekly, biweekly, monthly recurrence
- Auto-creates events from templates

### discordAlphaArcadeNotifier.js — Market Notifications
- Resolution warnings at 48hr, 24hr, 6hr marks
- Position resolved notifications
- Cron summary reports via Discord webhook

---

## 5. Database Schema Map

### Staking & Farming Pools

**`stakings`** — Token staking pool configuration
| Field | Type | Purpose |
|-------|------|---------|
| `contractId` | String | Algorand app ID |
| `creatorId` | String | Creator wallet address |
| `stakeToken` | Object | { id, name, symbol, image } |
| `rewardToken` | Object | { id, name, symbol, image } |
| `apr` | Number | Annual percentage rate |
| `duration` | Number | Pool duration (days) |
| `lockPeriod` | Number | Lock period (days) |
| `startDate` | Date | Pool start |
| `endDate` | Date | Pool end |
| `totalStaked` | Number | Current TVL |
| `totalStakers` | Number | Active staker count |
| `rewardAmount` | Number | Total rewards deposited |
| `isGated` | Boolean | NFT gating enabled |
| `gateConfig` | Object | { nftAsaId, minCount } |
| `status` | String | active/ended/paused |

**`farmingPools`** — LP farming pool configuration
| Field | Type | Purpose |
|-------|------|---------|
| `appId` | String | Algorand app ID |
| `creatorId` | String | Creator wallet |
| `stakeToken` | Object | LP token metadata |
| `rewardToken` | Object | Reward token metadata |
| `dex` | String | Source DEX (Tinyman/Pact) |
| `poolType` | String | LP pool type |
| `apr` | Number | Annual percentage rate |
| `entryFee` | Number | Entry fee percentage |
| `duration` | Number | Pool duration |
| `lockPeriod` | Number | Lock period |
| `distributionRate` | Number | % of daily rewards |
| `distributionSchedule` | String | daily/weekly/monthly/custom |
| `isGated` | Boolean | NFT gating |
| `gateConfig` | Object | { nftAsaId, minCount } |

**`nftStakingPools`** — NFT staking pool configuration
| Field | Type | Purpose |
|-------|------|---------|
| `appId` | String | Algorand app ID |
| `creator` | String | Creator wallet |
| `collectionCreator` | String | NFT collection creator address |
| `rewardTokenId` | Number | Reward ASA ID |
| `rewardModel` | String | fixed_rate/proportional/apr |
| `collectionMode` | String | creator_address/whitelist/both |
| `depositFeeBps` | Number | Deposit fee (basis points) |
| `withdrawFeeBps` | Number | Withdraw fee (basis points) |
| `claimFeeBps` | Number | Claim fee (basis points) |
| `endTime` | Date | Pool expiry |
| `lockPeriod` | Number | Lock duration (seconds) |
| `apr` | Number | For APR reward model |
| `valuePerNft` | Number | Fixed value per NFT |
| `whitelist` | [Number] | Whitelisted ASA IDs |

### User Activity Records

**`stakingTokens`** — User staking deposits
| Field | Type | Purpose |
|-------|------|---------|
| `wallet` | String | User wallet |
| `contractId` | String | Pool app ID |
| `amount` | Number | Staked amount |
| `stakeTime` | Date | Deposit timestamp |
| `lockExpiry` | Date | Lock end time |

**`stakingFarmingTokens`** — User farming deposits (same structure as staking)

**`nftStakedTokens`** — Individual staked NFT records
| Field | Type | Purpose |
|-------|------|---------|
| `wallet` | String | Owner wallet |
| `poolAppId` | String | NFT pool app ID |
| `nftAsaId` | Number | NFT ASA ID |
| `stakeTime` | Date | When staked |
| `lockExpiry` | Date | Lock end |

### Claims & Rewards

**`claimRewards`** — Staking reward claims
| Field | Type | Purpose |
|-------|------|---------|
| `wallet` | String | Claimant |
| `contractId` | String | Pool |
| `amount` | Number | Reward amount |
| `txId` | String | Algorand txn ID |
| `claimTime` | Date | Timestamp |

**`claimFarmRewards`** — Farming reward claims (same structure)

**`nftStakingClaims`** — NFT staking claims (same structure + poolAppId)

**`dailyClaims`** — Daily FRY reward claims
| Field | Type | Purpose |
|-------|------|---------|
| `wallet` | String | Claimant |
| `amount` | Number | FRY claimed |
| `trustTier` | Number | Tier at claim time |
| `claimTime` | Date | Timestamp |
| `txId` | String | Transaction ID |
| `fee` | Number | Platform fee |
| `ip` | String | Request IP (rate limiting) |
| `fingerprint` | String | Device fingerprint |

**`walletStreaks`** — Daily reward streaks
| Field | Type | Purpose |
|-------|------|---------|
| `wallet` | String | User wallet |
| `currentStreak` | Number | Consecutive days |
| `totalClaimed` | Number | Lifetime claims |
| `trustTier` | Number | Current tier |
| `lastClaimTime` | Date | Last claim timestamp |

### Configuration

**`rewardsConfig`** — System-wide reward configuration (singleton)
| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `rewardSchedule` | [Number] | [100..1500] | 7-tier daily amounts |
| `minAlgoBalance` | Number | 5 | Min ALGO for eligibility |
| `minFryBalance` | Number | 100 | Min FRY for eligibility |
| `minWalletAge` | Number | 7 | Min days since creation |
| `trustTierThresholds` | Object | configurable | Score → tier mapping |
| `trustTierMultipliers` | Object | configurable | Tier → reward multiplier |
| `claimsPerIpLimit` | Number | 3 | Max claims/day per IP |
| `claimsPerFingerprintLimit` | Number | 3 | Max claims/day per device |
| `streakResetHours` | Number | 48 | Hours before streak resets |
| `cooldownHours` | Number | 20 | Min hours between claims |
| `baselineClaimsPerHour` | Number | 30 | Circuit breaker baseline |
| `dailyClaimCap` | Number | 500 | Max claims/day platform-wide |
| `treasuryMinBalance` | Number | 10000 | Min FRY in treasury |
| `isPaused` | Boolean | false | Manual pause flag |
| `bannedWallets` | [String] | [] | Blocked addresses |

**`feeConfig`** — Fee structure (singleton)
| Fee Type | Rate | Notes |
|----------|------|-------|
| Staking deposit | 0.5% | |
| Staking withdraw | 0.25% | |
| Staking claim | 8% | |
| Farming deposit | 0.5% | |
| Farming withdraw | 0.25% | |
| Farming claim | 8% | |
| Alpha Arcade deposit | 0.5% | |
| Alpha Arcade withdraw | 0.25% | |
| Swap | 0.1% | |
| Daily claim | 5% | |
| Pool creation | 0.5% or $1 USD | Whichever is greater |
| Community event | 2% | Of funded amount |
| **Revenue split** | | Stakers 60%, Treasury 25%, Creator 10%, Compound 5% |
| Manual price overrides | per-ASA | For fee calculation |

**`circuitBreakerState`** — Runtime state
| Field | Type | Purpose |
|-------|------|---------|
| `level` | String | green/yellow/orange/red |
| `hourlyCount` | Number | Claims this hour |
| `dailyCount` | Number | Claims today |
| `lastReset` | Date | Hour/day reset times |
| `isPaused` | Boolean | Manual override |

### Events & Gamification

**`events`** — Event definitions
| Field | Type | Purpose |
|-------|------|---------|
| `title` | String | Event name |
| `description` | String | Event description |
| `status` | String | draft/scheduled/active/ended/cancelled |
| `startDate` | Date | Start time |
| `endDate` | Date | End time |
| `banner` | String | S3 URL |
| `airdropDistribution` | String | proportional/tiered |
| `airdropConfig` | Object | Tier brackets, amounts |
| `autoSchedule` | Object | Recurrence template |
| `creatorWallet` | String | For community events |
| `fundingStatus` | String | pending/funded/cancelled |
| `rewardAsa` | Number | Community event reward token |
| `challenges` | [ObjectId] | Linked challenge IDs |

**`challenges`** — Challenge definitions
| Field | Type | Purpose |
|-------|------|---------|
| `eventId` | ObjectId | Parent event |
| `type` | String | staking_volume/farming_volume/nft_staking/swap_history/daily_claim |
| `description` | String | Challenge description |
| `pointsMultiplier` | Number | Points per unit |
| `config` | Object | { minUsd, poolFilter, etc. } |

**`eventPoints`** — User points per event
| Field | Type | Purpose |
|-------|------|---------|
| `wallet` | String | User wallet |
| `eventId` | ObjectId | Event |
| `totalPoints` | Number | Aggregated score |
| `challengeBreakdown` | Object | Points per challenge |
| `rank` | Number | Leaderboard position |
| `airdropAmount` | Number | Calculated reward |
| `airdropTxId` | String | Distribution tx |
| `airdropStatus` | String | pending/sent/failed |

### Prediction Markets

**`alphaArcadePools`** — LP pool configuration
| Field | Type | Purpose |
|-------|------|---------|
| `marketAppId` | Number | Alpha Arcade market |
| `matcherAppId` | Number | Matcher app ID |
| `marketQuestion` | String | Market question text |
| `marketCategory` | String | Category tag |
| `yesTokenId` | Number | YES token ASA |
| `noTokenId` | Number | NO token ASA |
| `usdcAsaId` | Number | USDC ASA (31566704) |
| `resolutionTime` | Date | Market resolution time |
| `spreadBps` | Number | Spread in basis points |
| `status` | String | active/resolved |
| `outcome` | String | yes/no/null |

**`alphaArcadePositions`** — User LP positions
| Field | Type | Purpose |
|-------|------|---------|
| `wallet` | String | User wallet |
| `poolId` | ObjectId | LP pool ref |
| `status` | String | active/pending_withdrawal/withdrawing/withdrawn/auto_withdrawn/resolved |
| `usdcDeposited` | Number | USDC amount |
| `yesEscrowAppId` | Number | YES escrow |
| `noEscrowAppId` | Number | NO escrow |
| `entryMidPrice` | Number | Entry price |
| `spreadUsed` | Number | Spread at entry |
| `warningsSent` | Object | { 48hr, 24hr, 6hr } booleans |

### Other Collections

**`tokens`** — Token metadata: id, name, symbol, image, verified status
**`users`** — User profiles: wallet, settings, admin flag
**`userSwapHistory`** — Swap transaction log: wallet, fromToken, toToken, amount, txId, timestamp
**`gasFees`** — Gas fee tracking by app ID
**`withdraws`** — Staking withdrawal records
**`withdrawFarmingTokens`** — Farming withdrawal records

---

## 6. Frontend Component Map

### Pages (12)
| Page | File | Purpose |
|------|------|---------|
| Swap | `pages/swap.tsx` | Token swaps (Folks, Vestige, Deflex) |
| Staking | `pages/stake.tsx` | Staking pool listing + interaction |
| Farming | `pages/farm.tsx` | LP farming pools |
| NFT Staking | `pages/nftStake.tsx` | NFT staking pools |
| NFT Pool Stats | `pages/nftPoolStats.tsx` | NFT pool analytics |
| Staking Stats | `pages/stakePoolStats.tsx` | Staking pool analytics |
| Farm Stats | `pages/farmPoolStats.tsx` | Farming pool analytics |
| Profile | `pages/profile.tsx` | User dashboard (positions overview) |
| Alpha Arcade | `pages/alphaArcade.tsx` | Prediction markets LP |
| Transaction History | `pages/transactionHistory.tsx` | User tx log |
| Events | `pages/events.tsx` | Events + leaderboards |
| Admin Login | `pages/adminLogin.tsx` | Admin authentication |

### Creation Wizards (3)

**CreateStakeWizard** (`Modals/website/CreateStakeWizard.tsx`, 765 lines) — 5 steps:
1. **Stake Token Selection** — TokenSelector component, ASA search
2. **Reward Token Selection** — TokenSelector component
3. **Timing** — DatePicker (future only), duration presets (7/14/30/60/90 days + custom), lock presets (none/7/14/30 + custom)
4. **APR & Rewards** — APR presets (10/25/50/100/200/500%), TVL estimates ($1K–$100K), auto reward calculation: `(apr/100) × (tvl/price) × (duration/360)`, manual override, optional NFT gating (NftGateConfig)
5. **Review & Deploy** — Summary, wallet check, deploy → `initStaking()` + backend POST

**CreateFarmWizard** (`Modals/website/CreateFarmWizard.tsx`, 915 lines) — 5 steps:
1. **LP Token Selection** — LPTokenSelector (Tinyman/Pact discovery), paste ASA ID
2. **Reward Token Selection** — TokenSelector
3. **Timing** — Same as staking wizard
4. **APR & Rewards** — Same as staking + advanced mode: distribution rate (1–100%), schedule (daily/weekly/monthly/custom), NFT gating
5. **Review & Deploy** — Deploy → `initFarming()` + backend POST

**CreateNftPoolWizard** (`Modals/website/CreateNftPoolWizard.tsx`, ~1000+ lines) — 6 steps:
1. **NFT Collection** — Search by ASA ID or name, collection mode (creator/whitelist/both)
2. **Reward Token** — TokenSelector
3. **Reward Model** — Fixed rate / proportional / APR selection
4. **Timing & Lock** — End time, lock period
5. **Fees** — Deposit/withdraw/claim fees in basis points
6. **Review & Deploy** — Deploy → `createNftPool()` + `depositRewards()` + backend POST

### Shared Components (15+)
| Component | Purpose |
|-----------|---------|
| `TokenSelector` | Dropdown token picker with search, cache, debounce (400ms) |
| `LPTokenSelector` | LP token discovery from Tinyman/Pact DEXs |
| `TokenImage` | Token icon with fallback |
| `NftGateConfig` | NFT gating UI (ASA ID, min count) |
| `APRCalculator` | APR calculation helper |
| `StakeModal` | Modal for staking actions |
| `WithdrawModal` | Modal for withdrawals |
| `FeeConfirmation` | Fee display and confirmation dialog |
| `FryFeeBanner` | Fee information banner |
| `BetaBanner` | Beta/notice banner |
| `CandleStickChart` | Chart visualization |
| `ThemeToggle` | Dark/light mode toggle |
| `Button` | Custom button |
| `Input` | Custom input field |
| `PageBg` | Page background |

### Frontend Services (14)
| Service | Purpose |
|---------|---------|
| `apiClient.ts` | `authAxios` with cookie auth, 401 auto-handling |
| `AuthService.ts` | Nonce → zero-ALGO self-pay sign → verify → JWT cookie |
| `TokenDiscoveryService.ts` | Token/LP search, in-memory cache (5min TTL) |
| `FeeService.ts` | Fee config fetch, fee calculation by action type |
| `nftStakingApi.ts` | NFT pool CRUD operations |
| `nftCollectionService.ts` | Collection metadata lookup |
| `rewardsApi.ts` | Daily rewards status/claiming |
| `TokenService.ts` | Token info/metadata |
| `PriceService.ts` | Token price fetching |
| `ZapService.ts` | Tinyman liquidity zapping |
| `alphaArcadeApi.ts` | Prediction market operations |
| `eventService.ts` | Event CRUD |
| `nfdService.ts` | Algorand Name Service (NFD) lookups |
| `fingerprintService.ts` | Device fingerprinting (anti-sybil) |

### Admin Dashboard
| Page | Purpose |
|------|---------|
| Dashboard Home | Overview with staking/farming pool lists |
| Users | User management table |
| User Detail | Individual user with staking/farming tabs |
| Staking Management | Pool CRUD |
| Staking Statistics | Analytics (AreaChart, BarGraph) |
| Farming Management | Pool CRUD |
| Farming Statistics | Analytics |
| Settings | Profile + general configuration |

### State Management
- **PoolDataContext** — selected pool TVL, APR, staked amounts, rewards, end time
- **ThemeContext** — dark/light mode, persists to localStorage (`fry-theme`), Ant Design ConfigProvider
- **useAuth hook** — auth status, admin role, wallet address via AuthService singleton
- No Redux/Zustand — all Context API + local state

### Wallet Integration
- **@txnlab/use-wallet 2.4.0** — multi-wallet hook
- **Supported wallets**: Defly, Pera, Daffi, Exodus, Lute, KMD (dev)
- **Auth flow**: nonce → zero-ALGO self-payment with nonce in note → sign → base64 encode → verify → JWT cookie

---

## 7. Pool Creation Flow

```
User clicks "Create Pool" → Wizard opens (5-6 steps)
                                    │
Step 1-4: Configure pool parameters │
                                    │
Step 5/6: Review & Deploy ──────────┤
                                    │
    ┌───────────────────────────────┘
    │
    ▼
1. Fee Payment
   └─ Calculate fee: max(0.5% of reward tokens, $1 USD)
   └─ Build ALGO/ASA transfer to FEE_RECIPIENT
   └─ User signs via wallet
    │
    ▼
2. Smart Contract Deployment
   └─ Build app create transaction (compiled TEAL)
   └─ init_staking() / init_pool() ABI call
   └─ optInAsset() for stake + reward tokens
   └─ assetReceive() to deposit reward tokens
   └─ User signs all grouped transactions
    │
    ▼
3. Backend Registration
   └─ POST /staking/add or /farming/add or /nftstaking/add
   └─ Save pool config to MongoDB (contractId/appId, creator, tokens, timing, fees)
   └─ Pool appears in listing immediately
```

**Frontend files involved**:
- `staking_func.ts` → `initStaking()` (866 lines)
- `farming_func.ts` → `initFarming()` (866 lines)
- `nft_staking_func.ts` → `createNftPool()` + `depositRewards()` (579 lines)

---

## 8. Staking Flow

### Deposit
```
User selects pool → clicks Stake → StakeModal opens
    │
    ▼
1. Validate eligibility
   └─ Check wallet connected
   └─ Check NFT gate (if isGated: verify wallet holds required NFT ASA)
   └─ Check token balance ≥ stake amount
    │
    ▼
2. Build transaction group
   └─ Fee transfer: deposit_fee × amount → FEE_RECIPIENT
   └─ Asset transfer: stake tokens → contract address
   └─ ABI call: stake(amount) → creates/updates user box
    │
    ▼
3. User signs → submit → poll for confirmation
    │
    ▼
4. Backend record
   └─ POST /stakingtoken or staker data update
   └─ Updates pool totalStaked, totalStakers
```

### Claim
```
User clicks Claim on pool card
    │
    ▼
1. ABI call: claim() on contract
   └─ Contract calculates: (staked × apr × elapsed) / (SECONDS_PER_YEAR × 10000)
   └─ Subtracts claim fee (8%)
   └─ Transfers reward tokens to user
    │
    ▼
2. Backend record: POST /claimreward
```

### Withdraw
```
User clicks Withdraw
    │
    ▼
1. Check lock period expired (stake_time + lock_period < now)
    │
    ▼
2. ABI call: withdraw() on contract
   └─ Subtracts withdraw fee (0.25%)
   └─ Returns staked tokens
   └─ Deletes user box
    │
    ▼
3. Backend record: POST /withdraw
   └─ Updates pool totalStaked, totalStakers
```

---

## 9. NFT Handling Patterns

### Current Model: Escrow Only

All NFT staking uses **escrow transfer** — NFTs move from user wallet to contract address:

```
User Wallet ──[asset transfer]──► Contract Address
                                    │
                          Box storage tracks:
                          - nft_count
                          - nft_ids[0..99]
                          - stake_time
                          - last_claim_time
                                    │
                          On unstake:
Contract Address ──[asset transfer]──► User Wallet
```

### Collection Verification Modes
1. **creator_address** — NFT's creator address must match `collection_creator` in pool config
2. **whitelist** — NFT ASA ID must be in pool's whitelist array
3. **both** — Either condition satisfies

### Box Storage Layout (per user, 832 bytes)
```
Bytes 0-7:   nft_count (UInt64)
Bytes 8-15:  stake_time (UInt64)
Bytes 16-23: last_claim_time (UInt64)
Bytes 24-31: rewards_claimed (UInt64)
Bytes 32-831: nft_ids[100] (100 × UInt64, zero-padded)
```

### NFT Pricing (for APR model)
4-step fallback chain:
1. DappRadar API (1hr cache) — requires `DAPPRADAR_API_KEY`
2. Pera API (1hr cache) — free, no auth
3. Algorand indexer last-sale price (6hr cache)
4. Creator-defined `valuePerNft` fallback from pool config

### Key Gap for DePIN
No **verified-hold** pattern exists. All NFT staking requires physical transfer to contract. DePIN device NFTs that must remain in user wallets need either:
- A new contract subroutine that checks holding via Indexer
- A background worker that periodically verifies wallet still holds NFTs
- An oracle-based approach feeding holding status on-chain

---

## 10. Background Job Patterns

### eventPointsCron.js — Every 15 minutes
```
1. Auto-activate scheduled events (startDate ≤ now, status=scheduled → active)
2. Auto-end active events (endDate ≤ now, status=active → ended)
3. Trigger airdrop for ended events (if not already distributed)
   └─ airdropService: calculate amounts → send ASA transfers → record tx IDs
4. Calculate points for all active events
   └─ eventPointsService: iterate challenges → query models → aggregate → rank
5. Check auto-schedule templates → create next recurring event
```

### alphaArcadeResolutionCron.js — Every 15 minutes
```
1. Query all active positions with approaching resolution
2. Send warnings at 48hr, 24hr, 6hr marks (Discord webhook)
   └─ Max 10 notifications per cron run
3. At 6hr mark: transition position → pending_withdrawal
4. After resolution: mark position → resolved
5. Send cron summary report (Discord)
```

### Pattern for DePIN Extension
New cron needed for verified-hold checking:
- Query all active DePIN pools
- For each staker: check wallet still holds required NFTs via Indexer
- If NFT transferred away: mark position invalid, stop reward accrual
- Suggested interval: every 15 minutes (matches existing patterns)

---

## 11. Reward Calculation Mechanics

### Token Staking (V2 Contract)
```
pending_reward = (staked_amount × apr × elapsed_seconds) / (SECONDS_PER_YEAR × 10000)
```
- `SECONDS_PER_YEAR`: 31,104,000 (360 × 86400 — banker's year)
- `apr`: in basis points (e.g., 1000 = 10%)
- 128-bit math (UInt128) prevents overflow for large stake × apr products
- Claim resets `last_claim_time` to current timestamp

### LP Farming
Same formula as token staking, plus optional:
- `distributionRate`: % of daily rewards actually distributed (rest reserves)
- `distributionSchedule`: daily/weekly/monthly/custom frequency

### NFT Staking — 3 Models

**Fixed Rate**:
```
reward = reward_per_day × nft_count × days_staked
```

**Proportional**:
```
reward = (user_nft_count / total_pool_nfts) × daily_pool_reward × days_staked
```

**APR**:
```
reward = (value_per_nft × nft_count × apr × elapsed_seconds) / (SECONDS_PER_YEAR × 10000)
```
Where `value_per_nft` comes from NFT price oracle or creator config.

### Fee Deductions
All rewards are subject to claim fee (default 8%) before distribution:
```
net_reward = gross_reward × (1 - claim_fee_bps / 10000)
fee_amount = gross_reward × (claim_fee_bps / 10000)
```
Revenue split: Stakers 60%, Treasury 25%, Pool Creator 10%, Compound 5%.

### Daily FRY Rewards
7-tier schedule (day 1: 100 FRY → day 7: 1500 FRY), modified by:
- Trust tier multiplier (Tier 0 = 1×, Tier 1 = 1.25×, Tier 2 = 1.5×, Tier 3 = 2×)
- Streak bonus (consecutive daily claims)
- Circuit breaker state (may reduce or block claims)

---

## 12. Existing Multiplier/Requirement Patterns

### Anti-Sybil Trust Tiers (0–3)
| Tier | Requirements | Effect |
|------|-------------|--------|
| 0 | New wallet, low activity | Base rewards, Yellow = 10% pass rate |
| 1 | Min ALGO balance, some txns | 1.25× daily rewards |
| 2 | Active DeFi participation, FRY holdings | 1.5× rewards, Orange access |
| 3 | Long history, high activity, staking positions | 2× rewards, full access |

**Scoring factors** (antiSybilService):
- Wallet age (created-at-round from indexer)
- Transaction count (up to 500 analyzed)
- DeFi participation (Tinyman, Folks, Pact, Humble app IDs detected)
- ALGO balance (min threshold, configurable)
- FRY balance (min threshold, configurable)
- Active staking/farming/NFT positions

### Event Points Multiplier
Each challenge has a `pointsMultiplier` field:
```
challenge_points = action_value_in_usd × pointsMultiplier
```
E.g., staking $100 in a challenge with multiplier 2.0 = 200 points.

### NFT Gating (Simple)
Staking/farming pools can set:
```json
{
  "isGated": true,
  "gateConfig": {
    "nftAsaId": 123456789,
    "minCount": 1
  }
}
```
Frontend checks: does wallet hold ≥ `minCount` of `nftAsaId`? If not, stake button disabled.

### DePIN Extension Points
The anti-sybil service's pattern of checking multiple on-chain conditions (balance + positions + activity) is the natural place to add configurable DePIN eligibility requirements:
- Token balance checks → already exist
- Staking position checks → already exist
- NFT holding checks → exists as simple gate, needs compound logic
- Combined requirements (A AND B AND C) → needs new composition layer

---

## 13. Existing Notification Patterns

### Discord Webhooks Only
| Source | Webhook | Events |
|--------|---------|--------|
| `circuitBreakerService.js` | `DISCORD_BUG_WEBHOOK_URL` | State transitions (Yellow/Orange/Red), manual pauses |
| `discordAlphaArcadeNotifier.js` | Same webhook | Market resolution warnings (48/24/6hr), position resolved, cron summaries |

### No In-App Notifications
- No notification collection in MongoDB
- No notification API endpoints
- No notification components in frontend
- No WebSocket/SSE for real-time updates
- No email integration

### What Must Be Built for DePIN
1. **`notifications` collection** — { wallet, type, title, message, read, createdAt }
2. **Notification API** — GET /notifications/:wallet, PUT /notifications/:id/read
3. **Frontend component** — notification bell/dropdown in navbar
4. **Pool announcement system** — creator → all stakers broadcast
5. Optional: WebSocket for real-time push (or polling)

---

## 14. Key Patterns to Replicate

### Naming Conventions
- **Routes**: `/resource` (plural noun), e.g., `/staking`, `/events`, `/nftstaking`
- **Controllers**: `resourceController.js`, exports named functions
- **Services**: `resourceService.js`, exports named functions or class instances
- **Models**: `resourceSchema.js`, exports Mongoose model
- **Frontend services**: `ResourceService.ts` or `resourceApi.ts`
- **Frontend types**: `types/resource.ts`

### Authentication Pattern
```javascript
// middleware/auth.js
const requireAuth = (req, res, next) => {
  // Read JWT from HttpOnly cookie (primary) or Authorization: Bearer header
  // Verify with JWT_SECRET
  // Attach req.user = { wallet }
};
const requireAdmin = async (req, res, next) => {
  // Check ADMIN_WALLETS env var or DB admin list
};
```

### Transaction Construction Pattern
```javascript
// Frontend: staking_func.ts pattern
async function initStaking(params, signer, activeAddress) {
  // 1. Build transaction group (fee + contract calls)
  // 2. Sign all via wallet signer
  // 3. Submit to algod
  // 4. Wait for confirmation
  // 5. Return app ID / tx IDs
}
```

### Error Handling Pattern
```javascript
// Controllers: try-catch → 500 with logger
try {
  const result = await service.doThing(req.body);
  res.status(200).json(result);
} catch (error) {
  logger.error('Operation failed', { error: error.message, wallet: req.user?.wallet });
  res.status(500).json({ error: 'Internal server error' });
}
```

### Validation Pattern
```javascript
// middleware/validate.js — Joi schemas
const createPoolSchema = Joi.object({
  stakeToken: Joi.object({ id: Joi.number().required(), name: Joi.string() }).required(),
  rewardToken: Joi.object({ id: Joi.number().required(), name: Joi.string() }).required(),
  apr: Joi.number().min(0).required(),
  // ...
});
```

### CORS & Security
- Origin: `https://fry.farm` only
- Credentials: true (cookies)
- Helmet security headers
- Rate limiting on all endpoints

---

## 15. Algorand SDK Usage

### Backend (algosdk 3.5.2)
- **AlgoKit Utils 9.2.0** for transaction building
- **3-node fallback** via `algodService.withFallback()`
- **ABI method calls** via ARC4 contract clients
- **Box storage** for per-user staking data
- **Rekeyed wallet signing** for treasury operations:
  ```javascript
  // REWARD_MNEMONIC = treasury account (holds assets)
  // REWARD_REKEY = actual signing key (rekeyed to)
  // Transactions are "from" mnemonic account but signed by rekey
  ```
- **Indexer queries** for wallet age, transaction history, NFT ownership

### Frontend (algosdk 2.11.0)
- **AlgoKit Utils 6.2.1** for transaction building
- **@txnlab/use-wallet 2.4.0** for multi-wallet connection
- **Supported wallets**: Defly, Pera, Daffi, Exodus, Lute, KMD (dev)
- **ARC32 contract clients**: `FryStakingClient.ts`, `FryFarmingClient.ts`, `FryNftStakingClient.ts`
- **Transaction signing flow**:
  1. Build transaction(s) using AlgoKit
  2. Pass to wallet's `TransactionSigner`
  3. Submit signed bytes to algod
  4. Poll for confirmation

### Version Mismatch Note
Backend uses algosdk **3.5.2**, frontend uses **2.11.0**. This is intentional — frontend SDK version is constrained by wallet connector compatibility (@txnlab/use-wallet).

---

## 16. Deployment Artifacts

### Docker Compose (single service)
```yaml
services:
  backend:
    build: ./backend
    container_name: fry-farm-backend
    ports: ["127.0.0.1:5000:5000"]  # Loopback only
    mem_limit: 256m
    memswap_limit: 256m
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    volumes:
      - /etc/ssl/mongo/mongo-ca.crt:/etc/ssl/mongo/mongo-ca.crt:ro
      - ./backend/uploads:/app/uploads
    dns: [100.100.100.100, 8.8.8.8, 1.1.1.1]
    logging: { driver: json-file, options: { max-size: 10m, max-file: "3" } }
    restart: unless-stopped
```

### 1Password Secrets
| Vault | Item | Fields |
|-------|------|--------|
| FryFarm | Cloudflare Turnstile | Secret Key |
| FryFarm | AlphaArcade API Key | credential |
| Dashboard | Dash Secrets | REWARD_MNEMONIC, REWARD_REKEY, DISCORD_BUG_WEBHOOK_URL |

**Injection**: `deploy-backend.sh` uses `op read` CLI with `OP_SERVICE_ACCOUNT_TOKEN`.

### Nginx Reverse Proxy (`/etc/nginx/sites-enabled/fry.farm`)
```
Internet → nginx (80/443)
  ├── /api/     → proxy_pass http://127.0.0.1:5000/  (backend)
  ├── /algod/   → proxy_pass http://192.168.9.2:4190/ (Algorand node)
  │              └── fallback: https://mainnet-api.4160.nodely.dev
  ├── /uploads/ → proxy_pass http://127.0.0.1:5000/uploads/ (7d cache)
  ├── /assets/  → static files (1yr immutable cache, Vite hashed)
  └── /         → /var/www/fry.farm/index.html (SPA fallback)
```

Security headers: X-Frame-Options SAMEORIGIN, X-Content-Type-Options nosniff, CSP with Cloudflare Turnstile + Nodely + AlgoNode whitelisted.

### CI/CD (GitHub Actions, self-hosted runner)
1. Checkout → Node 18 setup → env file from `secrets.Production_ENV`
2. Docker build → stop old container → run new → prune → nginx restart

### No CDN
Static assets served directly by nginx with immutable cache headers. No CloudFront, Cloudflare proxy, or other CDN layer.

---

## 17. Identified Gaps — What Must Be Built vs Extended

### Must Build From Scratch

| Component | Reason |
|-----------|--------|
| **Verified-hold NFT staking** | Current model is escrow-only. Need background worker to verify wallet still holds NFTs via Indexer, or a new contract subroutine. |
| **In-app notification system** | No notifications exist (only Discord webhooks). Need: `notifications` collection, API endpoints, frontend notification bell component. |
| **Pool announcement system** | No creator→staker broadcast mechanism. Need: announcement creation API, announcement display in pool UI. |
| **Creator analytics dashboard** | Pool creators see nothing about their stakers. Need: aggregation queries (staker count, TVL over time, claim history), new API endpoints, new frontend page. |
| **External gating API** | No public endpoint for "does wallet X have position in pool Y". Need: unauthenticated read endpoint for third-party integrations. |
| **Compound eligibility requirements** | Current NFT gating is simple (single ASA + min count). DePIN needs compound rules: token balance AND staking position AND NFT holding combined. |
| **DePIN pool creation wizard** | New wizard following existing 5-6 step pattern, with device NFT selection, eligibility config, boost multipliers, and verified-hold options. |
| **Verified-hold background cron** | New cron job (15min interval, matching existing pattern) to check DePIN NFT holding status across all active pools. |

### Can Extend Existing Systems

| Component | What Exists | Extension Needed |
|-----------|-------------|-----------------|
| **Anti-sybil eligibility** | `antiSybilService.js` checks ALGO balance, FRY balance, positions, on-chain score | Add configurable requirement composition (AND/OR rules) for DePIN pool eligibility |
| **NFT staking model** | `nftStakingPoolSchema` with reward models, collection modes, fees | Add `holdingMode` field (escrow vs verified-hold), `deviceType` field, `eligibilityConfig` |
| **Event points multiplier** | `pointsMultiplier` per challenge in events system | Adapt for DePIN boost multipliers (device type × holding duration) |
| **NFT price oracle** | 4-step fallback (DappRadar → Pera → Indexer → creator) | Add DePIN device NFT pricing (may need custom oracle for device NFTs) |
| **Pool creation wizard pattern** | 3 existing wizards (stake/farm/NFT) with Ant Design Steps | Clone CreateNftPoolWizard as starting point, add DePIN-specific steps |
| **Fee system** | `feeConfig` collection with per-action fees, revenue split | Add DePIN-specific fee tiers if needed |
| **Smart contract** | `fry_nft_staking/contract.py` with box storage, 3 reward models | Fork for verified-hold: remove escrow transfer, add holding verification state |
| **Cron pattern** | 2 existing crons at 15min intervals with auto-scheduling | Add third cron for verified-hold checking |
| **Rate limiting** | 3-tier rate limits (global/read/write) | Add DePIN-specific limits if needed |
| **Admin dashboard** | Users, staking, farming management pages | Add DePIN pool management tab |

### Architecture Decisions Required

1. **Verified-hold implementation**: Background worker polling vs on-chain oracle vs hybrid?
   - Polling (recommended): cheaper, simpler, 15min granularity matches existing crons
   - On-chain oracle: more trustless but expensive and complex
   - Hybrid: oracle for high-value pools, polling for others

2. **New contract vs contract extension**: Should DePIN use a forked NFT staking contract or a brand-new one?
   - Fork recommended: reuse box storage, reward models, fee structure
   - Remove escrow transfer logic, add verified-hold state fields
   - Add `is_valid` flag per user box, updated by authorized checker

3. **Eligibility engine complexity**: Simple AND rules vs full rule engine?
   - Start simple: array of requirement objects, all must pass (AND)
   - Each requirement: { type: "token_balance|staking_position|nft_holding", config: {...} }
   - Can extend to OR/nested later if needed

4. **Notification delivery**: Polling vs WebSocket vs SSE?
   - Start with polling (simplest, matches existing patterns)
   - Frontend polls every 60s, marks as read on click
   - WebSocket later if real-time needed

5. **External gating API authentication**: Unauthenticated vs API key?
   - Unauthenticated read-only recommended (like existing `/staking/all`)
   - Rate-limited to prevent abuse
   - Returns boolean + metadata, no sensitive data

---

## Appendix A: File Quick Reference

### Backend Key Files
| File | Lines | Purpose |
|------|-------|---------|
| `backend/index.js` | ~200 | Express app setup, route mounting, middleware |
| `backend/services/antiSybilService.js` | ~400 | Trust tier scoring, eligibility checks |
| `backend/services/circuitBreakerService.js` | ~300 | 4-level claim rate control |
| `backend/services/algodService.js` | ~150 | 3-node fallback with circuit breaker |
| `backend/services/priceService.js` | ~250 | Multi-source price consensus |
| `backend/services/eventPointsService.js` | ~350 | Challenge point calculation |
| `backend/services/airdropService.js` | ~200 | Token distribution to winners |
| `backend/services/nftPriceOracleService.js` | ~200 | 4-step NFT pricing fallback |
| `backend/middleware/auth.js` | ~80 | JWT + admin authentication |
| `backend/middleware/validate.js` | ~400 | 20+ Joi validation schemas |
| `backend/crons/eventPointsCron.js` | ~100 | Event auto-scheduling + point calc |
| `backend/crons/alphaArcadeResolutionCron.js` | ~150 | Market resolution + notifications |

### Frontend Key Files
| File | Lines | Purpose |
|------|-------|---------|
| `frontend/src/staking_func.ts` | 866 | Staking contract interactions |
| `frontend/src/farming_func.ts` | 866 | Farming contract interactions |
| `frontend/src/nft_staking_func.ts` | 579 | NFT staking contract interactions |
| `frontend/src/Modals/website/CreateStakeWizard.tsx` | 765 | Staking pool creation wizard |
| `frontend/src/Modals/website/CreateFarmWizard.tsx` | 915 | Farming pool creation wizard |
| `frontend/src/Modals/website/CreateNftPoolWizard.tsx` | 1000+ | NFT pool creation wizard |
| `frontend/src/services/AuthService.ts` | ~150 | Wallet auth flow |
| `frontend/src/services/TokenDiscoveryService.ts` | ~200 | Token/LP discovery + cache |
| `frontend/src/services/FeeService.ts` | ~100 | Fee calculation |

### Smart Contracts
| File | Purpose |
|------|---------|
| `contracts/fry_staking_v2/contract.py` | V2 token staking (Algopy ARC4) |
| `contracts/fry_nft_staking/contract.py` | NFT staking with box storage (Algopy ARC4) |

### Infrastructure
| File | Purpose |
|------|---------|
| `docker-compose.yml` | Backend container definition |
| `deploy-backend.sh` | 1Password secret injection + rebuild |
| `/etc/nginx/sites-enabled/fry.farm` | Reverse proxy + SPA routing |
| `/etc/nginx/snippets/security-headers.conf` | CSP + security headers |

---

## Appendix B: Technology Versions

| Technology | Backend | Frontend |
|------------|---------|----------|
| Node.js | 18-alpine | 18-slim (build) |
| algosdk | 3.5.2 | 2.11.0 |
| AlgoKit Utils | 9.2.0 | 6.2.1 |
| Express | 4.21.2 | — |
| React | — | 18.2.0 |
| TypeScript | — | 5.1.6 |
| Vite | — | 5.0.0 |
| Mongoose | 8.9.2 | — |
| Ant Design | — | 5.22.1 |
| Tailwind CSS | — | 3.3.2 |
| DaisyUI | — | 4.0.0 |
| ioredis | 5.10.0 | — |
| Helmet | 8.1.0 | — |
| Winston | 3.19.0 | — |
| Formik | — | 2.4.6 |
| Yup | — | 1.4.0 |
