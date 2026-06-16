const Joi = require('joi');

const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      const messages = error.details.map(d => d.message);
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: messages,
      });
    }
    next();
  };
};

// Staking pool creation schema
const stakingSchema = Joi.object({
  creatorId: Joi.string().required(),
  stakeToken: Joi.object({
    id: Joi.string().required(),
    name: Joi.string().required(),
  }).required(),
  rewardToken: Joi.object({
    id: Joi.string().required(),
    name: Joi.string().required(),
  }).required(),
  stakingStartTime: Joi.number().required(),
  stakingEndTime: Joi.number().required(),
  stakingTime: Joi.number().default(0),
  duration: Joi.number().required(),
  aprRate: Joi.number().required(),
  rewardTokenAmount: Joi.number().required(),
  stakingContractId: Joi.string().required(),
  lockPeriod: Joi.number().required(),
  isGated: Joi.boolean().default(false),
  gateConfig: Joi.object({
    nftAsaId: Joi.number().default(0),
    nftCreatorAddress: Joi.string().allow('').default(''),
    collectionName: Joi.string().allow('').default(''),
    minNftCount: Joi.number().min(1).default(1),
    gateMessage: Joi.string().allow('').default('This pool requires an NFT to participate.'),
  }).default({}),
  contractVersion: Joi.number().default(1),
});

// Farming pool creation schema
const farmingSchema = Joi.object({
  creatorId: Joi.string().required(),
  lpToken: Joi.object({
    tokenA: Joi.string().required(),
    tokenB: Joi.string().required(),
  }).required(),
  rewardToken: Joi.object({
    id: Joi.string().required(),
    name: Joi.string().allow(''),
  }).required(),
  rewardTokenAmount: Joi.number().required(),
  farmStartTime: Joi.number().required(),
  farmEndTime: Joi.number().required(),
  duration: Joi.number().required(),
  lockPeriod: Joi.number().required(),
  farmEntryFee: Joi.number().required(),
  rewardDistributionRate: Joi.number().required(),
  rewardDistributionSchedule: Joi.number().required(),
  fryRewardFee: Joi.number().required(),
  aprRate: Joi.number().default(0),
  appId: Joi.number().required(),
  poolType: Joi.string().valid('lp', 'single').default('lp'),
  dexProvider: Joi.string().allow('').default(''),
  stakeTokenName: Joi.string().allow('').default(''),
  stakeTokenSymbol: Joi.string().allow('').default(''),
  rewardTokenName: Joi.string().allow('').default(''),
  rewardTokenSymbol: Joi.string().allow('').default(''),
  lpPairName: Joi.string().allow('').default(''),
  isGated: Joi.boolean().default(false),
  gateConfig: Joi.object({
    nftAsaId: Joi.number().default(0),
    nftCreatorAddress: Joi.string().allow('').default(''),
    collectionName: Joi.string().allow('').default(''),
    minNftCount: Joi.number().min(1).default(1),
    gateMessage: Joi.string().allow('').default('This pool requires an NFT to participate.'),
  }).default({}),
});

// Token creation schema
const tokenSchema = Joi.object({
  tokenId: Joi.number().required(),
  tokenName: Joi.string().required(),
  tokenSymbol: Joi.string().required(),
  tokenImage: Joi.string().required(),
}).unknown(true);

// Claim reward schema
const claimRewardSchema = Joi.object({
  walletId: Joi.string().required(),
  poolId: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
  rewardClaimed: Joi.number().min(0).required(),
  stakedAmount: Joi.number().min(0).required(),
  stakedTime: Joi.number().min(0).required(),
  feeTxId: Joi.string().allow('').optional(),
  feeAssetId: Joi.number().optional(),
});

// Claim farm reward schema
const claimFarmRewardSchema = Joi.object({
  walletId: Joi.string().required(),
  poolId: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
  rewardClaimed: Joi.number().min(0).required(),
  stakedAmount: Joi.number().min(0).required(),
  stakeStartTime: Joi.number().required(),
  claimTime: Joi.number().required(),
  feeTxId: Joi.string().allow('').optional(),
  feeAssetId: Joi.number().optional(),
});

// Withdraw schema
const withdrawSchema = Joi.object({
  tokens: Joi.number().min(0).required(),
  wallet: Joi.string().required(),
  poolId: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
  appId: Joi.number().required(),
  feeTxId: Joi.string().allow('').optional(),
  feeAssetId: Joi.number().optional(),
});

