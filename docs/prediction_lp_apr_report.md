# Prediction LP — APR Estimation + Educational Tooltip Report

**Date:** 2026-03-16

---

## Feature 1: Backend APR Calculation

**File:** `backend/controllers/alphaArcadeController.js`

### Formula

```
estimatedApr = dailyTurnoverRate * (spreadBps / 10000) * 365 * 100
```

- `dailyTurnoverRate = 0.1` (10% of TVL traded daily — conservative assumption)
- `spreadBps` = pool's bid-ask spread in basis points (default 50)
- Example: 50 bps spread → `0.1 * 0.005 * 365 * 100 = 18.25% APR`

### Response Shape

The `aprEstimate` object is added to each pool in `GET /prediction-lp/pools` and `GET /prediction-lp/pool/:poolId`:

```json
{
  "aprEstimate": {
    "estimatedApr": 18.25,
    "spreadBps": 50,
    "totalLiquidity": 5000000,
    "daysToResolution": 14.3,
    "dataSource": "estimated"
  }
}
```

Computed on-the-fly, not stored in the database.

---

## Feature 2: Frontend APR Display + Educational Tooltip

**File:** `frontend/src/components/pages/alphaArcade/AlphaArcadePage.tsx`

### APR Column

Added "EST. APR" column to the Community Positions table between TVL and PROVIDERS:
- Green text for non-zero APR (e.g., "18.3%")
- Gray "N/A" for pools with no liquidity
- Sortable column
- Info icon with Ant Design Tooltip explaining the estimation methodology

### "How it works" Section

Collapsible section above the tabs with four panels:
- **How you earn** — spread mechanics explained with concrete example
- **Your risk** — directional exposure at resolution
- **When you get paid** — accumulation and settlement timing
- **Tips** — spread/volume tradeoff, time horizon, diversification

---

## Verification

| Check | Result |
|-------|--------|
| `node -c backend/controllers/alphaArcadeController.js` | Pass |
| `npx tsc --noEmit` | Pass |

## Backups

- `backups/alphaArcadeController.js.bak.*`
- `backups/AlphaArcadePage.tsx.bak.*`

## Deployment Required

- **Backend:** Rebuild Docker container (same deploy pattern as staking fixes)
- **Frontend:** `npm run build` + copy to `/var/www/fry.farm/`
