# Alpha Arcade LP Farming — Recon Report
Generated: 2026-03-12T22:30:00Z

---

## 1. EXISTING FARM TYPE SYSTEM

### 1.1 Farm Types Found

The system has **4 distinct farm types**, differentiated implicitly by schema/collection and route — **no central `farmType` enum exists**:

| Type | Backend Schema | Collection | Frontend Route | Contract Client |
|---|---|---|---|---|
| Token Staking | `stakingSchema.js` | `stakings` | `/token-stake` | `FryStakingClient` |
| LP Farming | `farmingSchema.js` | `farmingPools` | `/farm` | `FryFarmingClient` |
| NFT Staking | `nftStakingPoolSchema.js` | `nftStakingPools` | `/nft-stake` | `FryNftStakingClient` |
| Yield Farming | `yieldFarmingSchema.js` | `yieldFarmings` | (unused/legacy) | None |

**Extensibility**: The system is **moderately extensible**. Adding a new farm type means:
- New Mongoose schema + model
- New route + controller files
- New frontend page + table + detail components
- Optionally, a new smart contract + generated client

There is no shared farm-type dispatcher or strategy pattern — each type is entirely independent with its own routes, controllers, and UI. This is actually favorable for adding Alpha Arcade as a new parallel type without touching existing code.

The `farmingSchema` has a `poolType` field with enum `['lp', 'single']` and a `dexProvider` string field, but these are only used within LP Farming — not as a global type system.

### 1.2 Farm Schemas (MongoDB)

#### Staking Pool (`stakings` collection)
```
creatorId:           String (required)
stakeToken:          { id: String, name: String }
rewardToken:         { id: String, name: String }
stakingStartTime:    Number (unix timestamp)
stakingEndTime:      Number (unix timestamp)
stakingTime:         Number (default 0)
duration:            Number (seconds)
aprRate:             Number
totalStakers:        Number (default 0)
totalAmountStaked:   Number (default 0)
rewardTokenAmount:   Number
stakingContractId:   String (Algorand app ID)
lockPeriod:          Number (seconds)
rewardsDistributed:  Number (default 0)
isGated:             Boolean (default false)
gateConfig:          { nftAsaId, nftCreatorAddress, collectionName, minNftCount, gateMessage }
```

#### Farming Pool (`farmingPools` collection)
```
creatorId:                    String (required)
lpToken:                      { tokenA: String, tokenB: String }
rewardToken:                  { id: String, name: String }
rewardTokenAmount:            Number
farmStartTime:                Number (unix timestamp)
farmEndTime:                  Number (unix timestamp)
duration:                     Number (seconds)
lockPeriod:                   Number
farmEntryFee:                 Number
rewardDistributionRate:       Number
rewardDistributionSchedule:   Number
fryRewardFee:                 Number
aprRate:                      Number (default 0)
totalFarmers:                 Number (default 0)
totalStaked:                  Number (default 0)
rewardsDistributed:           Number (default 0)
appId:                        Number (Algorand app ID)
poolType:                     String (enum: 'lp' | 'single')
dexProvider:                  String (default '')
stakeTokenName/Symbol:        String (default '')
rewardTokenName/Symbol:       String (default '')
lpPairName:                   String (default '')
isGated:                      Boolean (default false)
gateConfig:                   { ... }
```

#### NFT Staking Pool (`nftStakingPools` collection)
```
creatorId:              String (required)
appId:                  Number (required, unique)
name:                   String
description:            String
imageUrl:               String
rewardTokenId:          Number (ASA ID)
rewardModel:            String (enum: 'fixed_rate' | 'proportional' | 'apr')
collectionMode:         String (enum: 'creator_address' | 'whitelist' | 'both')
collectionCreator:      String
whitelistedAsaIds:      [Number]
nftValueInRewardToken:  Number
ratePerDay:             Number
totalRewardPool:        Number
aprRate:                Number
valuePerNft:            Number
poolEndTime:            Number
lockPeriod:             Number
depositFeeBps:          Number (0-10000)
withdrawFeeBps:         Number
claimFeeBps:            Number
feeRecipient:           String
totalNftsStaked:        Number
totalStakers:           Number
totalRewardsClaimed:    Number
isActive:               Boolean
```

### 1.3 User Position Schemas

