# Device Staking Pool Wizard — UX Fixes Report

**Date:** 2026-03-16
**File Modified:** `frontend/src/Modals/website/CreateDevicePoolWizard.tsx`

---

## Issue 1: Mode Selection Visual Feedback — Fixed

**Problem:** Selected and unselected mode cards were hard to distinguish, especially in dark mode.

**Changes:**
- **Added checkmark indicator:** Selected card shows a `mdi:check-circle` icon in the top-right corner (green for Verified Hold, blue for Escrow Lock). Added `relative` positioning to cards for absolute icon placement.
- **Strengthened unselected border:** Changed `border-transparent` to `border-[var(--border-color)]` so unselected cards have a visible muted border.
- **Added ring glow on selected:** Added `ring-1 ring-green-500/30` (or `ring-blue-500/30`) to selected state for a subtle glow effect.
- **Increased dark mode opacity:** Changed `dark:bg-green-900/20` to `dark:bg-green-900/30` (and same for blue) for more visible tint.

---

## Issue 2: Verifier Address Hidden Under Advanced Settings — Fixed

**Problem:** Verifier Address field was shown inline, confusing regular pool creators.

**Changes:**
- **Moved to collapsible section:** Verifier Address is now inside an "Advanced Settings" toggle in Step 0, using the same collapse pattern as Step 1 (chevron icon + toggle).
- **New state variable:** `showModeAdvanced` (default `false`).
- **Added info banner:** Blue info box above the field explaining: "The Fry platform verifier will automatically handle verification for your pool. Only set a custom address if you need a different verifier."
- **Improved helper text:** Now reads: "The verifier is the wallet authorized to confirm device ownership on-chain during periodic verification checks. Defaults to your wallet address."
- **Default unchanged:** Still defaults to `activeAddress` (user's wallet). No platform verifier constant exists in the frontend — the backend resolves this from `VERIFIER_MNEMONIC` at runtime.

---

## Issue 3: DePIN Collection Presets — Added

**Problem:** Users had to paste raw creator addresses with no guidance.

**Changes:**

### Preset Collection Constant

Added `DEPIN_COLLECTIONS` array (after line 70) with 5 verified Algorand DePIN projects:

| Project | Creator Address | Category | Status |
|---------|----------------|----------|--------|
| PlanetWatch Sensors | `U2RDZ4FG...` | Environmental | Active |
| Blockcreate Blocks | `3CWBQEJY...` | Gaming | Active |
| PiPhi Network | `MHWVMMSI...` | Infrastructure | Active |
| Fry Networks | `ATPVJYGE...` | Mining | Active |
| Wayru Airblocks | `EJX27KM3...` | Connectivity | Defunct |

**Not included** (addresses could not be confirmed on mainnet):
- ElementData — no NFTs found on Algorand mainnet
- DigiLeaf — xGov proposal only, no deployed NFTs

### Preset Grid UI

In Step 1 (Collection), when Collection Mode is "Creator Address" or "Both":

1. **Grid of clickable cards** (2 columns) showing each DePIN project with name, description, category badge, and optional "Defunct" badge
2. **Selected card** shows green border + checkmark (same visual pattern as mode selection)
3. **Divider** with "Or enter a custom creator address" text
4. **Original manual input** preserved below the divider

**Clicking a preset card:**
- Sets `collectionCreator` to the project's verified address
- Auto-sets `poolName` to "Stake {Project Name}" (unless user has customized the name)
- Triggers existing NFD lookup and collection image auto-fetch

---

## Verification

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | Pass |
| All creator addresses verified via Algorand Indexer | 5/7 confirmed |
| canProceed logic unchanged | No functional impact |

## Backup

`/opt/fry-farm/backups/CreateDevicePoolWizard.tsx.bak.*`
