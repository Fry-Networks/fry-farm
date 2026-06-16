/**
 * V2 staking pool App IDs that route claims through the backend API
 * instead of the smart contract's claimTokens method.
 *
 * These 6 pools were deployed with a contract that has a bug where
 * claimTokens resets stake_time unconditionally. Future pools deployed
 * with the fixed contract use normal on-chain claims.
 */
export const BACKEND_CLAIM_POOL_IDS: number[] = [
  3465579498,
  3468848937,
  3470020844,
  3476263283,
  3469720617,
  3476263325,
];

export function usesBackendClaim(appId: number | string): boolean {
  return BACKEND_CLAIM_POOL_IDS.includes(Number(appId));
}