| Type | Collection | Key Fields |
|---|---|---|
| Staking position | `stakingtokens` | wallet, poolId (Mongo _id), appId, totalStaked ($inc), apr, lockPeriod, times, rewardToken, stakeTokens |
| Farming position | `stakeFarmingTokens` | wallet, poolId, stakedAmount, earnedReward, lastStakedAt, claimedAt |
| NFT position | `nftStakedTokens` | wallet, poolId, appId, nftAsaId, nftName, nftImageUrl, isActive |
| Staking withdrawal | `withdrawalTokens` | wallet, poolId, appId, tokens |
| Farming withdrawal | `farmingWithdrawalTokens` | userWallet, poolId, farmingTokenId, amount |
| Staking claim | `claimrewards` | walletId, poolId, rewardClaimed, stakedAmount, stakedTime |
| Farming claim | `claimFarmRewards` | walletId, poolId, rewardClaimed, stakedAmount, stakeStartTime, claimTime |
| NFT claim | `nftStakingClaims` | wallet, poolId, appId, rewardClaimed, txId, feeAmount |

### 1.4 Farm Creation Flow

**Token Staking** (`POST /api/staking/add`):
1. Frontend `CreateStakeWizard.tsx` collects params
2. Frontend calls `initStaking()` in `staking_func.ts` — creates Algorand app via `FryStakingClient.create.initStaking()`
3. Opts contract into stake + reward tokens, sends MBR + reward tokens
4. Backend `POST /api/staking/add` records the pool metadata (appId as `stakingContractId`)

**LP Farming** (`POST /api/farming/add`):
1. Frontend `CreateFarmWizard.tsx` collects params (includes LP token pair A/B)
2. Frontend calls `initFarming()` in `farming_func.ts` — creates Algorand app via `FryFarmingClient.create.initFarming()`
3. Opts contract into LP tokens + reward token + FRY, sends reward tokens
4. Backend `POST /api/farming/add` records pool with `poolType: 'lp'`

**NFT Staking** (`POST /api/nftstaking/add`):
1. Frontend `CreateNftPoolWizard.tsx` collects params
2. Creates pool via `FryNftStakingClient`
3. Backend records pool with reward model and collection config

### 1.5 Staking/Deposit Flow

All staking flows follow the same pattern:
1. **Frontend**: User enters amount → fee calculated → `stakeTokens()` called
2. **On-chain**: Contract call with box payment + asset transfer (net of fee)
3. **Fee transfer**: Separate ASA transfer to fee recipient AFTER successful contract call (wrapped in try/catch — non-atomic by design since the fee fix)
4. **Backend record**: `POST /api/stakingtoken/add` or `/stakingfarmingtoken/add` records the position
5. **Gas fee log**: `POST /api/gasfee/add` records the fee

**Box storage** (32 bytes per user per pool):
- Bytes 0-7: staked amount (uint64 big-endian)
- Bytes 8-15: stake time (uint64 big-endian)
- Bytes 16-23: claimed amount (uint64 big-endian)
- Bytes 24-31: last claim time (farming only)

### 1.6 ZAP Flow (Current LP Farms)

**Frontend-constructed** via `ZapService.ts` using `@tinymanorg/tinyman-js-sdk@4.1.5`:

1. `getPool(algod, asset1Id, asset2Id)` — Fetches Tinyman V2 pool info on-chain
2. `getZapQuote(pool, inputAssetId, inputAmountMicro, decimals, slippage)` — Calculates single-asset add-liquidity quote using `AddLiquidity.v2.withSingleAsset.getQuote()`
3. `buildAddLiquidityTxns(...)` — Generates transaction group via `AddLiquidity.v2.withSingleAsset.generateTxns()`
4. `signAndSubmitAddLiquidity(...)` — All transactions user-signed (no logicsig), submitted via algod
5. User receives LP tokens, then stakes them into the farming contract

**Remove liquidity** is also supported:
- `getRemoveLiquidityQuote()` → `buildRemoveLiquidityTxns()` using `RemoveLiquidity.v2.generateSingleAssetOutTxns()`

**External LP link**: For non-ZAP users, the UI shows a "Get LP Tokens" button linking to `https://app.tinyman.org/pool/{tokenA}/{tokenB}/add-liquidity`

### 1.7 Rewards/Claiming Flow

**On-chain claim** (per farm type):
- Staking: `FryStakingClient.claimTokens({ updatedApr })` — calculates reward from box data + APR
- Farming: `FryFarmingClient.claimRewards({})` — reads box data, calculates based on stake duration
- NFT: Custom claim via `FryNftStakingClient` with reward model-specific logic

