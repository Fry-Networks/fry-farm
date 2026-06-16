/**
 * Multi-chain configuration types for fry.farm
 *
 * ChainFamily groups chains by their underlying VM/SDK (avm, evm, solana, midnight).
 * ChainId uniquely identifies a specific network (algorand-mainnet, voi-mainnet, etc.).
 * For this release: only 'avm' family is implemented (Algorand + Voi).
 */

/** Chain families — determines which SDK, wallet providers, and tx builders to use */
export type ChainFamily = 'avm' | 'evm' | 'solana' | 'midnight';

/** Unique chain identifiers */
export type ChainId = 'algorand-mainnet' | 'voi-mainnet';

/** Default chain */
export const DEFAULT_CHAIN_ID: ChainId = 'algorand-mainnet';

/** Native asset definition */
export interface NativeAsset {
  name: string;
  symbol: string;
  decimals: number;
  /** ASA ID 0 for native ALGO/VOI, or token contract address for EVM/Solana */
  id: number | string;
}

/** DEX provider identifiers */
export type DexProvider =
  | 'folks-router' | 'vestige' | 'haystack' | 'tinyman' | 'pact'  // Algorand
  | 'nomadex' | 'humble' | 'snowball'                              // Voi
  ;

/** Wallet provider identifiers */
export type WalletProvider =
  | 'pera' | 'defly' | 'daffi' | 'exodus' | 'lute'  // Algorand
  | 'kibisis' | 'voi-wallet'                          // Voi
  ;

/** AVM-specific connection config (Algorand, Voi) */
export interface AvmChainConfig {
  algodServer: string;
  algodPort: number;
  algodToken: string;
  indexerServer: string;
  indexerPort: number;
  indexerToken: string;
}

/** EVM-specific connection config (future) */
export interface EvmChainConfig {
  rpcUrl: string;
  chainIdNumeric: number;
  blockExplorerApi?: string;
}

/** Stablecoin definition */
export interface StablecoinInfo {
  id: number | string;
  symbol: string;
  decimals: number;
}

/** Feature flags for conditional UI rendering */
export interface ChainFeatures {
  staking: boolean;
  farming: boolean;
  nftStaking: boolean;
  deviceStaking: boolean;
  swap: boolean;
  predictionLp: boolean;
  communityEvents: boolean;
  zap: boolean;
  p2pSwap: boolean;
  launches: boolean;
  drops: boolean;
}

/** Full chain configuration */
export interface ChainConfig {
  chainId: ChainId;
  displayName: string;
  family: ChainFamily;
  nativeAsset: NativeAsset;
  /** FRY token ID on this chain (null if not yet created) */
  fryTokenId: number | string | null;
  /** Stablecoin equivalent to USDC (null if unavailable) */
  usdcEquivalent: StablecoinInfo | null;
  /** Fee recipient wallet address (null if not configured) */
  feeRecipient: string | null;
  /** FeeRouter application ID for on-chain fee routing (null if not configured) */
  feeRouterAppId?: number | null;
  /** FeeRouter application address for on-chain fee routing (null if not configured) */
  feeRouterAddr?: string | null;
  /** Block explorer base URL */
  explorerBaseUrl: string;
  /** Available DEX providers on this chain */
  availableDexProviders: DexProvider[];
  /** Supported wallet providers on this chain */
  supportedWallets: WalletProvider[];
  /** Family-specific connection config */
  connection: AvmChainConfig | EvmChainConfig;
  /** Features available on this chain */
  features: ChainFeatures;
  /** Flat native-token fees when staking token has no LP */
  flatFeeNative?: {
    stake: number;
    unstake: number;
    claim: number;
  };
}

/** Type guard for AVM chains */
export function isAvmChain(config: ChainConfig): config is ChainConfig & { connection: AvmChainConfig } {
  return config.family === 'avm';
}

/** Type guard for EVM chains (future) */
export function isEvmChain(config: ChainConfig): config is ChainConfig & { connection: EvmChainConfig } {
  return config.family === 'evm';
}
