import * as algokit from '@algorandfoundation/algokit-utils'
import algosdk, { TransactionSigner } from 'algosdk'
import { FryDeviceStakingClient, APP_SPEC } from './contracts/FryDeviceStakingClient'
import { COMPILED_APPROVAL, COMPILED_CLEAR } from './contracts/FryDeviceStakingCompiled'
import { getAlgodConfigFromViteEnvironment } from './utils/network/getAlgoClientConfigs'
import { logFee } from './utils/logFee'
import { routeFeeViaRouter } from './services/FeeService'
import { algorandMainnet } from './config/chains/algorand-mainnet'

const BOX_PRICE = 2500 + 400 * 864

const createDeviceStakingClient = async (signer: TransactionSigner, activeAddress: string, appId: number) => {
  algokit.Config.configure({ populateAppCallResources: true })

  const algodConfig = getAlgodConfigFromViteEnvironment()
  const algorandClient: algokit.AlgorandClient = algokit.AlgorandClient.fromConfig({ algodConfig })
  algorandClient.setDefaultSigner(signer)

  const algodClient = algokit.getAlgoClient({
    server: algodConfig.server,
    port: algodConfig.port,
    token: algodConfig.token,
  })

  const client = new FryDeviceStakingClient(
    {
      resolveBy: 'id',
      id: appId,
      sender: { addr: activeAddress, signer },
    },
    algorandClient.client.algod,
  )

  return { client, algorandClient, algodClient }
}

const getAlgodClient = () => {
  const algodConfig = getAlgodConfigFromViteEnvironment()
  return algokit.getAlgoClient({
    server: algodConfig.server,
    port: algodConfig.port,
    token: algodConfig.token,
  })
}

/**
 * Create a new device staking pool on-chain.
 */
export const createDevicePool = async (
  rewardTokenId: number,
  rewardModel: number,
  collectionMode: number,
  collectionCreator: string,
  nftValue: number,
  ratePerDay: number,
  totalRewardPool: number,
  aprRate: number,
  valuePerNft: number,
  poolEndTime: number,
  lockPeriod: number,
  feeRecipient: string,
  depositFeeBps: number,
  withdrawFeeBps: number,
  claimFeeBps: number,
  stakingMode: number,
  verifier: string,
  sender: string,
  signer: TransactionSigner,
) => {
  try {
    const algodClient = getAlgodClient()

    const abiContract = new algosdk.ABIContract(APP_SPEC.contract as any)
    const initPoolMethod = abiContract.getMethodByName('init_device_pool')

    const suggestedParams = await algodClient.getTransactionParams().do()

    const atc = new algosdk.AtomicTransactionComposer()
    atc.addMethodCall({
      appID: 0,
      method: initPoolMethod,
      methodArgs: [
        rewardTokenId,
        rewardModel,
        collectionMode,
        collectionCreator || sender,
        nftValue,
        ratePerDay,
        totalRewardPool,
        aprRate,
        valuePerNft,
        poolEndTime,
        lockPeriod,
        algorandMainnet.feeRouterAddr || feeRecipient || sender,
        depositFeeBps,
        withdrawFeeBps,
        claimFeeBps,
        stakingMode,
        verifier || sender,
      ],
      approvalProgram: COMPILED_APPROVAL,
      clearProgram: COMPILED_CLEAR,
      numGlobalInts: 19,
      numGlobalByteSlices: 4,
      numLocalInts: 0,
      numLocalByteSlices: 0,
      sender,
      signer,
      suggestedParams,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
    })

    const result = await atc.execute(algodClient, 4)
    const appId = result.methodResults[0].txInfo?.['application-index']
    if (!appId) {
      throw new Error('Failed to create device staking pool.')
    }

    const { algorandClient } = await createDeviceStakingClient(signer, sender, Number(appId))

    await algorandClient.send.payment({
      sender,
      receiver: algosdk.getApplicationAddress(BigInt(appId)),
      amount: algokit.algos(0.3),
      extraFee: algokit.algos(0.001),
    })

    await new Promise((resolve) => setTimeout(resolve, 500))

    return Number(appId)
  } catch (e) {
    console.error('Error in createDevicePool:', e)
    throw e
  }
}

/**
 * Opt the contract into an ASA. Must be called before first stake of each ASA.
 */
export const optInDeviceContractToAsset = async (
  appId: number,
  assetId: number,
  sender: string,
  signer: TransactionSigner,
) => {
  try {
    const { client, algorandClient, algodClient } = await createDeviceStakingClient(signer, sender, appId)

    const mbrPay = await algorandClient.transactions.payment({
      sender,
      receiver: algosdk.getApplicationAddress(appId),
      amount: algokit.algos(0.1),
      extraFee: algokit.algos(0.002),
      signer,
    })

    await client.optInAsset({ asset: assetId, mbrPayment: mbrPay })

    return true
  } catch (e) {
    console.error('Error in optInDeviceContractToAsset:', e)
    throw e
  }
}

