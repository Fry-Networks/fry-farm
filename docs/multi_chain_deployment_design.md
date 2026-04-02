# Multi-Chain DePIN Device Staking — Design Document

> **Status:** Draft
> **Date:** 2026-03-16
> **Scope:** Architecture and implementation plan for deploying fry.farm device staking natively on Voi, Solana, Midnight, and EVM chains. Each deployment is sovereign — no cross-chain bridging.

---

## Table of Contents

1. [Current Architecture & Multi-Chain Readiness](#1-current-architecture--multi-chain-readiness)
2. [Target Architecture: Config-Driven Chain Adapters](#2-target-architecture-config-driven-chain-adapters)
3. [Per-Chain Deployment Details](#3-per-chain-deployment-details)
4. [Dead/Defunct Project NFT Staking](#4-deaddefunct-project-nft-staking)
5. [Adapter Interface Definitions](#5-adapter-interface-definitions)
6. [Codebase Structure & File Tree](#6-codebase-structure--file-tree)
7. [Migration Path](#7-migration-path)
8. [Implementation Phases & Task Lists](#8-implementation-phases--task-lists)
9. [Timeline Visualization](#9-timeline-visualization)

---

## 1. Current Architecture & Multi-Chain Readiness

### 1.1 Data Models: Already Multi-Chain

The MongoDB schemas contain dormant multi-chain fields that activate with no migration:

| Schema | Field | Current Default | Purpose |
|--------|-------|-----------------|---------|
| `devicePoolSchema` | `chainId` (L159) | `'algorand-mainnet'` | Scopes pools to a chain |
| `devicePoolSchema` | `chainType` (L163) | `'algorand'` | Enum: `algorand`, `evm`, `solana`, `cosmos` |
| `devicePoolSchema` | `acceptedCollections[].identifiers.contractAddress` (L72) | `''` | EVM NFT contract address |
| `devicePoolSchema` | `acceptedCollections[].identifiers.evmChainId` (L74) | `0` | EVM chain ID (e.g., 8453 for Base) |
| `devicePoolSchema` | `acceptedCollections[].identifiers.collectionAddress` (L73) | `''` | Generic collection address (Solana, etc.) |
| `devicePositionSchema` | `deviceChainId` (L21) | `'algorand-mainnet'` | Chain the staked NFT lives on |
| `walletLinkSchema` | `links[].chainId` (L10) | — | Links primary wallet to other-chain wallets |
| `walletLinkSchema` | `links[].signatureProof` (L12) | — | EVM/Solana signature for wallet link verification |

**Existing index** at `devicePoolSchema` L231: `{ status: 1, chainId: 1 }` — queries already filter by chain.

`getAllPools` in `devicePoolService.js` L60 already applies `chainId` as a filter:
```js
if (filters.chainId) query.chainId = filters.chainId;
```

### 1.2 Execution Layer: Algorand-Only

Despite multi-chain data models, all runtime code is hardcoded to Algorand mainnet.

**Backend — 5 files with Algorand-specific code:**

| File | Algorand Dependency | Details |
|------|---------------------|---------|
| `backend/services/devicePoolService.js` | 4 Indexer fetch calls | L8: `INDEXER_BASE = 'https://mainnet-idx.4160.nodely.dev'`; L15 (validate reward token), L22 (validate creator), L95 (verify NFT ownership), L106 (get asset details) |
| `backend/services/requirementCheckerService.js` | 7 Indexer fetch calls | L12: same `INDEXER_BASE`; L28 (block timestamp), L45/L116/L214 (account info), L74 (NFT holding), L82+L91 (all assets + creator check) |
| `backend/crons/deviceVerificationCron.js` | Indexer + algosdk tx building | L9: same `INDEXER_BASE`; L37 (health check), L69 (verify NFT held); L3: `require('algosdk')`; L52-56 (mnemonic→secret key); L142-158 (makeApplicationCallTxn, sign, send) |
| `backend/services/algodService.js` | 3 Algod nodes + algosdk | L1: `require('algosdk')`; L4-23 (ATLAS00, Nodely, Algonode fallback nodes); L27 (`new algosdk.Algodv2`); L36-68 (`withFallback` circuit breaker) |
| `backend/routes/authRoutes.js` | algosdk verify/simulate | L4: `require('algosdk')`; L36 (`isValidAddress`); L76 (`decodeSignedTransaction`); L94-102 (`SimulateRequest` for rekeyed-account-safe verification) |

**Frontend — 3 files with Algorand-specific code:**

| File | Algorand Dependency | Details |
|------|---------------------|---------|
| `frontend/src/device_staking_func.ts` | 13+ algosdk/algokit calls | 100% Algorand. 15 exported functions for on-chain operations (create pool, stake, unstake, claim, etc.). Uses ABI contracts, AtomicTransactionComposer, box storage, asset transfers. |
| `frontend/src/services/nftCollectionService.ts` | 2 API endpoints | L4: `INDEXER_URL = 'https://mainnet-idx.4160.nodely.dev'`; L5: `PERA_API = 'https://mainnet.api.perawallet.app'`; 4 functions for NFT discovery and metadata. |
| `frontend/src/services/AuthService.ts` | algosdk payment tx | L1: `import algosdk`; L102: `makePaymentTxnWithSuggestedParamsFromObject` — zero-ALGO self-payment with nonce in note field as proof of wallet ownership. |

### 1.3 Chain-Agnostic Code (Reusable As-Is)

These require zero changes for multi-chain:

- **`frontend/src/services/deviceStakingApi.ts`** — 16 REST functions, pure HTTP, no blockchain imports
- **`frontend/src/services/apiClient.ts`** — axios instance + 401 interceptor
- **All React components/pages** — `deviceStake.tsx`, `deviceDashboard.tsx`, `deviceStakeTable.tsx`, `DeviceStakeModal.tsx`, `DeviceClaimModal.tsx` — delegate chain logic to service layer
- **`frontend/src/types/deviceStaking.ts`** — 216 lines of interfaces, already has `chainId`, `chainType`, `AcceptedCollection` with multi-chain identifiers
- **Backend:** announcement service, analytics, gated access, multiplier math, Joi validation, JWT auth middleware
- **MongoDB queries** — already support `chainId` filtering

---

## 2. Target Architecture: Config-Driven Chain Adapters

### 2.1 Architecture Decision: Option B — Config-Driven Adapters in Existing Repos

**Rejected alternatives:**
- **Option A (monorepo):** Overkill for the current team size. Adds build complexity without proportional benefit.
- **Option C (fork-per-chain):** Divergence nightmare. Bug fixes must be cherry-picked across N repos.

**Chosen approach:** Each backend instance serves one chain, selected by `CHAIN_ID` environment variable. Frontend builds target one chain via Vite env files. Shared MongoDB with `chainId` scoping.

### 2.2 Backend Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Host                          │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ backend:algo │  │ backend:voi │  │ backend:sol │    │
│  │ CHAIN_ID=    │  │ CHAIN_ID=   │  │ CHAIN_ID=   │    │
│  │ algorand-    │  │ voi-mainnet │  │ solana-     │    │
│  │ mainnet      │  │             │  │ mainnet     │    │
│  └──────┬───────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                 │                │            │
│         └────────┬────────┴────────┬───────┘            │
│                  │                 │                     │
│           ┌──────▼──────┐  ┌──────▼──────┐             │
│           │   MongoDB   │  │    Nginx    │             │
│           │  (shared)   │  │  (routing)  │             │
│           └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────┘
```

**Key rules:**
1. Each backend container sets `CHAIN_ID` (e.g., `algorand-mainnet`, `voi-mainnet`, `solana-mainnet`, `evm-base`, `evm-arbitrum`).
2. On startup, the `ChainAdapterFactory` loads the correct adapter for the chain.
3. All chain-specific operations (indexer queries, tx building, auth verification) route through the adapter interface.
4. MongoDB is shared; every query includes `chainId` in its filter (already the case for pools).
5. The verifier cron runs per-instance — each backend verifies only its own chain's staked devices.

### 2.3 Frontend Architecture

**Per-chain builds via Vite env files:**

```
frontend/
├── .env.algorand          # VITE_CHAIN_ID=algorand-mainnet
├── .env.voi               # VITE_CHAIN_ID=voi-mainnet
├── .env.solana            # VITE_CHAIN_ID=solana-mainnet
├── .env.evm-base          # VITE_CHAIN_ID=evm-base
└── .env.evm-arbitrum      # VITE_CHAIN_ID=evm-arbitrum
```

Each build includes only the SDK for its target chain. This avoids bundling `algosdk` + `@solana/web3.js` + `ethers` into a single 2MB+ bundle.

The frontend `ChainAdapter` is selected at startup based on `VITE_CHAIN_ID` and injected via React Context. Components call adapter methods; they never import chain SDKs directly.

### 2.4 Auth Strategy

Each chain uses its own proof-of-ownership mechanism:

| Chain | Auth Mechanism | Current/New |
|-------|---------------|-------------|
| Algorand | Zero-ALGO self-payment tx with nonce in `note`, verified via `simulateTransactions` | Current (supports rekeyed accounts) |
| Voi | Same as Algorand (AVM-compatible) | Same code, different node endpoint |
| Solana | `signMessage` via wallet adapter → `nacl.sign.detached.verify` on backend | New |
| EVM | `personal_sign` (EIP-191) → `ecrecover` on backend | New |
| Midnight | *Needs research* — likely ZK proof or Compact-native signing | New, deferred |

All auth strategies produce the same output: a verified `(wallet, chainId)` tuple → JWT with `wallet` and `chainId` claims.

---

## 3. Per-Chain Deployment Details

### 3.1 Voi (Priority 1)

**Why first:** AVM-compatible (same VM as Algorand). Fry Networks cross-chain strategy. Minimal new code — Voi extends Algorand.

**Chain details:**
- AVM-compatible chain — same algosdk, same TEAL/ARC-4 bytecode
- Wallet: Kibisis (primary), also supports Pera via WalletConnect
- Node endpoints: `mainnet-api.voi.nodely.dev` (Algod), `mainnet-idx.voi.nodely.dev` (Indexer)
- Block time: ~3.3s (same as Algorand)
- Native token: VOI (same 6-decimal microunit model)

**Smart contract:** Deploy identical TEAL bytecode. No Solidity, no Rust — same compiler output.

**Backend adapter:** `VoiAdapter extends AlgorandAdapter`. Overrides only:
- Node endpoints (Voi Nodely URLs)
- `INDEXER_BASE` URL
- Asset validation endpoints (Voi assets, not Algorand assets)

**Frontend adapter:** Same — `VoiChainAdapter extends AlgorandChainAdapter`. Override node config, wallet provider (Kibisis instead of Pera).

**DePIN projects on Voi:** Limited currently. Device staking deploys alongside the full fry.farm DeFi suite (token staking, LP farming, swap, prediction markets, events). DePIN availability is additive, not a prerequisite.

**Effort estimate:** 2-3 weeks (after Phase 0 adapter extraction)

### 3.2 Solana (Priority 2)

**Why second:** Largest DePIN ecosystem. Helium, io.net, Hivemapper, GEODNET (migrating from Polygon). Solana's compressed NFT (cNFT) model requires a different verification pattern.

**Chain details:**
- Runtime: Solana BPF (Rust programs, Anchor framework)
- Token standard: SPL tokens, Metaplex NFTs, cNFTs (Bubblegum/DAS)
- Wallet: Phantom, Solflare, Backpack
- RPC: Helius, Triton, QuickNode (DAS API for cNFTs)
- Block time: ~400ms
- Native token: SOL (9 decimals, lamports)

**Smart contract: Anchor program**

Key differences from Algorand TEAL:
- **PDAs (Program Derived Addresses)** replace Algorand box storage for user state
- **SPL token transfers** replace Algorand ASA opt-in/transfer
- **cNFT verification** cannot use on-chain `spl_token::state::Account` — must use DAS API off-chain, then attest on-chain

**cNFT verification pattern (critical for Helium):**

Helium has ~991K compressed NFTs minted via Bubblegum. These do NOT have standard SPL token accounts — ownership is stored in concurrent Merkle trees, queryable only via DAS (Digital Asset Standard) API.

```
┌──────────┐     ┌──────────────┐     ┌───────────┐
│ Verifier │────>│  DAS API     │────>│ Merkle    │
│ Cron     │     │ (Helius)     │     │ Tree      │
│          │     │              │     │ (on-chain)│
│          │     │ getAsset()   │     │           │
│          │     │ getAssetBy   │     │           │
│          │     │ Owner()      │     │           │
└────┬─────┘     └──────────────┘     └───────────┘
     │
     │ attest verification result
     ▼
┌──────────────────────┐
│ Device Staking       │
│ Anchor Program       │
│                      │
│ update_verification  │
│ (verifier-signed ix) │
└──────────────────────┘
```

The verifier cron:
1. Calls DAS API `getAsset(assetId)` to confirm NFT ownership
2. Calls `getAssetsByOwner(wallet)` to confirm the wallet still holds the cNFT
3. Submits an `update_verification` instruction (signed by verifier keypair) to the Anchor program
4. The program trusts the verifier's attestation (verifier pubkey is stored in pool state)

This pattern also works for standard SPL NFTs — the DAS API indexes both.

**DePIN project inventory (Solana):**
- **Helium** — ~991K hotspot cNFTs (IOT + MOBILE subnetworks). Verified via DAS API.
- **io.net** — GPU worker NFTs. Standard Metaplex NFTs.
- **Hivemapper** — Dashcams are wallet-linked, NOT NFTs. Not directly stakeable as device NFTs, but wallet-linked device verification is possible via API (needs research).
- **GEODNET** — Migrating from Polygon to Solana (in progress). Standard NFTs expected.
- **Wayru** (defunct) — WNode NFTs still on-chain on Solana. Explicitly stakeable. See [Section 4](#4-deaddefunct-project-nft-staking).
- **Render** — GPU NFTs (needs research — may be standard Metaplex or cNFT)

**Effort estimate:** 8-12 weeks (Anchor program development + DAS API integration + testing)

### 3.3 EVM Chains (Priority 3)

**Why third:** Multiple DePIN projects across Base, Arbitrum, Polygon. One Solidity contract deployed to N chains.

**Chain details:**
- Runtime: EVM (Solidity, Hardhat/Foundry)
- Token standard: ERC-721, ERC-1155
- Wallet: MetaMask, WalletConnect, Coinbase Wallet, Rainbow
- RPC: Alchemy, Infura, public RPCs
- Each chain has its own chainId (Base=8453, Arbitrum=42161, Polygon=137)

**Smart contract: Solidity (single contract, multi-chain deploy)**

```solidity
// Simplified interface — one contract deployed to each EVM chain
interface IDeviceStaking {
    function createPool(bytes32 poolId, address rewardToken, address[] collections) external;
    function stakeDevice(bytes32 poolId, address nftContract, uint256 tokenId) external;
    function unstakeDevice(bytes32 poolId, address nftContract, uint256 tokenId) external;
    function claimRewards(bytes32 poolId) external;
    function updateVerification(bytes32 poolId, address staker, bool verified) external; // verifier only
    function depositRewards(bytes32 poolId, uint256 amount) external;
}
```

Key differences from Algorand:
- **ERC-721 `transferFrom`** replaces Algorand ASA transfer (user must `approve` contract first)
- **`ownerOf(tokenId)`** for on-chain ownership verification (no need for DAS-style off-chain verification)
- **Multiple NFT contracts per pool** — `acceptedCollections[].identifiers.contractAddress` already exists in the schema
- **Gas paid in native token** (ETH on Base/Arbitrum) — fee structure differs from Algorand's flat 0.001 ALGO

**Backend adapter:** `EvmAdapter` uses `ethers.js` (or `viem`). Per-chain config:

```js
const EVM_CHAINS = {
  'evm-base': {
    chainId: 8453,
    rpc: ['https://mainnet.base.org', 'https://base.llamarpc.com'],
    explorer: 'https://basescan.org',
    nativeToken: { symbol: 'ETH', decimals: 18 }
  },
  'evm-arbitrum': {
    chainId: 42161,
    rpc: ['https://arb1.arbitrum.io/rpc'],
    explorer: 'https://arbiscan.io',
    nativeToken: { symbol: 'ETH', decimals: 18 }
  }
};
```

**DePIN project inventory (EVM):**

| Project | Chain | NFT Standard | Contract / Notes |
|---------|-------|-------------|------------------|
| **DIMO** | Polygon → Base (migrated) | ERC-721 | Vehicle device NFTs on Base. Active project. |
| **WeatherXM** | Arbitrum | ERC-721 | Weather station NFTs. **NOT on Base** (contrary to some sources). Arbitrum only. |
| **Presearch** | Base | ERC-721 | Search node NFTs. Needs research on exact contract. |
| **Aethir** | Arbitrum | ERC-721 | GPU compute node NFTs. Needs research on stakeability. |
| **Wayru** (defunct) | — | — | Wayru's EVM NFTs are on Algorand and Solana, NOT EVM. |

**NFT ownership verification:** On-chain `ownerOf(tokenId)` call via RPC — no indexer needed for standard ERC-721. For ERC-1155, use `balanceOf(owner, tokenId)`.

**Effort estimate:** 6-8 weeks (Solidity contract + Hardhat tests + multi-chain deploy scripts + ethers.js adapter)

### 3.4 Midnight (Priority 4)

**Why last:** Mainnet targeting late March 2026. Compact language (TypeScript-like syntax compiled to ZK circuits) requires the largest learning curve. Ships when the full fry.farm DeFi suite goes to Midnight.

**Chain details:**
- Cardano sidechain focused on data protection / confidential smart contracts
- Smart contract language: **Compact** — TypeScript-like syntax that compiles to ZK circuits
- State model: UTXO-based (Cardano heritage), with shielded and public state
- Wallet: Lace (IOG wallet), possibly Midnight-native wallets
- Testnet: available; mainnet: late March 2026 (needs research — timeline may slip)
- Consensus: proof-of-stake via Cardano validators

**Smart contract: Compact**

Compact's key difference is that contract state can be **public** (on-chain, visible to all) or **private** (known only to the parties in the transaction, proven via ZK proofs). For device staking:
- Pool configuration → public state
- Staked device list → public state (pool creators and stakers need visibility)
- Reward balances → could be private (only staker sees their balance) or public (transparent pools)
- Verification status → public (verifier attests, anyone can check)

The ZK circuit compilation means Compact contracts have constraints on loop bounds and dynamic data structures. Pool sizing and collection limits may need to be bounded at compile time. *Needs further research once Midnight mainnet stabilizes.*

**DePIN projects on Midnight:** None currently. Midnight is a new chain. Device staking deploys as part of the fry.farm DeFi suite, not because of existing DePIN NFTs. Future DePIN projects may launch on Midnight given its privacy features (e.g., private device health data).

**Auth:** Midnight uses a different wallet model (Lace or Midnight-native). Auth mechanism needs research — may involve ZK proofs of wallet ownership rather than standard signature verification. *Deferred until Midnight mainnet is stable.*

**Effort estimate:** 12-16 weeks (Compact learning curve + ZK circuit constraints + new toolchain)

---

## 4. Dead/Defunct Project NFT Staking

### 4.1 Rationale

Device staking explicitly supports NFTs from defunct/dead DePIN projects. This is a **feature, not an edge case**:

- Holders of otherwise worthless device NFTs can stake them in pools and earn rewards
- Pool creators (community members, DAOs, or fry.farm itself) can create pools that target dead project NFTs
- This gives residual value to NFTs that would otherwise sit inert in wallets
- Attracts users from dead project communities who still hold NFTs

### 4.2 Dead Project NFT Inventory

| Project | Status | Chain(s) with NFTs On-Chain | NFT Type | Notes |
|---------|--------|---------------------------|----------|-------|
| **Wayru** | Shut down Dec 2025 | **Algorand**, **Solana** | WNode NFTs | Network operator NFTs. Company ceased operations but NFTs remain on-chain and transferable. |
| *Others* | *Needs research* | *Various* | *Various* | As DePIN projects fail, their device NFTs persist on-chain. This inventory should be maintained as new dead projects are identified. |

### 4.3 How Dead Project Staking Works

No special code is needed. The existing pool creation flow supports this natively:

1. Pool creator sets `acceptedCollections` to the dead project's NFT creator address (Algorand) or contract address (EVM/Solana)
2. Pool creator deposits reward tokens (could be FRY, ALGO, VOI, or any fungible token)
3. Holders of the dead project's NFTs stake them and earn rewards
4. The verifier cron confirms NFT ownership on the standard schedule

The only consideration is **metadata**: dead project APIs (for NFT images, names, traits) may be offline. The frontend should handle missing metadata gracefully — `nftCollectionService.ts` L100-128 already falls back to a default icon when Pera API returns no metadata.

### 4.4 Per-Chain Dead Project Targeting

When device staking deploys to a new chain, the launch should include an inventory of known dead DePIN project NFTs on that chain as potential staking targets:

- **Algorand:** Wayru WNode NFTs (live today)
- **Solana:** Wayru WNode NFTs (stakeable at Solana launch)
- **EVM:** None currently identified; monitor for future dead projects on Base/Arbitrum/Polygon
- **Midnight:** N/A (new chain, no existing projects)

---

## 5. Adapter Interface Definitions

### 5.1 Backend: ChainAdapter Interface

```typescript
interface ChainAdapter {
  readonly chainId: string;       // e.g., 'algorand-mainnet', 'voi-mainnet', 'solana-mainnet'
  readonly chainType: string;     // e.g., 'algorand', 'solana', 'evm'

  // --- Indexer / RPC queries ---
  validateAssetExists(assetId: string): Promise<AssetInfo>;
  validateCreatorAccount(address: string): Promise<AccountInfo>;
  verifyNftOwnership(wallet: string, nftId: string): Promise<boolean>;
  getAssetDetails(nftId: string): Promise<AssetDetails>;
  getWalletAssets(wallet: string): Promise<Asset[]>;
  getAccountInfo(wallet: string): Promise<AccountInfo>;

  // --- Requirement checks (chain-specific parts) ---
  getTokenBalance(wallet: string, tokenId: string): Promise<bigint>;
  getNftsByCreator(wallet: string, creatorAddress: string): Promise<Asset[]>;
  getBlockTimestamp(blockRef: string | number): Promise<number>;
  getWalletAge(wallet: string): Promise<{ createdAtRound: number; timestamp: number }>;

  // --- Transaction building (verifier cron) ---
  buildVerificationTx(params: VerificationTxParams): Promise<SignedTransaction>;
  submitTransaction(signedTx: SignedTransaction): Promise<string>; // returns txId

  // --- Health ---
  healthCheck(): Promise<boolean>;
}
```

### 5.2 Backend: AuthStrategy Interface

```typescript
interface AuthStrategy {
  readonly chainType: string;

  validateAddress(address: string): boolean;
  generateChallenge(wallet: string): Promise<AuthChallenge>;
  verifySignature(params: VerifyParams): Promise<{ wallet: string; verified: boolean }>;
}

// --- Per-chain implementations ---

// AlgorandAuthStrategy: zero-ALGO payment tx with nonce in note → simulateTransactions
// VoiAuthStrategy extends AlgorandAuthStrategy (same mechanism, different node)
// SolanaAuthStrategy: signMessage → nacl.sign.detached.verify
// EvmAuthStrategy: personal_sign (EIP-191) → ecrecover
// MidnightAuthStrategy: TBD (ZK proof or Compact-native signing)
```

### 5.3 Backend: ChainAdapterFactory

```typescript
// Loaded once at startup based on CHAIN_ID env var
function createChainAdapter(chainId: string): ChainAdapter {
  switch (chainId) {
    case 'algorand-mainnet':
    case 'algorand-testnet':
      return new AlgorandAdapter(chainId);
    case 'voi-mainnet':
    case 'voi-testnet':
      return new VoiAdapter(chainId);     // extends AlgorandAdapter
    case 'solana-mainnet':
    case 'solana-devnet':
      return new SolanaAdapter(chainId);
    case 'evm-base':
    case 'evm-arbitrum':
    case 'evm-polygon':
      return new EvmAdapter(chainId);
    case 'midnight-mainnet':
      return new MidnightAdapter(chainId);
    default:
      throw new Error(`Unsupported chain: ${chainId}`);
  }
}

// Singleton, injected into services
const adapter = createChainAdapter(process.env.CHAIN_ID);
```

### 5.4 Frontend: ChainAdapter Interface

```typescript
interface FrontendChainAdapter {
  readonly chainId: string;
  readonly chainType: string;

  // --- On-chain operations (replace device_staking_func.ts) ---
  createPool(params: CreatePoolParams, signer: WalletSigner): Promise<TxResult>;
  stakeDevice(params: StakeParams, signer: WalletSigner): Promise<TxResult>;
  unstakeDevice(params: UnstakeParams, signer: WalletSigner): Promise<TxResult>;
  claimRewards(params: ClaimParams, signer: WalletSigner): Promise<TxResult>;
  depositRewards(params: DepositParams, signer: WalletSigner): Promise<TxResult>;
  calculatePendingRewards(params: PendingRewardsParams): Promise<bigint>;

  // --- Pool admin ---
  pausePool(appId: string, signer: WalletSigner): Promise<TxResult>;
  resumePool(appId: string, signer: WalletSigner): Promise<TxResult>;
  setVerifier(appId: string, verifier: string, signer: WalletSigner): Promise<TxResult>;

  // --- NFT queries (replace nftCollectionService.ts) ---
  getUserNfts(wallet: string): Promise<NftInfo[]>;
  getNftMetadata(nftId: string): Promise<NftMetadata>;
  filterEligibleNfts(nfts: NftInfo[], pool: DevicePool): NftInfo[];

  // --- Wallet info ---
  getWalletProvider(): WalletProvider;  // Pera, Kibisis, Phantom, MetaMask, etc.
}
```

### 5.5 Frontend: AuthAdapter Interface

```typescript
interface FrontendAuthAdapter {
  readonly chainType: string;

  // Replace AuthService.ts chain-specific logic
  createSignableChallenge(
    wallet: string,
    nonce: string,
    signer: WalletSigner
  ): Promise<SignedChallenge>;

  // Returns base64-encoded signed proof to send to backend
  encodeProof(signed: SignedChallenge): string;
}

// AlgorandAuthAdapter: makePaymentTxn → sign → base64
// VoiAuthAdapter extends AlgorandAuthAdapter
// SolanaAuthAdapter: encode nonce as Uint8Array → signMessage → base64
// EvmAuthAdapter: personal_sign(nonce message) → hex signature
```

---

## 6. Codebase Structure & File Tree

### 6.1 Backend Structure (After Phase 0)

```
backend/
├── adapters/
│   ├── index.js                    # ChainAdapterFactory + singleton export
│   ├── ChainAdapter.js             # Base class / interface
│   ├── AlgorandAdapter.js          # Current Algorand logic extracted here
│   ├── VoiAdapter.js               # extends AlgorandAdapter (override endpoints)
│   ├── SolanaAdapter.js            # DAS API + @solana/web3.js
│   ├── EvmAdapter.js               # ethers.js, per-chain config
│   └── MidnightAdapter.js          # Compact SDK (future)
│
├── auth/
│   ├── AuthStrategyFactory.js      # Creates auth strategy from chainType
│   ├── AlgorandAuth.js             # Current authRoutes verify logic
│   ├── VoiAuth.js                  # extends AlgorandAuth
│   ├── SolanaAuth.js               # nacl.sign.detached.verify
│   ├── EvmAuth.js                  # ecrecover
│   └── MidnightAuth.js             # TBD
│
├── services/
│   ├── devicePoolService.js        # Refactored: calls adapter.validateAssetExists() etc.
│   ├── requirementCheckerService.js # Refactored: calls adapter.getTokenBalance() etc.
│   └── algodService.js             # Renamed → nodeService.js, wraps adapter.healthCheck()
│
├── crons/
│   └── deviceVerificationCron.js   # Refactored: calls adapter.verifyNftOwnership() + adapter.buildVerificationTx()
│
├── routes/
│   └── authRoutes.js               # Refactored: delegates to AuthStrategy
│
├── models/                         # No changes needed
│   ├── devicePoolSchema.js
│   ├── devicePositionSchema.js
│   └── walletLinkSchema.js
│
├── config/
│   └── chains.js                   # Per-chain endpoint configs (RPC URLs, indexer URLs, explorer URLs)
│
└── app.js                          # Reads CHAIN_ID, initializes adapter singleton
```

### 6.2 Frontend Structure (After Phase 0)

```
frontend/src/
├── adapters/
│   ├── index.ts                     # ChainAdapterFactory + React Context provider
│   ├── ChainAdapter.ts              # Interface definition
│   ├── AuthAdapter.ts               # Auth interface definition
│   ├── algorand/
│   │   ├── AlgorandChainAdapter.ts  # Current device_staking_func.ts logic
│   │   ├── AlgorandAuthAdapter.ts   # Current AuthService.ts chain logic
│   │   └── AlgorandNftService.ts    # Current nftCollectionService.ts logic
│   ├── voi/
│   │   ├── VoiChainAdapter.ts       # extends AlgorandChainAdapter
│   │   ├── VoiAuthAdapter.ts        # extends AlgorandAuthAdapter
│   │   └── VoiNftService.ts         # extends AlgorandNftService (different URLs)
│   ├── solana/
│   │   ├── SolanaChainAdapter.ts    # Anchor client + wallet adapter
│   │   ├── SolanaAuthAdapter.ts     # signMessage
│   │   └── SolanaNftService.ts      # DAS API (Helius) + Metaplex
│   ├── evm/
│   │   ├── EvmChainAdapter.ts       # ethers.js contract interactions
│   │   ├── EvmAuthAdapter.ts        # personal_sign
│   │   └── EvmNftService.ts         # ownerOf / balanceOf calls
│   └── midnight/
│       ├── MidnightChainAdapter.ts  # Compact SDK (future)
│       ├── MidnightAuthAdapter.ts   # TBD
│       └── MidnightNftService.ts    # TBD
│
├── services/
│   ├── deviceStakingApi.ts          # No changes (chain-agnostic REST)
│   ├── AuthService.ts               # Refactored: delegates to AuthAdapter
│   └── apiClient.ts                 # No changes
│
├── device_staking_func.ts           # Deleted after extraction → adapters/algorand/
├── types/
│   └── deviceStaking.ts             # No changes (already multi-chain)
│
├── .env.algorand                    # VITE_CHAIN_ID=algorand-mainnet, VITE_ALGOD_SERVER=...
├── .env.voi                         # VITE_CHAIN_ID=voi-mainnet, VITE_ALGOD_SERVER=mainnet-api.voi.nodely.dev
├── .env.solana                      # VITE_CHAIN_ID=solana-mainnet, VITE_SOLANA_RPC=...
├── .env.evm-base                    # VITE_CHAIN_ID=evm-base, VITE_EVM_RPC=...
└── .env.evm-arbitrum                # VITE_CHAIN_ID=evm-arbitrum, VITE_EVM_RPC=...
```

### 6.3 Smart Contracts

```
contracts/
├── algorand/
│   └── device_staking/              # Existing TEAL/PyTeal contract (unchanged)
│       ├── contract.py
│       └── artifacts/
├── solana/
│   └── device_staking/              # New Anchor program
│       ├── Anchor.toml
│       ├── programs/
│       │   └── device_staking/
│       │       └── src/lib.rs
│       └── tests/
├── evm/
│   └── device_staking/              # New Solidity contract
│       ├── hardhat.config.ts
│       ├── contracts/
│       │   └── DeviceStaking.sol
│       └── test/
└── midnight/
    └── device_staking/              # Future Compact contract
        └── src/
```

---

## 7. Migration Path

### 7.1 Dormant Fields That Activate

These existing schema fields require no migration — they simply start receiving non-default values:

| Field | Current State | Activated By |
|-------|--------------|-------------|
| `devicePoolSchema.chainId` | Always `'algorand-mainnet'` | Setting `CHAIN_ID=voi-mainnet` on backend instance |
| `devicePoolSchema.chainType` | Always `'algorand'` | `createPool` sets `chainType` from adapter |
| `devicePoolSchema.acceptedCollections[].identifiers.contractAddress` | Always `''` | EVM pools set this to the NFT contract address |
| `devicePoolSchema.acceptedCollections[].identifiers.evmChainId` | Always `0` | EVM pools set this (e.g., `8453` for Base) |
| `devicePoolSchema.acceptedCollections[].identifiers.collectionAddress` | Always `''` | Solana pools set this to the collection mint |
| `devicePositionSchema.deviceChainId` | Always `'algorand-mainnet'` | Set from pool's `chainId` at stake time |
| `walletLinkSchema.links[]` | Empty array | Populated when user links an EVM/Solana wallet to their Algorand wallet |

### 7.2 Schema Changes Required

**Add `chainType` to enum for new chains:**

Current enum: `['algorand', 'evm', 'solana', 'cosmos']`

Add: `'midnight'` (when Midnight ships)

No migration script needed — Mongoose enum validation is additive.

**Add `voi` to `chainType`?** No — Voi is AVM-compatible, so `chainType: 'algorand'` is correct. Differentiation is via `chainId: 'voi-mainnet'` vs `'algorand-mainnet'`.

### 7.3 Files to Refactor (Phase 0)

| File | Current | After Refactor |
|------|---------|---------------|
| `backend/services/devicePoolService.js` | 4 hardcoded Indexer calls | Calls `adapter.validateAssetExists()`, `adapter.verifyNftOwnership()`, etc. |
| `backend/services/requirementCheckerService.js` | 7 hardcoded Indexer calls | Calls `adapter.getTokenBalance()`, `adapter.getNftsByCreator()`, `adapter.getBlockTimestamp()`, etc. |
| `backend/crons/deviceVerificationCron.js` | Hardcoded Indexer + `algosdk.makeApplicationCallTxnFromObject` | Calls `adapter.verifyNftOwnership()` + `adapter.buildVerificationTx()` |
| `backend/services/algodService.js` | 3 hardcoded Algorand nodes | Becomes `nodeService.js`; adapter handles node selection and fallback |
| `backend/routes/authRoutes.js` | Hardcoded `algosdk.decodeSignedTransaction` + `simulateTransactions` | Calls `authStrategy.validateAddress()`, `authStrategy.verifySignature()` |
| `frontend/src/device_staking_func.ts` | 15 functions with algosdk/algokit | Extracted to `adapters/algorand/AlgorandChainAdapter.ts` |
| `frontend/src/services/nftCollectionService.ts` | Hardcoded Indexer + Pera API URLs | Extracted to `adapters/algorand/AlgorandNftService.ts` |
| `frontend/src/services/AuthService.ts` | `algosdk.makePaymentTxnWithSuggestedParamsFromObject` | Delegates to `AuthAdapter.createSignableChallenge()` |

### 7.4 Docker Compose Changes

```yaml
# Current: single backend service
# After: per-chain backend services

services:
  backend-algorand:
    build: ./backend
    environment:
      - CHAIN_ID=algorand-mainnet
      - VERIFIER_MNEMONIC=${ALGO_VERIFIER_MNEMONIC}
    ports:
      - "3001:3001"

  backend-voi:
    build: ./backend
    environment:
      - CHAIN_ID=voi-mainnet
      - VERIFIER_MNEMONIC=${VOI_VERIFIER_MNEMONIC}
    ports:
      - "3002:3001"

  backend-solana:
    build: ./backend
    environment:
      - CHAIN_ID=solana-mainnet
      - VERIFIER_KEYPAIR=${SOLANA_VERIFIER_KEYPAIR}
      - SOLANA_RPC_URL=${SOLANA_RPC_URL}
      - DAS_API_URL=${DAS_API_URL}
    ports:
      - "3003:3001"

  # Nginx routes /api/algorand/* → backend-algorand, /api/voi/* → backend-voi, etc.
  # Or: separate subdomains (algo.fry.farm, voi.fry.farm, sol.fry.farm)
```

---

## 8. Implementation Phases & Task Lists

### Phase 0: Adapter Extraction (2-3 weeks)

**Goal:** Refactor current Algorand-only code into the adapter pattern. Zero functionality change. All existing tests pass.

**Backend tasks:**

- [ ] Create `backend/adapters/ChainAdapter.js` base class with interface methods
- [ ] Create `backend/adapters/AlgorandAdapter.js`:
  - Extract Indexer calls from `devicePoolService.js` (L8, L15, L22, L95, L106)
  - Extract Indexer calls from `requirementCheckerService.js` (L12, L28, L45, L74, L82, L91, L116, L214)
  - Extract Indexer + algosdk from `deviceVerificationCron.js` (L9, L37, L69, L142-158)
  - Extract node management from `algodService.js` (L4-23, L27, L36-68)
- [ ] Create `backend/adapters/index.js` — factory + singleton, reads `CHAIN_ID` env var
- [ ] Create `backend/auth/AlgorandAuth.js` — extract from `authRoutes.js` (L36, L76-77, L94-102)
- [ ] Create `backend/auth/AuthStrategyFactory.js`
- [ ] Refactor `devicePoolService.js` — replace 4 Indexer calls with adapter methods
- [ ] Refactor `requirementCheckerService.js` — replace 7 Indexer calls with adapter methods
- [ ] Refactor `deviceVerificationCron.js` — replace Indexer + tx building with adapter methods
- [ ] Refactor `algodService.js` → `nodeService.js` — delegate to adapter
- [ ] Refactor `authRoutes.js` — delegate to auth strategy
- [ ] Add `CHAIN_ID=algorand-mainnet` to current `.env` / docker-compose
- [ ] Create `backend/config/chains.js` — centralized endpoint config
- [ ] Verify all existing functionality unchanged (manual test + existing tests)

**Frontend tasks:**

- [ ] Create `frontend/src/adapters/ChainAdapter.ts` interface
- [ ] Create `frontend/src/adapters/AuthAdapter.ts` interface
- [ ] Create `frontend/src/adapters/algorand/AlgorandChainAdapter.ts` — extract from `device_staking_func.ts` (all 15 functions)
- [ ] Create `frontend/src/adapters/algorand/AlgorandAuthAdapter.ts` — extract from `AuthService.ts` (L100-108)
- [ ] Create `frontend/src/adapters/algorand/AlgorandNftService.ts` — extract from `nftCollectionService.ts` (L4-5, L33, L43, L100)
- [ ] Create `frontend/src/adapters/index.ts` — factory + React Context provider
- [ ] Refactor `AuthService.ts` — delegate chain-specific logic to `AuthAdapter`
- [ ] Refactor components to get adapter from Context (not direct import of `device_staking_func`)
- [ ] Remove `device_staking_func.ts` (replaced by adapter)
- [ ] Create `.env.algorand` (copy of current `.env`)
- [ ] Verify all existing functionality unchanged

**Estimated effort:** 2-3 weeks

---

### Phase 1: Voi (2-3 weeks, after Phase 0)

**Goal:** Deploy device staking on Voi. Extends Algorand adapter — minimal new code.

**Smart contract tasks:**

- [ ] Deploy existing TEAL bytecode to Voi mainnet (same ABI, same opcodes)
- [ ] Verify contract behavior on Voi testnet first
- [ ] Fund verifier account on Voi with VOI for tx fees

**Backend tasks:**

- [ ] Create `backend/adapters/VoiAdapter.js extends AlgorandAdapter`:
  - Override `INDEXER_BASE` → `https://mainnet-idx.voi.nodely.dev`
  - Override Algod nodes → `https://mainnet-api.voi.nodely.dev`
  - Override any Algorand-mainnet-specific asset IDs (e.g., FRY token ID not relevant on Voi)
- [ ] Create `backend/auth/VoiAuth.js extends AlgorandAuth` (override node endpoint)
- [ ] Add `voi-mainnet` to `config/chains.js`
- [ ] Add `backend-voi` service to `docker-compose.yml`
- [ ] Set up VOI verifier mnemonic in secrets
- [ ] Test full flow: create pool → stake → verify → claim → unstake

**Frontend tasks:**

- [ ] Create `frontend/src/adapters/voi/VoiChainAdapter.ts extends AlgorandChainAdapter`:
  - Override Algod config → Voi Nodely endpoints
  - Override wallet provider → Kibisis
- [ ] Create `frontend/src/adapters/voi/VoiAuthAdapter.ts extends AlgorandAuthAdapter`
- [ ] Create `frontend/src/adapters/voi/VoiNftService.ts extends AlgorandNftService`:
  - Override `INDEXER_URL` → `https://mainnet-idx.voi.nodely.dev`
  - Override metadata API (Pera may not support Voi → needs research on Voi NFT metadata API)
- [ ] Create `.env.voi` with Voi-specific endpoints
- [ ] Integrate Kibisis wallet (Use Wallet library may already support Voi — needs research)
- [ ] Build and deploy `voi.fry.farm` (or equivalent subdomain)

**Estimated effort:** 2-3 weeks

---

### Phase 2: Solana (8-12 weeks, can start after Phase 0)

**Goal:** Deploy device staking on Solana with DAS API support for Helium cNFTs and dead project NFTs.

**Smart contract tasks:**

- [ ] Set up Anchor project (`contracts/solana/device_staking/`)
- [ ] Implement program instructions:
  - `initialize_pool` — create pool PDA with config
  - `stake_device` — transfer NFT to escrow PDA, create position PDA
  - `unstake_device` — return NFT, close position PDA
  - `claim_rewards` — calculate + transfer SPL reward tokens
  - `deposit_rewards` — pool creator deposits SPL reward tokens
  - `update_verification` — verifier-only, attests device ownership (for cNFTs)
  - `pause_pool` / `resume_pool` — admin controls
  - `set_verifier` — update verifier pubkey
- [ ] Handle cNFT staking (cannot transfer to escrow — attestation-only model):
  - cNFTs stay in user's wallet
  - `stake_cnft` records the asset ID + ownership proof in position PDA
  - Verifier cron re-checks via DAS API on schedule
  - If ownership lost, verifier calls `invalidate_cnft_stake`
- [ ] Write Anchor tests (Bankrun or local validator)
- [ ] Deploy to Solana devnet → testnet → mainnet-beta
- [ ] Security audit (scope TBD)

**Backend tasks:**

- [ ] Create `backend/adapters/SolanaAdapter.js`:
  - Uses `@solana/web3.js` for RPC calls
  - DAS API integration (Helius) for cNFT ownership verification
  - Standard `getTokenAccountsByOwner` for SPL NFT verification
  - Transaction building with `@coral-xyz/anchor`
  - Verifier keypair loading (from env, not mnemonic — Solana uses base58 keypairs)
- [ ] Create `backend/auth/SolanaAuth.js`:
  - `validateAddress`: base58 pubkey validation
  - `verifySignature`: `nacl.sign.detached.verify` with nonce message
- [ ] Add `solana-mainnet` to `config/chains.js`:
  - RPC endpoints (Helius primary, Triton fallback)
  - DAS API endpoint
  - Program ID (deployed contract address)
- [ ] Implement cNFT verification in verifier cron:
  - `getAsset(assetId)` — confirm asset exists and get current owner
  - `getAssetsByOwner(wallet)` — confirm wallet still holds the cNFT
  - If ownership changed, call `invalidate_cnft_stake` instruction
- [ ] Add `backend-solana` service to `docker-compose.yml`
- [ ] Test with Helium cNFTs on devnet (mock DAS responses) and mainnet

**Frontend tasks:**

- [ ] Create `frontend/src/adapters/solana/SolanaChainAdapter.ts`:
  - Anchor client for program interactions
  - PDA derivation for user positions
  - SPL token transfer for standard NFTs
  - cNFT staking (no transfer — record-only)
- [ ] Create `frontend/src/adapters/solana/SolanaAuthAdapter.ts`:
  - `signMessage` via Solana wallet adapter
  - Encode as base64 for backend
- [ ] Create `frontend/src/adapters/solana/SolanaNftService.ts`:
  - DAS API `getAssetsByOwner` for cNFTs
  - `getParsedTokenAccountsByOwner` for standard NFTs
  - Metadata from DAS API (includes name, image, attributes)
- [ ] Create `.env.solana` with Solana-specific config
- [ ] Integrate Solana wallet adapter (Phantom, Solflare, Backpack)
- [ ] Build and deploy `sol.fry.farm`

**Estimated effort:** 8-12 weeks

---

### Phase 3: EVM (6-8 weeks, can start after Phase 0)

**Goal:** Deploy device staking on Base and Arbitrum. Single Solidity contract deployed to each chain.

**Smart contract tasks:**

- [ ] Set up Hardhat project (`contracts/evm/device_staking/`)
- [ ] Implement `DeviceStaking.sol`:
  - `createPool(poolId, rewardToken, collections[])` — initialize pool
  - `stakeDevice(poolId, nftContract, tokenId)` — `transferFrom` NFT to contract
  - `unstakeDevice(poolId, nftContract, tokenId)` — return NFT
  - `claimRewards(poolId)` — ERC-20 transfer of accrued rewards
  - `depositRewards(poolId, amount)` — pool creator deposits ERC-20 reward tokens
  - `updateVerification(poolId, staker, verified)` — verifier-only attestation
  - `pausePool(poolId)` / `resumePool(poolId)` — admin controls
  - Pool state: mapping of poolId → PoolConfig, nested mapping for staker positions
  - Reentrancy guard on stake/unstake/claim (OpenZeppelin `ReentrancyGuard`)
  - `onERC721Received` — contract must implement IERC721Receiver
- [ ] Write Hardhat tests
- [ ] Deploy to Base Sepolia + Arbitrum Sepolia (testnets)
- [ ] Deploy to Base mainnet + Arbitrum mainnet
- [ ] Security audit

**Backend tasks:**

- [ ] Create `backend/adapters/EvmAdapter.js`:
  - Uses `ethers.js` v6 (or `viem`)
  - Per-chain RPC config (Base, Arbitrum, Polygon)
  - `verifyNftOwnership`: `nftContract.ownerOf(tokenId)` for ERC-721; `balanceOf(owner, id)` for ERC-1155
  - `validateAssetExists`: check contract code at address + `supportsInterface(0x80ac58cd)` for ERC-721
  - Transaction building: ethers Contract instance with verifier wallet signer
  - Gas estimation + submission
- [ ] Create `backend/auth/EvmAuth.js`:
  - `validateAddress`: `ethers.isAddress()`
  - `verifySignature`: `ethers.verifyMessage(nonce, signature)` → compare recovered address
- [ ] Add `evm-base`, `evm-arbitrum` to `config/chains.js`:
  - RPC endpoints, contract addresses, chain IDs, block explorers
- [ ] Add `backend-evm-base`, `backend-evm-arbitrum` services to `docker-compose.yml`
  - Or: single `backend-evm` with `CHAIN_ID` selecting which EVM chain
- [ ] Test with DIMO NFTs (Base) and WeatherXM NFTs (Arbitrum)

**Frontend tasks:**

- [ ] Create `frontend/src/adapters/evm/EvmChainAdapter.ts`:
  - ethers.js Contract instance for DeviceStaking.sol
  - ERC-721 `approve` + `stakeDevice` flow (two-step: approve then stake)
  - Gas estimation UI
- [ ] Create `frontend/src/adapters/evm/EvmAuthAdapter.ts`:
  - `personal_sign` via ethers.js signer
  - Hex signature encoding
- [ ] Create `frontend/src/adapters/evm/EvmNftService.ts`:
  - `ownerOf` calls for ERC-721 enumeration (or use an indexing API like Alchemy NFT API)
  - Metadata from `tokenURI` → IPFS/HTTP fetch
- [ ] Create `.env.evm-base`, `.env.evm-arbitrum`
- [ ] Integrate WalletConnect / MetaMask / Coinbase Wallet (via wagmi/RainbowKit or similar)
- [ ] Build and deploy `base.fry.farm`, `arb.fry.farm`

**Estimated effort:** 6-8 weeks

---

### Phase 4: Midnight (12-16 weeks, starts when Midnight mainnet is stable)

**Goal:** Deploy device staking on Midnight. Ships with the full fry.farm DeFi suite.

**Smart contract tasks:**

- [ ] Learn Compact language and ZK circuit constraints
- [ ] Design contract state model:
  - Public state: pool config, staked device list, verification status
  - Decision: reward balances public or private? (privacy vs transparency tradeoff)
- [ ] Implement Compact contract:
  - Bounded pool sizes (ZK circuits require known loop bounds)
  - State transitions for stake/unstake/claim/verify
- [ ] Test on Midnight testnet
- [ ] Deploy to Midnight mainnet

**Backend tasks:**

- [ ] Create `backend/adapters/MidnightAdapter.js`:
  - Midnight SDK for state queries and tx submission
  - ZK proof verification (if applicable to verifier cron)
- [ ] Create `backend/auth/MidnightAuth.js`:
  - Research Midnight wallet signing (Lace wallet or Midnight-native)
  - Implement auth strategy once mechanism is clear
- [ ] Add `midnight-mainnet` to `config/chains.js`
- [ ] Add `backend-midnight` service to `docker-compose.yml`

**Frontend tasks:**

- [ ] Create `frontend/src/adapters/midnight/MidnightChainAdapter.ts`
- [ ] Create `frontend/src/adapters/midnight/MidnightAuthAdapter.ts`
- [ ] Create `frontend/src/adapters/midnight/MidnightNftService.ts`
- [ ] Create `.env.midnight`
- [ ] Integrate Midnight wallet (Lace or Midnight-native)
- [ ] Build and deploy `midnight.fry.farm`

**Estimated effort:** 12-16 weeks

**Open questions (needs research):**
- Midnight mainnet launch date — confirmed late March 2026? May slip.
- Compact contract size/complexity limits for device staking use case
- Midnight NFT standard (does one exist yet?)
- Midnight wallet auth mechanism
- Midnight block explorer / indexer availability

---

## 9. Timeline Visualization

```
2026
Week:  W13  W14  W15  W16  W17  W18  W19  W20  W21  W22  W23  W24  W25  W26  W27  W28  W29  W30
       Mar                 Apr                 May                 Jun                 Jul

Phase 0: Adapter Extraction
       |████████████████████|
       W13              W15

Phase 1: Voi
                        |████████████████████|
                        W16              W18

Phase 2: Solana (can overlap with Phase 1 after Phase 0)
                        |████████████████████████████████████████████████████████████████|
                        W16                                                          W27

Phase 3: EVM (can overlap with Phase 2 after Phase 0)
                                    |████████████████████████████████████████████|
                                    W18                                      W25

Phase 4: Midnight (starts when mainnet is stable)
                                                                |████████████████████████████████████████████████████████████████████|
                                                                W22                                                              W37 (Sep)
                                                                ▲
                                                                │ Midnight mainnet
                                                                │ must be stable
                                                                │ before starting
```

**Key milestones:**

| Milestone | Target | Dependencies |
|-----------|--------|-------------|
| Phase 0 complete — adapters extracted, Algorand unchanged | ~W15 (early Apr) | None |
| Voi device staking live | ~W18 (late Apr) | Phase 0 + Voi contract deploy |
| Solana devnet working | ~W22 (late May) | Phase 0 + Anchor program |
| EVM testnet working | ~W22 (late May) | Phase 0 + Solidity contract |
| Solana mainnet live | ~W27 (early Jul) | Solana devnet + audit |
| EVM mainnet live (Base + Arbitrum) | ~W25 (mid Jun) | EVM testnet + audit |
| Midnight mainnet live | ~W37 (Sep) | Midnight mainnet stable + Compact contract |

**Parallelism:** Phases 1, 2, and 3 can run concurrently after Phase 0 completes. Phase 4 is decoupled and starts when Midnight mainnet stabilizes, regardless of other phases.

**Priority is driven by Fry Networks' cross-chain DeFi strategy, not DePIN project availability.** Device staking deploys alongside the full fry.farm DeFi suite (token staking, LP farming, swap, prediction markets, events) on each chain.

---

*End of design document.*
