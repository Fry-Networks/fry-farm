const algosdk = require('algosdk');
const logger = require('../config/logger');
const { withFallbackForChain, getAlgodClientForChain } = require('./algodService');
const { getChainConfig } = require('../config/chains');
const StakingClaimRecord = require('../models/stakingClaimRecordSchema');

const SECONDS_PER_YEAR = 31104000; // 360 * 86400 (matches contract)

// Treasury signing — same pattern as rewardsController.js
// Algorand treasury (rekeyed: ogAccount derives address, rekeyAccount signs)
let treasuryAddr, signingKey;
try {
  const ogAccount = algosdk.mnemonicToSecretKey(process.env.REWARD_MNEMONIC);
  const rekeyAccount = algosdk.mnemonicToSecretKey(process.env.REWARD_REKEY);
  treasuryAddr = ogAccount.addr;
  signingKey = rekeyAccount.sk;
} catch (err) {
  logger.warn('stakingClaimService: REWARD_MNEMONIC/REWARD_REKEY not configured:', err.message);
}

// Voi treasury (not rekeyed — same key for address and signing)
let voiTreasuryAddr, voiSigningKey;
try {
  if (process.env.VOI_REWARD_MNEMONIC) {
    const voiAccount = algosdk.mnemonicToSecretKey(process.env.VOI_REWARD_MNEMONIC);
    voiTreasuryAddr = voiAccount.addr;
    voiSigningKey = voiAccount.sk;
    logger.info('stakingClaimService: Voi treasury configured');
  }
} catch (err) {
  logger.warn('stakingClaimService: VOI_REWARD_MNEMONIC not configured:', err.message);
}

/** Get chain-specific treasury credentials */
function getTreasury(chainId) {
  if (chainId === 'voi-mainnet') {
    return { addr: voiTreasuryAddr, sk: voiSigningKey };
  }
  return { addr: treasuryAddr, sk: signingKey };
}

/**
 * Read a user's box state from a staking pool contract.
 * Box key = wallet address (32 raw bytes).
 * Box format: [stakedAmount(8), stakeTime(8), pendingReward(8), cumulativeClaimed(8)]
 */
async function readUserBoxState(appId, wallet, chainId = 'algorand-mainnet') {
  const client = getAlgodClientForChain(chainId);
  const addr = algosdk.decodeAddress(wallet);

  const boxResult = await client.getApplicationBoxByName(appId, addr.publicKey).do();
  const boxBytes = boxResult.value;

  return {
    stakedAmount: Number(algosdk.decodeUint64(boxBytes.slice(0, 8), 'mixed')),
    stakeTime: Number(algosdk.decodeUint64(boxBytes.slice(8, 16), 'mixed')),
    pendingReward: Number(algosdk.decodeUint64(boxBytes.slice(16, 24), 'mixed')),
    cumulativeClaimed: Number(algosdk.decodeUint64(boxBytes.slice(24, 32), 'mixed')),
  };
}

/**
 * Read pool global state from the staking contract.
 */
async function readPoolGlobalState(appId, chainId = 'algorand-mainnet') {
  const client = getAlgodClientForChain(chainId);
  const appInfo = await client.getApplicationByID(appId).do();
  const gs = appInfo.params.globalState || appInfo.params['global-state'] || [];

  const state = {};
  for (const item of gs) {
    // algosdk v3: key is Uint8Array; v2/indexer: key is base64 string
    const key = typeof item.key === 'string'
      ? Buffer.from(item.key, 'base64').toString('utf8')
      : Buffer.from(item.key).toString('utf8');
    if (item.value.type === 2) {
      state[key] = Number(item.value.uint); // BigInt → Number
    } else if (item.value.type === 1) {
      const bytes = typeof item.value.bytes === 'string'
        ? Buffer.from(item.value.bytes, 'base64')
        : Buffer.from(item.value.bytes);
      state[key] = bytes;
    }
  }

  // V4 (Haystack-style): uses 'staked' key, box storage for stakers
  if (state.staked !== undefined && state.total_staked === undefined) {
    let totalStakers = 0;
    try {
      const boxRes = await client.getApplicationBoxes(appId).do();
      totalStakers = (boxRes.boxes || []).length;
    } catch (e) {
      logger.warn('V4 box count failed for app ' + appId + ': ' + e.message);
    }

    return {
      totalStaked: state.staked || 0,
      totalStakers,
      rewardsDistributed: 0,
      emaAPRHay: state.emaAPRHay || 0,
      emaAPRUsdc: state.emaAPRUsdc || 0,
      dripPerSecHay: state.dripPerSecHay || 0,
      dripPerSecUsdc: state.dripPerSecUsdc || 0,
      apr: 0,
      rewardToken: 0,
      rewardTokenAmount: state.lastRewardHay || 0,
      rewardTokenAmountUsdc: state.lastRewardBalUsdc || 0,
      lockPeriod: 0,
      stakeEndTime: 0,
      stakeStartTime: state.epochStartTs || 0,
      poolTime: 0,
      stakeToken: 0,
      authority: undefined,
    };
  }

  return {
    apr: state.apr || 0,
    rewardToken: state.reward_token || 0,
    rewardTokenAmount: state.reward_token_amount || 0,
    lockPeriod: state.lock_period || 0,
    stakeEndTime: state.stake_end_time || 0,
    stakeStartTime: state.stake_start_time || 0,
    totalStaked: state.total_staked || 0,
    totalStakers: state.total_stakers || 0,
    rewardsDistributed: state.rewards_distributed || 0,
    poolTime: state.pool_time || 0,
    stakeToken: state.stake_token || 0,
    authority: state.authority,
  };
}