**Reward formula** (staking):
```
reward = stakedAmount * (apr / 10000) * ((currentTime - stakeTime) / 31104000)
```

**Backend recording**: After successful on-chain claim, frontend calls `POST /api/claimreward/add` or `/claimfarmrewards/add`

**Daily FRY rewards** (separate system):
- `POST /api/rewards/claim` — Anti-sybil checks → streak calculation → server-signed ASA transfer
- Uses rekeyed wallet: treasury account signed by rekey account
- Requires active staking/farming position

### 1.8 Frontend Component Map

```
Pages:
  /farm               → farm.tsx → farmTable.tsx → fTable.tsx (expandable rows)
  /token-stake        → stake.tsx → stakeTable.tsx → sTable.tsx
  /nft-stake          → nftStake.tsx
  /farm/:appId        → farmPoolStats.tsx
  /token-stake/:appId → stakePoolStats.tsx
  /nft-stake/:appId   → nftPoolStats.tsx

Creation Wizards (Modals/website/):
  CreateFarmWizard.tsx     — LP Farming creation (uses LPTokenSelector)
  CreateStakeWizard.tsx    — Token Staking creation
  CreateNftPoolWizard.tsx  — NFT Staking creation

Shared Components:
  LPTokenSelector.tsx      — LP token pair selection
  TokenSelector.tsx        — Single token selection
  TokenImage.tsx           — Token icon with fallback chain
  StakeModal.tsx           — Staking interaction modal
  WithdrawModal.tsx        — Withdrawal modal
  FeeConfirmation.tsx      — Fee preview before signing

Contract Logic:
  farming_func.ts          — initFarming, stakeTokens, unstakeTokens, claimRewards
  staking_func.ts          — initStaking, stakeTokens, unstakeTokens, claimTokens
  nft_staking_func.ts      — NFT staking contract interactions

Services:
  ZapService.ts            — Tinyman V2 add/remove liquidity
  PriceService.ts          — Multi-source USD pricing (Vestige > Tinyman > CoinGecko > Coinbase)
  FeeService.ts            — Fee calculations
  apiClient.ts             — Axios instance with auth cookie
  nftStakingApi.ts         — NFT-specific API calls
```

---

## 2. SDK COMPATIBILITY ASSESSMENT

### 2.1 Current Dependency Versions

| Package | Frontend | Backend |
|---------|----------|---------|
| `algosdk` | **^2.11.0** | **3.5.2** |
| `@algorandfoundation/algokit-utils` | **^6.2.1** | Not installed |
| `@algorandfoundation/algokit-client-generator` | ^3.0.6 (devDep) | N/A |
| `@tinymanorg/tinyman-js-sdk` | **^4.1.5** | Not installed |
| `@txnlab/use-wallet` | **^2.4.0** (installed 2.8.2) | N/A |
| `@pactfi/pactsdk` | ^0.8.1 | N/A |
| `@deflex/deflex-sdk-js` | ^2.0.5 | ^2.0.5 |
| `@folks-router/js-sdk` | ^0.1.1 | N/A |
| `@alpha-arcade/sdk` | **Not installed** | **Not installed** |

### 2.2 Alpha Arcade SDK Requirements

| Peer Dependency | Required | Frontend Current | Backend Current | Frontend Compatible? | Backend Compatible? |
|---|---|---|---|---|---|
| `algosdk` | **^3.5.2** | 2.11.0 | **3.5.2** | **NO** | **YES** |
| `@algorandfoundation/algokit-utils` | **^9.2.0** | 6.2.1 | N/A | **NO** | Installable |

### 2.3 Compatibility Verdict

## **BLOCKER for frontend integration. CLEAR PATH for backend-only integration.**

**The problem**: `@alpha-arcade/sdk@0.3.0` requires `algosdk ^3.5.2` and `algokit-utils ^9.2.0`. The frontend uses `algosdk 2.11.0` and `algokit-utils 6.2.1`. These are **two major version gaps** with breaking API changes.

**Why a frontend algosdk upgrade is NOT viable right now**:

Upgrading the frontend to algosdk 3.x would cascade into:
1. **algokit-utils 6.x → 9.x** — Breaking API changes (different client construction, different transaction building)
2. **@txnlab/use-wallet 2.x → @txnlab/use-wallet-react** — The React wallet package for algosdk 3.x is a completely different package (`@txnlab/use-wallet-react` instead of `@txnlab/use-wallet`)
3. **Tinyman SDK 4.x → 5.x** — v5.x requires algosdk ^3.2.0, with likely API changes
4. **All 3 contract clients regenerated** — FryStakingClient, FryFarmingClient, FryNftStakingClient would all need regeneration with the new algokit-client-generator for algosdk 3.x
5. **All transaction construction code rewritten** — `farming_func.ts` (867 lines), `staking_func.ts` (575 lines), `nft_staking_func.ts`, `ZapService.ts`, `PriceService.ts` all use algosdk 2.x patterns (`from/to` instead of `sender/receiver`, `Algodv2` constructor differences, etc.)
6. **Pact SDK, Deflex SDK, Folks Router** — All would need compatibility verification

**Estimated effort for full frontend upgrade**: 2-4 weeks of dedicated work, with high regression risk across all existing farm types.

**The solution**: Use `@alpha-arcade/sdk` exclusively in the **backend** (which already runs algosdk 3.5.2). The frontend sends user intent to backend API endpoints, the backend constructs Alpha Arcade transaction groups, returns unsigned transactions for the frontend wallet to sign. This is architecturally sound and matches how the daily rewards system already works (server-side transaction construction).

---

## 3. PROPOSED ARCHITECTURE

### 3.1 New Farm Type: `alpha_arcade_lp`

**New MongoDB Schema** (`alphaArcadePoolSchema.js`):
```javascript
{
  creatorId:            String,        // Admin wallet that created the pool
  appId:                Number,        // NOT an Algorand app ID — this is the Alpha Arcade market appId
  marketAppId:          Number,        // Alpha Arcade market app ID (same as appId, explicit naming)
  matcherAppId:         Number,        // Alpha Arcade matcher app (mainnet: 3078581851)
  marketQuestion:       String,        // "Will X happen by Y?"
  marketCategory:       String,        // From Alpha Arcade API
  marketImageUrl:       String,        // From Alpha Arcade API
  marketResolutionTime: Number,        // Unix timestamp when market resolves
  yesAsaId:             Number,        // YES token ASA ID
  noAsaId:              Number,        // NO token ASA ID
  usdcAsaId:            Number,        // USDC ASA ID (31566704)
  spreadBps:            Number,        // Orderbook spread in basis points (e.g., 200 = 2%)
  rewardToken:          { id: String, name: String },  // FRY reward token
  rewardTokenAmount:    Number,        // FRY rewards allocated to this pool
  poolStartTime:        Number,        // Unix timestamp
  poolEndTime:          Number,        // Should be <= marketResolutionTime
  duration:             Number,        // seconds
  aprRate:              Number,
  lockPeriod:           Number,        // seconds
  totalProviders:       Number,        // default 0
  totalUsdcDeposited:   Number,        // default 0 (micro USDC)
  rewardsDistributed:   Number,        // default 0
  isActive:             Boolean,       // default true
  isResolved:           Boolean,       // default false — set true when market resolves
  resolutionOutcome:    String,        // 'yes' | 'no' | null
  createdAt:            Date,
}
```

**New User Position Schema** (`alphaArcadePositionSchema.js`):
```javascript
{
  wallet:           String,
  poolId:           String,       // MongoDB _id of alphaArcadePool
  marketAppId:      Number,
  usdcDeposited:    Number,       // micro USDC deposited
  yesBalance:       Number,       // YES tokens held (from split)
  noBalance:        Number,       // NO tokens held (from split)
  openOrderIds:     [Number],     // escrowAppIds of active limit orders
  depositedAt:      Date,
  lastUpdatedAt:    Date,
  isActive:         Boolean,      // false after full withdrawal
}
```

### 3.2 Backend Changes

**New files needed:**

| File | Purpose |
|---|---|
| `models/alphaArcadePoolSchema.js` | Pool schema |
| `models/alphaArcadePositionSchema.js` | User position schema |
| `routes/alphaArcadeRoute.js` | API routes |
| `controllers/alphaArcadeController.js` | Business logic |
| `services/alphaArcadeService.js` | Alpha Arcade SDK wrapper |
| `middleware/validate.js` (modify) | Add validation schemas |
| `index.js` (modify) | Mount new routes |

**New API endpoints:**

