export interface AlphaArcadeMarket {
  marketAppId: number
  title: string
  categories: string[]
  image: string
  endTs: number
  yesAssetId: number
  noAssetId: number
  yesProb: number
  noProb: number
  twentyFourHrVolume: number
  volume: number
  id: string
  slug: string
  featured: boolean
  source: string
  createdAt: number
  rewardsSpreadDistance?: number
  fees?: number
  totalPregameRewards?: number
  lpRewardCompetitionWalletCount?: number
  lastRewardAmount?: number
  lastRewardTs?: number
  rewardsMinContracts?: number
}

export interface AlphaArcadePool {
  _id: string
  creatorId: string
  marketAppId: number
  matcherAppId: number
  marketQuestion: string
  marketCategory: string
  marketImageUrl: string
  marketResolutionTime: number
  yesAsaId: number
  noAsaId: number
  usdcAsaId: number
  spreadBps: number
  rewardToken: { id: string; name: string }
  rewardTokenAmount: number
  totalProviders: number
  totalUsdcDeposited: number
  isActive: boolean
  isResolved: boolean
  resolutionOutcome: 'yes' | 'no' | null
  createdAt: string
  isRewardMarket?: boolean
  rewardData?: {
    spreadDistance: number
    fees: number
    lastRewardAmount: number
    lastRewardTs: number
    minContracts: number
    lpCount: number
  }
  aprDisplay?: {
    spreadApr: number | null
    rewardApr: number | null
    combinedApr: number | null
    dataSource: string
    isRewardMarket: boolean
  }
  aprMeta?: {
    spreadBps: number
    totalLiquidityUsdc: number
    fryFarmTvlUsdc: number
    daysToResolution: number
    lastRewardAmount: number
    lastRewardTs: number
    rewardLpCount: number
    rewardsSpreadDistance: number
    rewardsMinContracts: number
    fees: number
  }
}

export interface AlphaArcadePosition {
  _id: string
  wallet: string
  poolId: string
  marketAppId: number
  usdcDeposited: number
  yesEscrowAppIds: number[]
  noEscrowAppIds: number[]
  spreadUsed: number
  entryMidPrice: number
  status: 'active' | 'pending_withdrawal' | 'withdrawing' | 'withdrawn' | 'auto_withdrawn' | 'resolved' | 'claimed'
  claimedAt?: string
  warningsSent?: { type: '48hr' | '24hr' | '6hr'; sentAt: string }[]
  usdcRecovered: number
  remainingYesTokens: number
  remainingNoTokens: number
  feesPaid?: {
    depositFee?: number
    withdrawFee?: number
  }
  createdAt: string
  updatedAt: string
}

export interface AlphaArcadeOrderbook {
  bids: { price: number; size: number }[]
  asks: { price: number; size: number }[]
  midPrice: number
}

export interface AlphaArcadeStats {
  tvl: number
  totalProviders: number
  totalPositions: number
  activePools: number
}

export interface BuildTxnResponse {
  unsignedTxns: string[]
  feeTxn?: string | null
  poolId: string
  pool: AlphaArcadePool
  fee?: number
  netAmount?: number
  feePercent?: number
  yesAsaId?: number
  noAsaId?: number
  marketAddress?: string
  spreadBps?: number
  midPrice?: number
  spreadOffset?: number
  marketAppId?: number
  positionId?: string
  outcome?: 'yes' | 'no'
}