/**
 * Deposit rewards into the pool (ASA token).
 */
export const depositDeviceRewards = async (
  appId: number,
  rewardTokenId: number,
  amount: number,
  sender: string,
  signer: TransactionSigner,
) => {
  try {
    const { client, algorandClient, algodClient } = await createDeviceStakingClient(signer, sender, appId)

    const rewardTxn = await algorandClient.transactions.assetTransfer({
      sender,
      receiver: algosdk.getApplicationAddress(appId),
      assetId: BigInt(rewardTokenId),
      amount: BigInt(amount),
      signer,
    })

    const tx = await client.depositRewards({ rewardTxn })
    return tx
  } catch (e) {
    console.error('Error in depositDeviceRewards:', e)
    throw e
  }
}

/**
 * Deposit ALGO rewards into the pool.
 */
export const depositDeviceRewardsAlgo = async (
  appId: number,
  amount: number,
  sender: string,
  signer: TransactionSigner,
) => {
  try {
    const { client, algorandClient, algodClient } = await createDeviceStakingClient(signer, sender, appId)

    const payment = await algorandClient.transactions.payment({
      sender,
      receiver: algosdk.getApplicationAddress(appId),
      amount: algokit.microAlgos(amount),
      signer,
    })

    const tx = await client.depositRewardsAlgo({ payment })
    return tx
  } catch (e) {
    console.error('Error in depositDeviceRewardsAlgo:', e)
    throw e
  }
}

/**
 * Stake an NFT into the pool (escrow mode).
 */
export const stakeDeviceNft = async (
  appId: number,
  nftAsaId: number,
  sender: string,
  signer: TransactionSigner,
  feeAmount: number,
  feeTokenId: number,
  feeRecipient: string, feeRouterAppId?: number | null, feeRouterAddr?: string | null) => {
  try {
    const { client, algorandClient, algodClient } = await createDeviceStakingClient(signer, sender, appId)

    const nftTransfer = await algorandClient.transactions.assetTransfer({
      sender,
      receiver: algosdk.getApplicationAddress(appId),
      assetId: BigInt(nftAsaId),
      amount: 1n,
      signer,
    })

    const boxPayment = await algorandClient.transactions.payment({
      sender,
      receiver: algosdk.getApplicationAddress(appId),
      amount: algokit.microAlgos(BOX_PRICE),
      signer,
    })

    const tx = await client
      .stakeNft(
        { nftTransfer, boxPayment },
        {
          boxes: [{ appIndex: 0, name: algosdk.decodeAddress(sender).publicKey }],
          sendParams: { fee: algokit.algos(0.003) },
        },
      )
      .catch((e: any) => e)

    if (tx instanceof Error) return tx

    if (feeAmount > 0) {
      try {
        const feeRouterResult = await routeFeeViaRouter(sender, signer, feeAmount, feeTokenId, algodClient, feeRouterAppId, feeRouterAddr)
        const feeTxId = feeRouterResult.txId

        await logFee({
          appId,
          userId: sender,
          gasAmount: feeAmount,
          gasType: 'deviceStakingStake',
          feeType: 'percentage',
          txId: feeTxId,
        })
      } catch (feeErr) {
        console.warn('Fee transfer failed after successful device stake:', feeErr)
      }
    }

    return tx
  } catch (e) {
    console.error('Error in stakeDeviceNft:', e)
    return e
  }
}

/**
 * Unstake an NFT from the pool (escrow mode).
 */
export const unstakeDeviceNft = async (
  appId: number,
  nftAsaId: number,
  sender: string,
  signer: TransactionSigner,
  feeAmount: number,
  feeTokenId: number,
  feeRecipient: string, feeRouterAppId?: number | null, feeRouterAddr?: string | null) => {
  try {
    const { client, algorandClient, algodClient } = await createDeviceStakingClient(signer, sender, appId)

    const tx = await client
      .unstakeNft(
        { nftId: nftAsaId },
        {
          boxes: [{ appIndex: 0, name: algosdk.decodeAddress(sender).publicKey }],
          sendParams: { fee: algokit.algos(0.003) },
        },
      )
      .catch((e: any) => e)

    if (tx instanceof Error) return tx

    if (feeAmount > 0) {
      try {
        const feeRouterResult = await routeFeeViaRouter(sender, signer, feeAmount, feeTokenId, algodClient, feeRouterAppId, feeRouterAddr)
        const feeTxId = feeRouterResult.txId

        await logFee({
          appId,
          userId: sender,
          gasAmount: feeAmount,
          gasType: 'deviceStakingWithdraw',
          feeType: 'percentage',
          txId: feeTxId,
        })
      } catch (feeErr) {
        console.warn('Fee transfer failed after successful device unstake:', feeErr)
      }
    }

    return tx
  } catch (e) {
    console.error('Error in unstakeDeviceNft:', e)
    return e
  }
}