```
GET    /api/alpha-arcade/markets              — List reward markets from Alpha Arcade API
GET    /api/alpha-arcade/markets/:appId       — Market detail + orderbook
GET    /api/alpha-arcade/pools                — All Alpha Arcade LP pools on fry.farm
GET    /api/alpha-arcade/pool/:poolId         — Pool detail
POST   /api/alpha-arcade/pool/create          — Admin: create pool linked to a market
PUT    /api/alpha-arcade/pool/update/:poolId  — Admin: update pool

POST   /api/alpha-arcade/build-deposit        — Build deposit txn group (split + orders)
POST   /api/alpha-arcade/build-withdraw       — Build withdrawal txn group (cancel + merge)
POST   /api/alpha-arcade/record-deposit       — Record deposit after user signs
POST   /api/alpha-arcade/record-withdraw      — Record withdrawal after user signs
POST   /api/alpha-arcade/record-claim         — Record FRY claim

GET    /api/alpha-arcade/position/:wallet     — User's positions across all AA pools
GET    /api/alpha-arcade/position/:wallet/:poolId — User position in specific pool
```

**Alpha Arcade SDK client initialization** (`services/alphaArcadeService.js`):
```javascript
const { AlphaClient } = require('@alpha-arcade/sdk');
const algosdk = require('algosdk');  // backend already has 3.5.2

const client = new AlphaClient({
  algodClient:   algodInstance,      // from existing algodService.js
  indexerClient: indexerInstance,
  signer:        serverSigner,       // only for read operations; user txns are unsigned
  activeAddress: serverAddress,
  matcherAppId:  3078581851,
  usdcAssetId:   31566704,
  apiKey:        process.env.ALPHA_ARCADE_API_KEY,  // optional, for richer market data
  apiBaseUrl:    'https://platform.alphaarcade.com/api',
});
```

**Environment variable**: `ALPHA_ARCADE_API_KEY` — stored in `.env`, referenced by variable name only.

### 3.3 Frontend Changes

**New files needed:**

| File | Purpose |
|---|---|
| `pages/alphaArcade.tsx` | Main Alpha Arcade LP page |
| `pages/alphaArcadePoolStats.tsx` | Pool detail stats |
| `components/pages/alphaArcade/aaTable.tsx` | Pool listing table |
| `components/pages/alphaArcade/aaBanner.tsx` | TVL/stats banner |
| `components/pages/alphaArcade/MarketCard.tsx` | Market info display |
| `components/pages/alphaArcade/OrderbookView.tsx` | Visual orderbook |
| `components/pages/alphaArcade/PositionView.tsx` | YES/NO balances + open orders |
| `Modals/website/CreateAlphaArcadePoolWizard.tsx` | Admin pool creation |
| `services/alphaArcadeApi.ts` | API client for AA endpoints |

**No new contract client needed** — all Alpha Arcade transactions are built by the backend and returned as unsigned transaction groups for the wallet to sign.

**Create Pool form** (admin only):
1. Fetch reward markets from `GET /api/alpha-arcade/markets`
2. Admin selects a market, sets spread, FRY reward amount, duration, lock period
3. `POST /api/alpha-arcade/pool/create` records the pool

**ZAP-equivalent UI** (deposit):
1. User enters USDC amount
2. Frontend calls `POST /api/alpha-arcade/build-deposit` with `{ wallet, poolId, usdcAmount }`
3. Backend uses Alpha Arcade SDK to build txn group: `splitShares()` + `createLimitOrder()` (YES side) + `createLimitOrder()` (NO side)
4. Backend returns unsigned transaction group to frontend
5. Frontend signs via `useWallet().signTransactions()` and submits
6. Frontend calls `POST /api/alpha-arcade/record-deposit` to record position

**Position display**:
- Show USDC deposited, current YES/NO token balances, open orders
- Show estimated P&L based on current orderbook mid-price
- Show market question, resolution time, category

### 3.4 Transaction Flow: ZAP into Alpha Arcade Market

