export interface NftStakingPool {
  _id: string
  appId: number
  creatorId: string
  poolName: string
  poolDescription: string
  poolImage: string
  collectionMode: number // 0 = creator_address, 1 = whitelist, 2 = both
  collectionCreator: string
  whitelistedAsaIds: number[]
  rewardTokenId: number
  rewardTokenName: string
  rewardTokenImage: string
  rewardModel: number // 0 = fixed, 1 = proportional, 2 = apr
  ratePerDay: number
  totalRewardPool: number
  aprRate: number
  valuePerNft: number
  nftValue: number
  poolEndTime: number
  lockPeriod: number
  isActive: boolean
  totalNftsStaked: number
  totalRewardBalance: number
  totalRewardsClaimed: number
  feeRecipient: string
  depositFeeBps: number
  withdrawFeeBps: number
  claimFeeBps: number
  createdAt: string
  updatedAt: string
}

export interface StakedNft {
  _id: string
  appId: number
  wallet: string
  asaId: number
  nftName: string
  nftImage: string
  stakeTime: number
  isStaked: boolean
  createdAt: string
}

export interface NftClaim {
  _id: string
  appId: number
  wallet: string
  rewardAmount: number
  rewardTokenId: number
  claimedAt: string
}

export interface NftPriceResult {
  asaId: number
  price: number
  source: string
}

export interface NftAsset {
  asaId: number
  name: string
  unitName: string
  creator: string
  total: number
  decimals: number
  url: string
  imageUrl: string
}

export interface NftMetadata {
  asaId: number
  name: string
  imageUrl: string
  traits: Record<string, string>[]
}

export interface CreateNftPoolPayload {
  appId: number
  creatorId: string
  name: string
  description: string
  imageUrl: string
  collectionMode: string
  collectionCreator: string
  whitelistedAsaIds: number[]
  rewardTokenId: number
  rewardModel: string
  ratePerDay: number
  totalRewardPool: number
  aprRate: number
  valuePerNft: number
  nftValueInRewardToken: number
  poolEndTime: number
  lockPeriod: number
  feeRecipient: string
  depositFeeBps: number
  withdrawFeeBps: number
  claimFeeBps: number
}

export interface StakeNftPayload {
  appId: number
  wallet: string
  asaId: number
  nftName: string
  nftImage: string
}

export interface UnstakeNftPayload {
  appId: number
  wallet: string
  asaId: number
}

export interface ClaimPayload {
  appId: number
  wallet: string
  rewardAmount: number
  rewardTokenId: number
}
