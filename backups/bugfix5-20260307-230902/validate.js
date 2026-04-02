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
  poolId: Joi.string().required(),
  rewardClaimed: Joi.number().required(),
  stakedAmount: Joi.number().required(),
  stakedTime: Joi.number().required(),
});

// Claim farm reward schema
const claimFarmRewardSchema = Joi.object({
  walletId: Joi.string().required(),
  poolId: Joi.string().required(),
  rewardClaimed: Joi.number().required(),
  stakedAmount: Joi.number().required(),
  stakeStartTime: Joi.number().required(),
  claimTime: Joi.number().required(),
});

// Withdraw schema
const withdrawSchema = Joi.object({
  tokens: Joi.number().required(),
  wallet: Joi.string().required(),
  poolId: Joi.string().required(),
  appId: Joi.number().required(),
});

// Farming withdraw schema
const farmingWithdrawSchema = Joi.object({
  amount: Joi.number().required(),
  userWallet: Joi.string().required(),
  poolId: Joi.string().required(),
  farmingTokenId: Joi.string().required(),
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
  stakedAmount: Joi.number().required(),
  stakeTime: Joi.number().required(),
  poolId: Joi.string().required(),
  rewardClaimed: Joi.number().default(0),
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
  swapFeePercent: Joi.number().min(0).max(50),
  dailyClaimFeePercent: Joi.number().min(0).max(50),
  poolCreationFeeUsd: Joi.number().min(0).max(1000),
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
};