// Farming withdraw schema
const farmingWithdrawSchema = Joi.object({
  amount: Joi.number().required(),
  userWallet: Joi.string().required(),
  poolId: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
  farmingTokenId: Joi.string().required(),
  feeTxId: Joi.string().allow('').optional(),
  feeAssetId: Joi.number().optional(),
});

// Gas fee schema
const gasFeeSchema = Joi.object({
  appId: Joi.number().required(),
  userId: Joi.string().required(),
  gasAmount: Joi.number().required(),
  gasType: Joi.string().required(),
});

// Swap history schema
const swapHistorySchema = Joi.object({
  userId: Joi.string().required(),
  amount: Joi.number().required(),
  token1: Joi.object({
    id: Joi.string().required(),
    name: Joi.string().required(),
  }).required(),
  token2: Joi.object({
    id: Joi.string().required(),
    name: Joi.string().required(),
  }).required(),
  liquidityPoolId: Joi.string().required(),
  fee: Joi.number().required(),
});

// Staker data schema
const stakerDataSchema = Joi.object({
  walletId: Joi.string().required(),
  stakedAmount: Joi.number().min(0).required(),
  stakeTime: Joi.number().min(0).required(),
  poolId: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
  rewardClaimed: Joi.number().min(0).default(0),
  feeTxId: Joi.string().allow('').optional(),
  feeAssetId: Joi.number().optional(),
});

// Daily reward claim schema
const dailyRewardClaimSchema = Joi.object({
  wallet: Joi.string().optional(),
  fingerprint: Joi.string().required(),
  turnstileToken: Joi.string().optional(),
});

// Rewards config update schema (partial update)
const rewardsConfigUpdateSchema = Joi.object({
  isEnabled: Joi.boolean(),
  rewardSchedule: Joi.array().items(Joi.number()),
  minAlgoBalance: Joi.number().min(0),
  minFryBalance: Joi.number().min(0),
  minWalletAgeDays: Joi.number().min(0),
  maxClaimsPerIpPerDay: Joi.number().min(1),
  maxClaimsPerFingerprintPerDay: Joi.number().min(1),
  minOnChainScore: Joi.number().min(0),
  streakResetHours: Joi.number().min(1),
  claimCooldownHours: Joi.number().min(1),
  trustTierThresholds: Joi.array().items(Joi.number()).length(3),
  trustTierMultipliers: Joi.array().items(Joi.number()).length(4),
  baselineClaimsPerHour: Joi.number().min(1),
  yellowMultiplier: Joi.number().min(1),
  orangeMultiplier: Joi.number().min(1),
  redMultiplier: Joi.number().min(1),
  maxDailyClaimsAutoCap: Joi.number().min(1),
  minTreasuryBalance: Joi.number().min(0),
  alertWebhookUrl: Joi.string().allow(''),
  adminWallets: Joi.array().items(Joi.string()),
  fryAsaId: Joi.number(),
  indexerUrl: Joi.string(),
}).min(1);

// Fee config update schema (partial update)
const feeConfigUpdateSchema = Joi.object({
  stakingDepositFeePercent: Joi.number().min(0).max(50),
  stakingWithdrawFeePercent: Joi.number().min(0).max(50),
  stakingClaimFeePercent: Joi.number().min(0).max(50),
  farmingDepositFeePercent: Joi.number().min(0).max(50),
  farmingWithdrawFeePercent: Joi.number().min(0).max(50),
  farmingClaimFeePercent: Joi.number().min(0).max(50),
  alphaArcadeDepositFeePercent: Joi.number().min(0).max(50),
  alphaArcadeWithdrawFeePercent: Joi.number().min(0).max(50),
  swapFeePercent: Joi.number().min(0).max(50),
  dailyClaimFeePercent: Joi.number().min(0).max(50),
  poolCreationFeePercent: Joi.number().min(0).max(50),
  poolCreationFeeUsd: Joi.number().min(0).max(1000),
  communityEventFeePercent: Joi.number().min(0).max(50),
  p2pCreateFeePercent: Joi.number().min(0).max(50),
  p2pAcceptFeePercent: Joi.number().min(0).max(50),
  feeRecipient: Joi.string(),
  revShareStakers: Joi.number().min(0).max(100),
  revShareTreasury: Joi.number().min(0).max(100),
  revSharePoolCreator: Joi.number().min(0).max(100),
  revShareCompound: Joi.number().min(0).max(100),
}).min(1);