/**
 * Register as a verified holder (verified-hold mode). No NFT transfer.
 */
export const registerDeviceHolder = async (
  appId: number,
  sender: string,
  signer: TransactionSigner,
) => {
  try {
    const { client, algorandClient, algodClient } = await createDeviceStakingClient(signer, sender, appId)

    const boxPayment = await algorandClient.transactions.payment({
      sender,
      receiver: algosdk.getApplicationAddress(appId),
      amount: algokit.microAlgos(BOX_PRICE),
      signer,
    })

    const tx = await client
      .registerHolder(
        { boxPayment },
        {
          boxes: [{ appIndex: 0, name: algosdk.decodeAddress(sender).publicKey }],
          sendParams: { fee: algokit.algos(0.003) },
        },
      )
      .catch((e: any) => e)

    if (tx instanceof Error) return tx
    return tx
  } catch (e) {
    console.error('Error in registerDeviceHolder:', e)
    return e
  }
}

/**
 * Unregister as a verified holder (verified-hold mode).
 */
export const unregisterDeviceHolder = async (
  appId: number,
  sender: string,
  signer: TransactionSigner,
  feeAmount: number,
  feeTokenId: number,
  feeRecipient: string, feeRouterAppId?: number | null, feeRouterAddr?: string | null) => {
  try {
    const { client, algorandClient, algodClient } = await createDeviceStakingClient(signer, sender, appId)

    const tx = await client
      .unregisterHolder(
        {},
        {
          boxes: [{ appIndex: 0, name: algosdk.decodeAddress(sender).publicKey }],
          sendParams: { fee: algokit.algos(0.003) },
        },
      )
      .catch((e: any) => e)

    if (tx instanceof Error) return tx

    if (feeAmount > 0) {
      try {
        const feeRouterResult = await routeFeeViaRouter(sender, signer, feeAmount, feeTokenId, algodClient, feeRouterAppId, feeRouterAddr)
        const feeTxId = feeRouterResult.txId

        await logFee({
          appId,
          userId: sender,
          gasAmount: feeAmount,
          gasType: 'deviceStakingWithdraw',
          feeType: 'percentage',
          txId: feeTxId,
        })
      } catch (feeErr) {
        console.warn('Fee transfer failed after device unregister:', feeErr)
      }
    }

    return tx
  } catch (e) {
    console.error('Error in unregisterDeviceHolder:', e)
    return e
  }
}

/**
 * Claim accumulated rewards from the pool.
 */
export const claimDeviceRewardsOnChain = async (
  appId: number,
  sender: string,
  signer: TransactionSigner,
  feeAmount: number,
  feeTokenId: number,
  feeRecipient: string, feeRouterAppId?: number | null, feeRouterAddr?: string | null) => {
  try {
    const { client, algorandClient, algodClient } = await createDeviceStakingClient(signer, sender, appId)

    const tx = await client
      .claimRewards(
        {},
        {
          boxes: [{ appIndex: 0, name: algosdk.decodeAddress(sender).publicKey }],
          sendParams: { fee: algokit.algos(0.002) },
        },
      )
      .catch((e: any) => e)

    if (tx instanceof Error) return tx

    if (feeAmount > 0) {
      try {
        const feeRouterResult = await routeFeeViaRouter(sender, signer, feeAmount, feeTokenId, algodClient, feeRouterAppId, feeRouterAddr)
        const feeTxId = feeRouterResult.txId

        await logFee({
          appId,
          userId: sender,
          gasAmount: feeAmount,
          gasType: 'deviceStakingClaim',
          feeType: 'percentage',
          txId: feeTxId,
        })
      } catch (feeErr) {
        console.warn('Fee transfer failed after device claim:', feeErr)
      }
    }

    return tx
  } catch (e) {
    console.error('Error in claimDeviceRewardsOnChain:', e)
    return e
  }
}

/**
 * Set the verifier address (creator only).
 */
export const setDeviceVerifier = async (appId: number, newVerifier: string, sender: string, signer: TransactionSigner) => {
  const { client } = await createDeviceStakingClient(signer, sender, appId)
  return client.setVerifier({ newVerifier })
}

