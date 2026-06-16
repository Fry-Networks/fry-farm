export interface DevicePool {
  appId: string
  creator: string
  name: string
  description: string
  imageUrl: string
  status: string
  stakingMode: 'escrow' | 'verified-hold'
  verifierAddress: string
  verificationIntervalMinutes: number
  verificationGracePeriod: number
  collectionCreator: string
  collectionMode: string
  whitelist: number[]
  acceptedCollections: AcceptedCollection[]
  rewardTokenId: number
  rewardToken: {
    id: number
    name: string
    symbol: string
    image: string
    decimals: number
  }
  rewardModel: string
  rewardPerDay: number
  dailyPoolReward: number
  apr: number
  valuePerNft: number
  rewardAmount: number
  depositFeeBps: number
  withdrawFeeBps: number
  claimFeeBps: number
  startDate: string | null
  endDate: string | null
  lockPeriod: number
  totalStaked: number
  totalStakers: number
  tags: string[]
  chainId: string
  chainType: string
  requirements: PoolRequirement[]
  boostMultipliers: BoostMultiplier[]
  announcementsEnabled: boolean
  gatedAccessEnabled: boolean
  gatedAccessLabel: string
  analytics: PoolAnalytics
  createdAt: string
}

export interface DevicePosition {
  _id: string
  poolAppId: string
  wallet: string
  deviceNftId: number
  deviceNftName: string
  deviceChainId: string
  stakingMode: string
  status: string
  stakeTime: string
  lastClaimTime: string | null
  lockExpiry: string | null
  lastVerificationTime: string | null
  lastVerificationResult: string | null
  consecutiveFailures: number
  requirementStatus: RequirementStatus[]
  allRequiredMet: boolean
  activeMultipliers: ActiveMultiplier[]
  effectiveMultiplier: number
  totalClaimed: number
  lastRewardsClaimed: number
  createdAt: string
  updatedAt: string
}

export interface AcceptedCollection {
  collectionId: string
  collectionName: string
  collectionImage: string
  chain: string
  identifiers: {
    creatorAddress?: string
    contractAddress?: string
    collectionAddress?: string
    evmChainId?: number
  }
}

export interface PoolRequirement {
  requirementId: string
  type: 'token_balance' | 'staking_position' | 'nft_holding' | 'multi_device' | 'wallet_age'
  label: string
  description: string
  params: Record<string, any>
  enforcement: 'required' | 'optional_boost'
}

export interface BoostMultiplier {
  multiplierId: string
  label: string
  description: string
  type: 'stake_duration' | 'token_balance' | 'device_count' | 'requirement_met'
  params: Record<string, any>
  stackable: boolean
  maxMultiplier: number
}

export interface PoolAnalytics {
  totalUniqueStakers?: number
  deviceTypeBreakdown?: Record<string, number>
  averageStakeDurationDays?: number
  retentionRate30d?: number
  lastAnalyticsUpdate?: string
}

export interface RequirementStatus {
  requirementId: string
  met: boolean
  lastChecked: string
  details: string
}

export interface ActiveMultiplier {
  multiplierId: string
  currentMultiplier: number
  lastChecked: string
  qualifyingDetails: string
}

export interface DeviceAnnouncement {
  _id: string
  poolAppId: string
  creator: string
  title: string
  body: string
  priority: 'normal' | 'urgent'
  expiresAt: string | null
  readBy: string[]
  createdAt: string
}

export interface CreatorAnalytics {
  pool: DevicePool
  statusBreakdown: Record<string, number>
  complianceRates: Record<string, number>
  multiplierDistribution: Record<string, number>
  totalClaimed: number
  stakerGrowth: Record<string, number>
}

export interface CreateDevicePoolPayload {
  appId: string
  creator: string
  name: string
  description?: string
  imageUrl?: string
  stakingMode: 'escrow' | 'verified-hold'
  verifierAddress?: string
  verificationIntervalMinutes?: number
  verificationGracePeriod?: number
  collectionCreator?: string
  collectionMode?: string
  whitelist?: number[]
  acceptedCollections?: AcceptedCollection[]
  rewardTokenId: number
  rewardToken?: {
    id: number
    name: string
    symbol: string
    image: string
    decimals: number
  }
  rewardModel: string
  rewardPerDay?: number
  dailyPoolReward?: number
  apr?: number
  valuePerNft?: number
  rewardAmount?: number
  depositFeeBps?: number
  withdrawFeeBps?: number
  claimFeeBps?: number
  startDate?: string | null
  endDate?: string | null
  lockPeriod?: number
  tags?: string[]
  requirements?: PoolRequirement[]
  boostMultipliers?: BoostMultiplier[]
  announcementsEnabled?: boolean
  gatedAccessEnabled?: boolean
  gatedAccessLabel?: string
}

export interface StakeDevicePayload {
  poolAppId: string
  deviceNftId: number
  deviceNftName?: string
}

export interface ClaimDevicePayload {
  poolAppId: string
  rewardClaimed: number
  txId: string
  feeAmount: number
}

export interface UnstakeDevicePayload {
  poolAppId: string
  deviceNftId: number
}

export interface CreateAnnouncementPayload {
  title: string
  body: string
  priority?: 'normal' | 'urgent'
  expiresAt?: string | null
}