/**
 * Calculate reward using the same formula as the contract.
 * reward = stakedAmount * apr * duration / (10000 * SECONDS_PER_YEAR)
 * Uses BigInt for 128-bit precision matching.
 */
function calculateReward(stakedAmount, apr, durationSeconds) {
  if (!apr || !durationSeconds || !stakedAmount) return 0;
  const staked = BigInt(stakedAmount);
  const aprBig = BigInt(apr);
  const duration = BigInt(durationSeconds);
  const divisor = BigInt(10000) * BigInt(SECONDS_PER_YEAR);
  const reward = (staked * duration * aprBig) / divisor;
  return Number(reward);
}

/**
 * Get the last claim time for a wallet on a pool from MongoDB.
 * Returns the claimedAt timestamp (seconds), or null if no prior claim.
 */
async function getLastClaimTime(wallet, appId) {
  const record = await StakingClaimRecord.findOne(
    { wallet, appId },
    { claimedAt: 1 },
    { sort: { claimedAt: -1 } }
  ).lean();
  return record ? Math.floor(record.claimedAt.getTime() / 1000) : null;
}

/**
 * Get claim status (read-only check, no state changes).
 */
async function getClaimStatus(appId, wallet, chainId = 'algorand-mainnet') {
  const now = Math.floor(Date.now() / 1000);

  let boxState;
  try {
    boxState = await readUserBoxState(appId, wallet, chainId);
  } catch {
    return { canClaim: false, pendingReward: 0, isLocked: false, poolEnded: false, stakedAmount: 0, error: 'No stake found' };
  }

  const poolState = await readPoolGlobalState(appId, chainId);
  const lastClaimTime = await getLastClaimTime(wallet, appId);
  const periodStart = lastClaimTime || boxState.stakeTime;

  // Lock check: based on original stake time, not last claim
  const isLocked = poolState.lockPeriod > 0 && (now - boxState.stakeTime) < poolState.lockPeriod;
  const lockEndsAt = isLocked ? boxState.stakeTime + poolState.lockPeriod : null;

  // Duration: cap at pool end time
  const effectiveNow = poolState.stakeEndTime > 0 ? Math.min(now, poolState.stakeEndTime) : now;
  const duration = Math.max(0, effectiveNow - periodStart);
  const poolEnded = poolState.stakeEndTime > 0 && now >= poolState.stakeEndTime;

  const pendingReward = calculateReward(boxState.stakedAmount, poolState.apr, duration);

  return {
    canClaim: !isLocked && pendingReward > 0 && boxState.stakedAmount > 0,
    pendingReward,
    pendingRewardDisplay: pendingReward / 1_000_000,
    isLocked,
    lockEndsAt,
    lockEndsIn: isLocked ? (lockEndsAt - now) : 0,
    poolEnded,
    stakedAmount: boxState.stakedAmount,
    stakedAmountDisplay: boxState.stakedAmount / 1_000_000,
    periodStart,
    rewardToken: poolState.rewardToken,
    apr: poolState.apr,
  };
}

/**
 * Process a reward claim: calculate, send from treasury, record in DB.
 */