// Admin ban schema
const adminBanSchema = Joi.object({
  wallet: Joi.string().required(),
  reason: Joi.string().optional().allow(''),
});

// NFT staking pool creation schema
const nftStakingPoolSchema = Joi.object({
  creatorId: Joi.string().required(),
  appId: Joi.number().required(),
  name: Joi.string().required(),
  description: Joi.string().allow('').default(''),
  imageUrl: Joi.string().allow('').default(''),
  rewardTokenId: Joi.number().required(),
  rewardModel: Joi.string().valid('fixed_rate', 'proportional', 'apr').required(),
  collectionMode: Joi.string().valid('creator_address', 'whitelist', 'both').required(),
  collectionCreator: Joi.string().allow('').default(''),
  whitelistedAsaIds: Joi.array().items(Joi.number()).default([]),
  collectionName: Joi.string().allow('').default(''),
  nftValueInRewardToken: Joi.number().default(0),
  ratePerDay: Joi.number().default(0),
  totalRewardPool: Joi.number().default(0),
  aprRate: Joi.number().default(0),
  valuePerNft: Joi.number().default(0),
  poolEndTime: Joi.number().default(0),
  lockPeriod: Joi.number().default(0),
  depositFeeBps: Joi.number().min(0).max(10000).default(0),
  withdrawFeeBps: Joi.number().min(0).max(10000).default(0),
  claimFeeBps: Joi.number().min(0).max(10000).default(0),
  feeRecipient: Joi.string().allow('').default(''),
});

// NFT stake schema
const nftStakeSchema = Joi.object({
  wallet: Joi.string().required(),
  poolId: Joi.string().required(),
  appId: Joi.number().required(),
  nftAsaId: Joi.number().required(),
  nftName: Joi.string().allow('').default(''),
  nftImageUrl: Joi.string().allow('').default(''),
});

// NFT unstake schema
const nftUnstakeSchema = Joi.object({
  wallet: Joi.string().required(),
  appId: Joi.number().required(),
  nftAsaId: Joi.number().required(),
});

// NFT claim schema
const nftClaimSchema = Joi.object({
  wallet: Joi.string().required(),
  poolId: Joi.string().required(),
  appId: Joi.number().required(),
  rewardClaimed: Joi.number().required(),
  txId: Joi.string().required(),
  feeAmount: Joi.number().default(0),
});

// Alpha Arcade pool creation schema (admin override)
const alphaArcadePoolSchema = Joi.object({
  creatorId: Joi.string().default('system'),
  marketAppId: Joi.number().required(),
  matcherAppId: Joi.number().default(3078581851),
  marketQuestion: Joi.string().allow('').default(''),
  marketCategory: Joi.string().allow('').default(''),
  marketImageUrl: Joi.string().allow('').default(''),
  marketResolutionTime: Joi.number().default(0),
  yesAsaId: Joi.number().default(0),
  noAsaId: Joi.number().default(0),
  usdcAsaId: Joi.number().default(31566704),
  spreadBps: Joi.number().min(0).max(10000).default(50),
  rewardToken: Joi.object({
    id: Joi.string().allow('').default(''),
    name: Joi.string().allow('').default(''),
  }).default({}),
  rewardTokenAmount: Joi.number().default(0),
  poolStartTime: Joi.number().default(0),
  poolEndTime: Joi.number().default(0),
  duration: Joi.number().default(0),
  aprRate: Joi.number().default(0),
  lockPeriod: Joi.number().default(0),
  isActive: Joi.boolean().default(true),
});

// Alpha Arcade pool update schema (partial)
const alphaArcadePoolUpdateSchema = Joi.object({
  spreadBps: Joi.number().min(0).max(10000),
  rewardToken: Joi.object({
    id: Joi.string().allow(''),
    name: Joi.string().allow(''),
  }),
  rewardTokenAmount: Joi.number(),
  poolStartTime: Joi.number(),
  poolEndTime: Joi.number(),
  duration: Joi.number(),
  aprRate: Joi.number(),
  lockPeriod: Joi.number(),
  isActive: Joi.boolean(),
  isResolved: Joi.boolean(),
  resolutionOutcome: Joi.string().valid('yes', 'no', null),
}).min(1);

