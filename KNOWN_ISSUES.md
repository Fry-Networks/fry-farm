# Fry.Farm — Known Issues & Limitations

## Bug 2 — "4 assets" error when creating FRY/FRY staking pool

**Category:** Smart Contract Limitation
**Status:** Cannot fix without contract redeployment

**Root cause:** The smart contract `optInAsset(asset,asset,pay)void` always executes TWO inner asset opt-in transactions — one for `asset_one` and one for `asset_two`. When both are the same FRY token (id 2485314946), the contract still submits both inner transactions. The Algorand SDK's `populateAppCallResources: true` simulates this and hits resource counting issues.

**Why it can't be fully fixed:** The contract TEAL code hardcodes two `itxn_submit` calls for asset opt-in. For same-token pools, the second opt-in is redundant but the contract doesn't check for this case.

**Resolution:** If same-token staking pools are required, the contract needs a new method like `optInSingleAsset(asset,pay)void` that handles single-asset opt-in. This requires redeploying the smart contract.

---

## Bug 3 — "NoOp" displayed in wallet popup during transactions

**Category:** By Design (Algorand Protocol Behavior)
**Status:** No fix needed

**Root cause:** All Algorand ABI method calls use `OnApplicationComplete.NoOpOC`. This is the standard protocol behavior — `no_op: 'CALL'` is the correct transaction type for every ABI method call. Wallets (Pera, Defly, etc.) display the low-level transaction type "NoOp" rather than the human-readable ABI method name.

This behavior is consistent across ALL Algorand dApps and is not specific to Fry.Farm.

---

## Bugs 4 & 6 — "No Pools Found" / "No Farms Found"

**Category:** Data Seeding Required
**Status:** Requires admin action

**Root cause:** The MongoDB staking and farming collections are empty. The frontend correctly shows empty states when no data is returned from:
- `GET /staking/all` → `{"data":[]}`
- `GET /farming/all` → `{"data":[]}`

**Admin workflow to create pools/farms:**

1. **Deploy staking contract on-chain** using the Algorand SDK or AlgoKit
2. **Register the pool in the database** via `POST /staking/add` with fields:
   - `creatorId`, `stakeToken`, `rewardToken`, `stakingStartTime`, `stakingEndTime`
   - `duration`, `aprRate`, `rewardTokenAmount`, `stakingContractId`, `lockPeriod`
3. **For farming**, deploy farm contract and register via `POST /farming/add` with fields:
   - `creatorId`, `lpToken`, `rewardToken`, `rewardTokenAmount`, `farmStartTime`, `farmEndTime`
   - `duration`, `lockPeriod`, `farmEntryFee`, `rewardDistributionRate`
   - `rewardDistributionSchedule`, `fryRewardFee`, `aprRate`, `appId`

The admin dashboard UI exists at the `/admin` route but does not currently have a functional pool/farm creation interface — pools must be created programmatically.
