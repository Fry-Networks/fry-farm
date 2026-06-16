# FryFarming V2 Migration Plan

## Overview
FryFarming V2 replaces the overflow-broken V1 farming pools with BigUInt-safe reward math.
Deployed to Algorand mainnet on June 16, 2026.

## New Contracts
- **V2 Pool 1** (180-day lock): App ID `3603114670`
  - Address: `DTJ75ECCGXGSHVKZ6FDQ56Q5JFWQDTCFVPC6TK5VRAIWWJQWYTR6OXQAAE`
  - APR: 2,704,743 (set via first stakeTokens)
  - Farm ends: Sep 3, 2027

- **V2 Pool 2** (365-day lock): App ID `3603114865`
  - Address: `XQSHAWX2VORZOSJK6P5C7I4MVSHOIDNAM75EURIZX3ZM232IGM2SVPE2XI`
  - APR: 3,365,486 (set via first stakeTokens)
  - Farm ends: Mar 7, 2028

## Old Contracts (overflow-broken, immutable)
- Pool 1: App `3470331118` — deactivated, principal safe after lock expiry Sep 3, 2026
- Pool 2: App `3470332962` — deactivated, principal safe after lock expiry Mar 7, 2027

## Tokens
- Stake token (LP): ASA `3437164440`
- Reward token (fVPN): ASA `2485198745`
- FRY 2.0: ASA `2485314946`

## Owed Rewards
Rewards owed from old pools (overflow prevented claims) were airdropped directly:
- 11/13 stakers received airdrops totaling ~1.93B fVPN on June 16, 2026
- 1 wallet (GIQXWV5D) deferred — not opted into fVPN (owes ~48.9M fVPN across 2 positions)

## Migration Steps for Stakers

### Pool 1 Stakers (after Sep 3, 2026)
1. Go to fry.farm > LP Farm > Token Farm
2. Find your position in old Pool 1
3. Click **Unstake** — your principal returns to your wallet
4. Find V2 Pool 1 (180 Days Lock, fVPN reward)
5. Click **Stake** — restake your fVPN LP tokens

### Pool 2 Stakers (after Mar 7, 2027)
Same steps, using V2 Pool 2 (365 Days Lock)

## Timeline
| Date | Event |
|------|-------|
| Jun 16, 2026 | V2 pools deployed, owed rewards airdropped |
| Sep 3, 2026 | Pool 1 lock expires — Pool 1 stakers can migrate |
| Mar 7, 2027 | Pool 2 lock expires — Pool 2 stakers can migrate |
| Sep 3, 2027 | V2 Pool 1 farm ends |
| Mar 7, 2028 | V2 Pool 2 farm ends |

## Technical Details
- **Fix**: BigUInt intermediate arithmetic (overflow-impossible by construction)
- **Old bug**: `(duration * apr * staked * rate)` — four uint64 multiplies before divide — overflow at ~80 days
- **V2 fix**: `BigUInt(duration) * BigUInt(apr) * BigUInt(staked) * BigUInt(rate) // BigUInt(divisor)`
- 13/13 localnet tests passed including overflow regression and farm_end_time cap
- Source: contracts/fry_farming_v2/contract.py