```
User: "Deposit 100 USDC into market X"
          │
          ▼
Frontend: POST /api/alpha-arcade/build-deposit
          { wallet, poolId, usdcAmount: 100_000_000 }
          │
          ▼
Backend:
  1. client.splitShares({ marketAppId, amount: 100_000_000 })
     → Generates txn: 100 USDC → 100 YES + 100 NO
  2. client.createLimitOrder({
       marketAppId, position: 1 (YES), price: 0.50 + spread/2,
       quantity: 100, isBuying: false  // sell YES at ask
     })
  3. client.createLimitOrder({
       marketAppId, position: 0 (NO), price: 0.50 + spread/2,
       quantity: 100, isBuying: false  // sell NO at ask
     })
  4. Return unsigned txn group to frontend
          │
          ▼
Frontend: signTransactions(txnGroup) → sendRawTransaction()
          │
          ▼
Frontend: POST /api/alpha-arcade/record-deposit
          { wallet, poolId, usdcAmount, escrowAppIds: [...] }
```

**All transactions are user-signed.** The backend only constructs them.

### 3.5 Transaction Flow: Withdraw from Alpha Arcade Market

```
User: "Withdraw from market X"
          │
          ▼
Frontend: POST /api/alpha-arcade/build-withdraw
          { wallet, poolId }
          │
          ▼
Backend:
  1. For each open order:
     client.cancelOrder({ marketAppId, escrowAppId, orderOwner: wallet })
     → Returns YES/NO tokens to wallet
  2. Determine min(yesBalance, noBalance) for merge
  3. client.mergeShares({ marketAppId, amount: minBalance })
     → Converts equal YES+NO back to USDC
  4. Return unsigned txn group to frontend
          │
          ▼
Frontend: signTransactions(txnGroup) → sendRawTransaction()
          │
          ▼
Frontend: POST /api/alpha-arcade/record-withdraw
          { wallet, poolId, usdcReceived }
```

### 3.6 Reward Integration

**FRY rewards work independently of Alpha Arcade's native liquidity rewards:**

- Admin allocates X FRY to the Alpha Arcade pool (stored in `rewardTokenAmount`)
- FRY rewards calculated based on USDC deposited and time staked (same APR formula as other pools)
- Claim flow: standard `POST /api/claimfarmrewards/add` pattern, server-signed FRY transfer
- Alpha Arcade's own liquidity rewards (ALPHA token) are earned separately and managed entirely by Alpha Arcade — fry.farm does not need to handle them

**Daily FRY rewards**: Users with active Alpha Arcade positions should qualify for the daily claim system. The eligibility check (`POST /api/rewards/claim`) needs to include Alpha Arcade positions when checking "has active stake."

### 3.7 Risk Considerations

| Risk | Severity | Mitigation |
|---|---|---|
| **Market resolution** — when a prediction market resolves, one side goes to $0 | HIGH | Auto-withdraw positions before resolution. Pool `poolEndTime` must be < `marketResolutionTime` minus a safety buffer (e.g., 24 hours). Cron job checks approaching resolutions and alerts admin. |
| **One-sided resolution** — if YES wins, all NO tokens become worthless (and vice versa) | HIGH | Same as above — enforce withdrawal before resolution. If resolution happens unexpectedly early, use `claim()` to recover USDC from the winning side. |
| **Orderbook slippage** — thin orderbooks mean large deposits move the price | MEDIUM | Cap per-user deposit size relative to orderbook depth. Display slippage warning. |
| **Spread configuration** — wrong spread settings lose money | MEDIUM | Set sensible defaults (200-500 bps). Allow admin to adjust per pool. Display expected return. |
| **API key management** — Partners API key needed for reward market discovery | LOW | Store as `$ALPHA_ARCADE_API_KEY` in `.env`. Basic on-chain functionality works without API key. |
| **SDK version 0.3.0** — pre-1.0, API may change | MEDIUM | Pin exact version. Monitor releases. Wrap all SDK calls in the service layer to isolate changes. |
| **Matched orders** — when a limit order gets filled, the user holds a directional position | MEDIUM | Monitor open orders. Rebalance if one side gets filled. Document this risk to users. |

### 3.8 Migration Path (algosdk)

**No frontend algosdk upgrade needed.** The Alpha Arcade SDK runs exclusively in the backend, which already has algosdk 3.5.2. The frontend communicates with the backend via REST API.

The backend needs:
```
npm install @alpha-arcade/sdk @algorandfoundation/algokit-utils@^9.2.0
```

`algokit-utils` 9.x is compatible with the backend's existing algosdk 3.5.2. The backend does not currently use algokit-utils, so there's no upgrade conflict — it's a fresh install.

**Future consideration**: When the broader Algorand ecosystem fully migrates to algosdk 3.x (Tinyman SDK 5.x, use-wallet-react, etc.), a full frontend upgrade should be planned. This Alpha Arcade integration does not accelerate or block that timeline.