// Alpha Arcade build deposit schema
const alphaArcadeBuildDepositSchema = Joi.object({
  wallet: Joi.string().required(),
  marketAppId: Joi.number().required(),
  usdcAmount: Joi.number().min(1000000).required(),
  spread: Joi.number().min(0).max(10000).optional(),
});

// Alpha Arcade build withdraw schema
const alphaArcadeBuildWithdrawSchema = Joi.object({
  wallet: Joi.string().required(),
  poolId: Joi.string().required(),
});

// Alpha Arcade record deposit schema
const alphaArcadeRecordDepositSchema = Joi.object({
  wallet: Joi.string().required(),
  marketAppId: Joi.number().required(),
  poolId: Joi.string().required(),
  usdcDeposited: Joi.number().required(),
  yesEscrowAppIds: Joi.array().items(Joi.number()).default([]),
  noEscrowAppIds: Joi.array().items(Joi.number()).default([]),
  spreadUsed: Joi.number().default(0),
  entryMidPrice: Joi.number().default(0),
  txId: Joi.string().required(),
  depositFee: Joi.number().default(0),
});

// Alpha Arcade record withdraw schema
const alphaArcadeRecordWithdrawSchema = Joi.object({
  wallet: Joi.string().required(),
  poolId: Joi.string().optional(),
  positionId: Joi.string().required(),
  usdcRecovered: Joi.number().default(0),
  remainingYesTokens: Joi.number().default(0),
  remainingNoTokens: Joi.number().default(0),
  txId: Joi.string().required(),
  withdrawFee: Joi.number().default(0),
});

// Alpha Arcade build claim schema
const alphaArcadeBuildClaimSchema = Joi.object({
  wallet: Joi.string().required(),
  poolId: Joi.string().required(),
});

// Alpha Arcade record claim schema
const alphaArcadeRecordClaimSchema = Joi.object({
  wallet: Joi.string().required(),
  poolId: Joi.string().optional(),
  positionId: Joi.string().required(),
  amountClaimed: Joi.number().default(0),
  txId: Joi.string().required(),
});

// Device staking pool creation schema
const createDevicePoolSchema = Joi.object({
  appId: Joi.string().required(),
  creator: Joi.string().required(),
  name: Joi.string().required(),
  description: Joi.string().allow('').default(''),
  imageUrl: Joi.string().allow('').default(''),
  stakingMode: Joi.string().valid('verified-hold', 'escrow').required(),
  verifierAddress: Joi.string().allow('').default(''),
  verificationIntervalMinutes: Joi.number().default(15),
  verificationGracePeriod: Joi.number().default(3),
  collectionCreator: Joi.string().allow('').default(''),
  collectionMode: Joi.string().valid('creator_address', 'whitelist', 'both').default('creator_address'),
  whitelist: Joi.array().items(Joi.number()).default([]),
  acceptedCollections: Joi.array().items(Joi.object({
    collectionId: Joi.string().allow('').default(''),
    collectionName: Joi.string().allow('').default(''),
    collectionImage: Joi.string().allow('').default(''),
    chain: Joi.string().default('algorand-mainnet'),
    identifiers: Joi.object({
      creatorAddress: Joi.string().allow('').default(''),
      contractAddress: Joi.string().allow('').default(''),
      collectionAddress: Joi.string().allow('').default(''),
      evmChainId: Joi.number().default(0),
    }).default({}),
  })).default([]),
  rewardTokenId: Joi.number().required(),
  rewardToken: Joi.object({
    id: Joi.number().default(0),
    name: Joi.string().allow('').default(''),
    symbol: Joi.string().allow('').default(''),
    image: Joi.string().allow('').default(''),
    decimals: Joi.number().default(6),
  }).default({}),
  rewardModel: Joi.string().valid('fixed_rate', 'proportional', 'apr').required(),
  rewardPerDay: Joi.number().default(0),
  dailyPoolReward: Joi.number().default(0),
  apr: Joi.number().default(0),
  valuePerNft: Joi.number().default(0),
  rewardAmount: Joi.number().default(0),
  depositFeeBps: Joi.number().min(0).max(10000).default(0),
  withdrawFeeBps: Joi.number().min(0).max(10000).default(0),
  claimFeeBps: Joi.number().min(0).max(10000).default(800),
  startDate: Joi.date().allow(null).default(null),
  endDate: Joi.date().allow(null).default(null),
  lockPeriod: Joi.number().default(0),
  chainId: Joi.string().default('algorand-mainnet'),
  chainType: Joi.string().valid('algorand', 'evm', 'solana', 'cosmos').default('algorand'),
  tags: Joi.array().items(Joi.string()).default([]),
  requirements: Joi.array().items(Joi.object({
    requirementId: Joi.string().required(),
    type: Joi.string().valid('token_balance', 'staking_position', 'nft_holding', 'multi_device', 'wallet_age').required(),
    label: Joi.string().required(),
    description: Joi.string().allow('').default(''),
    params: Joi.object().required(),
    enforcement: Joi.string().valid('required', 'optional_boost').default('required'),
  })).default([]),
  boostMultipliers: Joi.array().items(Joi.object({
    multiplierId: Joi.string().required(),
    label: Joi.string().required(),
    description: Joi.string().allow('').default(''),
    type: Joi.string().valid('stake_duration', 'token_balance', 'device_count', 'requirement_met').required(),
    params: Joi.object().required(),
    stackable: Joi.boolean().default(true),
    maxMultiplier: Joi.number().default(100000),
  })).default([]),
  announcementsEnabled: Joi.boolean().default(true),
  gatedAccessEnabled: Joi.boolean().default(true),
  gatedAccessLabel: Joi.string().allow('').default(''),
});