/**
 * Pause the pool (creator only).
 */
export const pauseDevicePool = async (appId: number, sender: string, signer: TransactionSigner) => {
  const { client } = await createDeviceStakingClient(signer, sender, appId)
  return client.pausePool({})
}

/**
 * Resume the pool (creator only).
 */
export const resumeDevicePool = async (appId: number, sender: string, signer: TransactionSigner) => {
  const { client } = await createDeviceStakingClient(signer, sender, appId)
  return client.resumePool({})
}

/**
 * Update pool end time (creator only).
 */
export const updateDeviceEndTime = async (appId: number, newEndTime: number, sender: string, signer: TransactionSigner) => {
  const { client } = await createDeviceStakingClient(signer, sender, appId)
  return client.updateEndTime({ newEndTime: BigInt(newEndTime) })
}

/**
 * Calculate pending rewards for a user (client-side estimation).
 */
export const calculateDevicePendingRewards = async (appId: number, sender: string, signer: TransactionSigner) => {
  try {
    const { client } = await createDeviceStakingClient(signer, sender, appId)
    const globalState: any = await client.getGlobalState()

    const rewardModel = globalState?.rewardModel?.asNumber() ?? 0
    const ratePerDay = globalState?.ratePerDay?.asNumber() ?? 0
    const totalRewardPool = globalState?.totalRewardPool?.asNumber() ?? 0
    const totalNftsStaked = globalState?.totalNftsStaked?.asNumber() ?? 0
    const totalVerifiedHolders = globalState?.totalVerifiedHolders?.asNumber() ?? 0
    const aprRate = globalState?.aprRate?.asNumber() ?? 0
    const valuePerNft = globalState?.valuePerNft?.asNumber() ?? 0
    const rewardTokenId = globalState?.rewardTokenId?.asNumber() ?? 0
    const stakingMode = globalState?.stakingMode?.asNumber() ?? 0

    const totalParticipants = stakingMode === 1 ? totalVerifiedHolders : totalNftsStaked

    const algod = getAlgodClient()
    const boxName = algosdk.decodeAddress(sender).publicKey
    let userStakeTime: number

    try {
      const boxValue = await algokit.getAppBoxValue(appId, boxName, algod)
      userStakeTime = Number(algosdk.decodeUint64(boxValue.slice(0, 8), 'mixed'))
    } catch {
      return { reward: 0, rewardTokenId }
    }

    const now = Math.floor(Date.now() / 1000)
    const stakeDuration = now - userStakeTime
    const stakeDays = stakeDuration / 86400

    let reward = 0
    switch (rewardModel) {
      case 0:
        reward = ratePerDay * stakeDays
        break
      case 1:
        if (totalParticipants > 0) {
          reward = (totalRewardPool / totalParticipants) * stakeDays
        }
        break
      case 2:
        reward = (valuePerNft * (aprRate / 10000) * stakeDays) / 360
        break
    }

    return { reward: Math.floor(reward), rewardTokenId }
  } catch (e) {
    console.error('Error calculating device pending rewards:', e)
    return { reward: 0, rewardTokenId: 0 }
  }
}

/**
 * Get global pool state data.
 */
export const getDevicePoolData = async (appId: number, sender: string, signer: TransactionSigner) => {
  try {
    const { client } = await createDeviceStakingClient(signer, sender, appId)
    const globalState: any = await client.getGlobalState()
    return {
      rewardModel: globalState?.rewardModel?.asNumber(),
      rewardTokenId: globalState?.rewardTokenId?.asNumber(),
      collectionMode: globalState?.collectionMode?.asNumber(),
      ratePerDay: globalState?.ratePerDay?.asNumber(),
      totalRewardPool: globalState?.totalRewardPool?.asNumber(),
      aprRate: globalState?.aprRate?.asNumber(),
      valuePerNft: globalState?.valuePerNft?.asNumber(),
      nftValue: globalState?.nftValue?.asNumber(),
      poolEndTime: globalState?.poolEndTime?.asNumber(),
      lockPeriod: globalState?.lockPeriod?.asNumber(),
      isActive: globalState?.isActive?.asNumber(),
      totalNftsStaked: globalState?.totalNftsStaked?.asNumber(),
      totalVerifiedHolders: globalState?.totalVerifiedHolders?.asNumber(),
      totalRewardBalance: globalState?.totalRewardBalance?.asNumber(),
      totalRewardsClaimed: globalState?.totalRewardsClaimed?.asNumber(),
      stakingMode: globalState?.stakingMode?.asNumber(),
    }
  } catch (e) {
    console.error('getDevicePoolData error:', e)
    throw e
  }
}