---

## 4. OPEN QUESTIONS FOR SAMUEL

### Critical (must answer before building):

1. **API Key**: Do we have an Alpha Arcade Partners API key? If not, one needs to be created at alphaarcade.com → Partners tab. Without it, we can still do basic trading but won't get reward market discovery, market images, or categories.

2. **Market selection model**: Should users pick individual prediction markets to provide liquidity to? Or should admins curate which markets get pools on fry.farm? (Recommendation: admin-curated, to avoid users accidentally providing liquidity to near-resolution markets.)

3. **Spread configuration**: Should the orderbook spread be configurable per pool, or use a global default? What spread feels right? (200 bps = 2% is typical for prediction market LPs.)

4. **Auto-withdrawal before resolution**: Should the system automatically cancel orders and merge shares X hours before market resolution? Or just warn users and let them withdraw manually?

### Important (should answer before building):

5. **P&L tracking**: Should we track unrealized P&L on positions (requires checking orderbook mid-price periodically)? Or just show deposited vs. withdrawn USDC?

6. **ALPHA token rewards**: Alpha Arcade pays its own liquidity rewards in ALPHA tokens. Should fry.farm display these alongside FRY rewards, or let users discover them on alphaarcade.com?

7. **Deposit limits**: Should there be a min/max USDC deposit per user per pool? Thin orderbooks can be significantly moved by large deposits.

8. **Rebalancing**: When one side of a user's orders gets filled (e.g., someone buys their YES tokens), should the system automatically rebalance? This is complex but important for true market-making.

9. **Pool gating**: Should Alpha Arcade pools support the existing NFT-gating system (`isGated` + `gateConfig`)?

### Nice to know:

10. **Priority**: Is this higher priority than other pending work? The build estimate is ~1-2 weeks for a functional MVP (backend + frontend + basic UI), plus ~1 week for polish (P&L display, auto-withdrawal cron, rebalancing).

---

## 5. FILE INVENTORY

### New files to create (estimated ~12 files):

**Backend (6 files):**
- `backend/models/alphaArcadePoolSchema.js`
- `backend/models/alphaArcadePositionSchema.js`
- `backend/routes/alphaArcadeRoute.js`
- `backend/controllers/alphaArcadeController.js`
- `backend/services/alphaArcadeService.js`
- `backend/scripts/checkMarketResolutions.js` (cron job)

**Frontend (6+ files):**
- `frontend/src/pages/alphaArcade.tsx`
- `frontend/src/pages/alphaArcadePoolStats.tsx`
- `frontend/src/components/pages/alphaArcade/aaTable.tsx`
- `frontend/src/components/pages/alphaArcade/aaBanner.tsx`
- `frontend/src/components/pages/alphaArcade/MarketCard.tsx`
- `frontend/src/services/alphaArcadeApi.ts`

### Files to modify (estimated ~5 files):

- `backend/index.js` — mount new routes
- `backend/middleware/validate.js` — add validation schemas
- `backend/.env` — add `ALPHA_ARCADE_API_KEY`
- `frontend/src/App.tsx` — add route
- `frontend/src/components/shared/Navbar.tsx` (or equivalent) — add nav link
- `backend/controllers/rewardsController.js` — include AA positions in eligibility check

### No files deleted or substantially modified.

---

## 6. SUMMARY

1. **Farm types**: 4 exist (Token Staking, LP Farming, NFT Staking, Yield Farming). System is extensible — each type is independent with its own routes/controllers/UI.
2. **SDK compatibility**: `@alpha-arcade/sdk` requires algosdk 3.x — **incompatible with frontend** (algosdk 2.x), but **compatible with backend** (algosdk 3.5.2). **Solution: backend-only SDK integration.**
3. **Biggest technical risk**: Market resolution timing. If users don't withdraw before a market resolves, they could lose their entire position on the losing side. Requires either auto-withdrawal or aggressive warning system.
4. **Estimated scope**: ~12 new files, ~5 modified files. MVP in ~1-2 weeks, polish in ~1 additional week.
5. **Required manual actions before build**: (a) Obtain Alpha Arcade Partners API key, (b) Samuel answers the market selection and spread configuration questions above, (c) `npm install @alpha-arcade/sdk @algorandfoundation/algokit-utils@^9.2.0` in backend.