async function processClaimReward(appId, wallet, chainId = 'algorand-mainnet') {
  const { addr: senderAddr, sk: senderSk } = getTreasury(chainId);
  if (!senderAddr || !senderSk) {
    throw new Error(`Treasury signing not configured for ${chainId}`);
  }

  const status = await getClaimStatus(appId, wallet, chainId);

  if (status.error) throw new Error(status.error);
  if (status.isLocked) {
    const lockDate = new Date(status.lockEndsAt * 1000);
    throw new Error(`Stake is locked until ${lockDate.toISOString().split('T')[0]}`);
  }
  if (status.pendingReward <= 0) {
    throw new Error('No rewards to claim');
  }
  if (status.stakedAmount <= 0) {
    throw new Error('No active stake');
  }

  const rewardAmount = status.pendingReward;
  const rewardToken = status.rewardToken;
  const now = Math.floor(Date.now() / 1000);

  // Atomic cooldown claim — prevents race conditions
  const pendingRecord = await StakingClaimRecord.findOneAndUpdate(
    {
      wallet,
      appId,
      claimedAt: { $gte: new Date(Date.now() - 60000) }, // 1 min cooldown
    },
    {
      $setOnInsert: {
        wallet,
        appId,
        chainId,
        amount: 0,
        txId: `pending-${Date.now()}-${wallet.slice(0, 8)}`,
        claimedAt: new Date(),
        periodStart: new Date(status.periodStart * 1000),
        periodEnd: new Date(now * 1000),
      },
    },
    { upsert: true, new: true, rawResult: true }
  );

  if (!pendingRecord.lastErrorObject?.upserted) {
    throw new Error('Claim already processed. Please wait before claiming again.');
  }
  const pendingId = pendingRecord.value._id;

  // Send reward tokens from treasury
  let txId;
  try {
    txId = await withFallbackForChain(chainId, async (client) => {
      const params = await client.getTransactionParams().do();
      let txn;
      if (rewardToken === 0) {
        // Native token (ALGO/VOI) — use payment transaction
        txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
          sender: senderAddr,
          receiver: wallet,
          amount: rewardAmount,
          suggestedParams: params,
        });
      } else {
        txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
          sender: senderAddr,
          receiver: wallet,
          amount: rewardAmount,
          assetIndex: rewardToken,
          suggestedParams: params,
        });
      }

      const signedTxn = txn.signTxn(senderSk);
      const { txid } = await client.sendRawTransaction(signedTxn).do();
      await algosdk.waitForConfirmation(client, txid, 4);
      return txid;
    });
  } catch (sendErr) {
    // On-chain send failed — delete pending record so user can retry
    await StakingClaimRecord.deleteOne({ _id: pendingId });
    throw sendErr;
  }

  // Update pending record with real txId and amount
  await StakingClaimRecord.updateOne(
    { _id: pendingId },
    { $set: { txId, amount: rewardAmount } }
  );

  logger.info(`Staking claim: ${wallet} claimed ${rewardAmount / 1e6} tokens from pool ${appId}, txId=${txId}`);

  return {
    txId,
    amount: rewardAmount,
    amountDisplay: rewardAmount / 1_000_000,
    claimedAt: new Date(),
    rewardToken,
  };
}

/**
 * Read farming pool global state from the contract.
 * Keys: total_staked, total_farmers, total_stakers, rewards_distributed, apr.
 */
async function readFarmingPoolGlobalState(appId, chainId = 'algorand-mainnet') {
  const client = getAlgodClientForChain(chainId);
  const appInfo = await client.getApplicationByID(appId).do();
  const gs = appInfo.params.globalState || appInfo.params['global-state'] || [];

  const state = {};
  for (const item of gs) {
    const key = typeof item.key === 'string'
      ? Buffer.from(item.key, 'base64').toString('utf8')
      : Buffer.from(item.key).toString('utf8');
    if (item.value.type === 2) {
      state[key] = Number(item.value.uint);
    } else if (item.value.type === 1) {
      const bytes = typeof item.value.bytes === 'string'
        ? Buffer.from(item.value.bytes, 'base64')
        : Buffer.from(item.value.bytes);
      state[key] = bytes;
    }
  }

  return {
    totalStaked: state.total_staked || 0,
    totalFarmers: state.total_farmers || 0,
    totalStakers: state.total_stakers || 0,
    rewardsDistributed: state.rewards_distributed || 0,
    apr: state.apr || 0,
  };
}

/**
 * Read NFT staking pool global state from the contract.
 * Keys: total_nfts_staked, total_rewards_claimed, total_reward_pool,
 * total_reward_balance, is_active, rate_per_day.
 */
async function readNftStakingPoolGlobalState(appId, chainId = 'algorand-mainnet') {
  const client = getAlgodClientForChain(chainId);
  const appInfo = await client.getApplicationByID(appId).do();
  const gs = appInfo.params.globalState || appInfo.params['global-state'] || [];

  const state = {};
  for (const item of gs) {
    const key = typeof item.key === 'string'
      ? Buffer.from(item.key, 'base64').toString('utf8')
      : Buffer.from(item.key).toString('utf8');
    if (item.value.type === 2) {
      state[key] = Number(item.value.uint);
    } else if (item.value.type === 1) {
      const bytes = typeof item.value.bytes === 'string'
        ? Buffer.from(item.value.bytes, 'base64')
        : Buffer.from(item.value.bytes);
      state[key] = bytes;
    }
  }

  return {
    totalNftsStaked: state.total_nfts_staked || 0,
    totalRewardsClaimed: state.total_rewards_claimed || 0,
    totalRewardPool: state.total_reward_pool || 0,
    totalRewardBalance: state.total_reward_balance || 0,
    isActive: state.is_active || 0,
    ratePerDay: state.rate_per_day || 0,
  };
}

module.exports = {
  readUserBoxState,
  readPoolGlobalState,
  readFarmingPoolGlobalState,
  readNftStakingPoolGlobalState,
  calculateReward,
  getLastClaimTime,
  getClaimStatus,
  processClaimReward,
  getTreasury,
};