// Device stake schema
const stakeDeviceSchema = Joi.object({
  poolAppId: Joi.string().required(),
  deviceNftId: Joi.number().required(),
  deviceNftName: Joi.string().allow('').default(''),
});

// Device announcement schema
const createAnnouncementSchema = Joi.object({
  title: Joi.string().max(200).required(),
  body: Joi.string().max(2000).required(),
  priority: Joi.string().valid('normal', 'urgent').default('normal'),
  expiresAt: Joi.date().optional().allow(null),
});

// Wallet link schema
const linkWalletSchema = Joi.object({
  chainId: Joi.string().required(),
  walletAddress: Joi.string().required(),
  signature: Joi.string().required(),
  message: Joi.string().required(),
  timestamp: Joi.number().required(),
});

// Community event creation schema
const communityEventCreateSchema = Joi.object({
  name: Joi.string().required().min(3).max(200),
  description: Joi.string().max(2000).allow('').default(''),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().required(),
  rewardAsaId: Joi.number().integer().positive().required(),
  rewardAmount: Joi.number().integer().positive().required(),
  airdropDistribution: Joi.string().valid('proportional', 'tiered').default('proportional'),
  airdropTiers: Joi.array().items(Joi.object({
    rank: Joi.number().required(),
    rankEnd: Joi.number(),
    rewardAmount: Joi.number().required(),
  })).default([]),
  minPointsToQualify: Joi.number().min(0).default(0),
  bannerImage: Joi.string().allow('').default(''),
  challenges: Joi.array().items(Joi.object({
    type: Joi.string().required(),
    name: Joi.string().required(),
    description: Joi.string().allow('').default(''),
    pointsMultiplier: Joi.number().default(1),
    config: Joi.object().default({}),
  })).min(1).required(),
  vesting: Joi.object({
    enabled: Joi.boolean(),
    startDate: Joi.string().isoDate(),
    durationDays: Joi.number().integer().min(1),
    cliffDays: Joi.number().integer().min(0),
    model: Joi.string().valid('linear', 'cliff-linear'),
    rewardAsaId: Joi.number().integer(),
    totalPool: Joi.number(),
    vestingType: Joi.string().valid('off-chain', 'on-chain'),
    appId: Joi.number().integer(),
  }).optional(),
});

// Community event update schema
const communityEventUpdateSchema = Joi.object({
  name: Joi.string().min(3).max(200),
  description: Joi.string().max(2000).allow(''),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso(),
  airdropDistribution: Joi.string().valid('proportional', 'tiered'),
  airdropTiers: Joi.array().items(Joi.object({
    rank: Joi.number().required(),
    rankEnd: Joi.number(),
    rewardAmount: Joi.number().required(),
  })),
  minPointsToQualify: Joi.number().min(0),
  vesting: Joi.object({
    enabled: Joi.boolean(),
    startDate: Joi.string().isoDate(),
    durationDays: Joi.number().integer().min(1),
    cliffDays: Joi.number().integer().min(0),
    model: Joi.string().valid('linear', 'cliff-linear'),
    rewardAsaId: Joi.number().integer(),
    totalPool: Joi.number(),
    vestingType: Joi.string().valid('off-chain', 'on-chain'),
    appId: Joi.number().integer(),
  }).optional(),
}).min(1);

// Community event confirm funding schema
const communityEventConfirmSchema = Joi.object({
  txId: Joi.string().required(),
  feeTxId: Joi.string().allow('').default(''),
});

// P2P swap market registration schema
const p2pMarketCreateSchema = Joi.object({
  appId: Joi.number().integer().positive().required(),
  deployTxId: Joi.string().allow('').default(''),
  offerAssetId: Joi.number().integer().min(0).required(),
  requestAssetId: Joi.number().integer().min(0).required(),
  feeBps: Joi.number().integer().min(0).max(10000).required(),
  offerAssetName: Joi.string().allow('').default(''),
  offerAssetSymbol: Joi.string().allow('').default(''),
  requestAssetName: Joi.string().allow('').default(''),
  requestAssetSymbol: Joi.string().allow('').default(''),
  isPrivate: Joi.boolean().default(false),
  gatedWallet: Joi.string().allow('').default(''),
});

// P2P swap offer creation schema
const p2pOfferCreateSchema = Joi.object({
  marketAppId: Joi.number().integer().positive().required(),
  offerId: Joi.number().integer().min(0).required(),
  escrowTxId: Joi.string().required(),
  offerAmount: Joi.string().pattern(/^[1-9][0-9]*$/).required(),
  requestAmount: Joi.string().pattern(/^[1-9][0-9]*$/).required(),
  offerType: Joi.string().valid('public', 'private').default('public'),
  counterparty: Joi.string().allow('').default(''),
  expiresAt: Joi.date().allow(null).default(null),
  feeTxId: Joi.string().allow('').optional(),
  feeAssetId: Joi.number().optional(),
});

// P2P swap offer accept schema
const p2pOfferAcceptSchema = Joi.object({
  chainId: Joi.string().optional(),
  marketAppId: Joi.number().integer().positive().required(),
  settlementTxId: Joi.string().required(),
  requestAmount: Joi.number().integer().positive().required(),
  feeTxId: Joi.string().allow('').optional(),
  feeAssetId: Joi.number().optional(),
});

// P2P swap offer cancel schema
const p2pOfferCancelSchema = Joi.object({
  chainId: Joi.string().optional(),
  marketAppId: Joi.number().integer().positive().required(),
  cancelTxId: Joi.string().required(),
});

// Vault claim schema (capped-hybrid rewards)
const vaultClaimSchema = Joi.object({
  fingerprint: Joi.string().required(),
  turnstileToken: Joi.string().optional(),
});
module.exports = {
  validate,
  stakingSchema,
  farmingSchema,
  tokenSchema,
  claimRewardSchema,
  claimFarmRewardSchema,
  withdrawSchema,
  farmingWithdrawSchema,
  gasFeeSchema,
  swapHistorySchema,
  stakerDataSchema,
  dailyRewardClaimSchema,
  rewardsConfigUpdateSchema,
  adminBanSchema,
  feeConfigUpdateSchema,
  nftStakingPoolSchema,
  nftStakeSchema,
  nftUnstakeSchema,
  nftClaimSchema,
  alphaArcadePoolSchema,
  alphaArcadePoolUpdateSchema,
  alphaArcadeBuildDepositSchema,
  alphaArcadeBuildWithdrawSchema,
  alphaArcadeRecordDepositSchema,
  alphaArcadeRecordWithdrawSchema,
  alphaArcadeBuildClaimSchema,
  alphaArcadeRecordClaimSchema,
  communityEventCreateSchema,
  communityEventUpdateSchema,
  communityEventConfirmSchema,
  createDevicePoolSchema,
  stakeDeviceSchema,
  createAnnouncementSchema,
  linkWalletSchema,
  p2pMarketCreateSchema,
  p2pOfferCreateSchema,
  p2pOfferAcceptSchema,
  p2pOfferCancelSchema,
  vaultClaimSchema,
};
