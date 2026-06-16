import * as algokit from '@algorandfoundation/algokit-utils'
import { TransactionSignerAccount } from '@algorandfoundation/algokit-utils/types/account'
import { AppDetails } from '@algorandfoundation/algokit-utils/types/app-client'
import algosdk, { TransactionSigner } from 'algosdk'
import { FryStakingClient } from './contracts/FryStaking'
import { FryStakingClient as FryStakingV3Client } from './contracts/FryStakingV3'
import { APP_SPEC as V2_APP_SPEC } from './contracts/FryStakingV2'
import { APP_SPEC as V3_APP_SPEC } from './contracts/FryStakingV3'
import { COMPILED_APPROVAL, COMPILED_CLEAR } from './contracts/FryStakingV2Compiled'
import { COMPILED_APPROVAL as V3_COMPILED_APPROVAL, COMPILED_CLEAR as V3_COMPILED_CLEAR } from './contracts/FryStakingV3Compiled'
import { getAlgodConfigFromViteEnvironment, getIndexerConfigFromViteEnvironment } from './utils/network/getAlgoClientConfigs'
import { routeFeeViaRouter } from './services/FeeService'
import { logFee } from './utils/logFee'
import { HAYSTACK_STAKING_APP_ID, HAYSTACK_ORACLE_APP_ID, HAY_ASA_ID, USDC_ASA_ID, HAYSTACK_SELECTORS, getUserStakeData, getHaystackPoolState, buildHaystackStakeTxns, buildHaystackUnstakeTxns, buildHaystackClaimTxns } from './utils/haystackStaking'

export const getAlgodClient = async (): Promise<algosdk.Algodv2> => {
  const algodConfig = getAlgodConfigFromViteEnvironment()
  const algodClient = algokit.getAlgoClient({
    server: algodConfig.server,
    port: algodConfig.port,
    token: algodConfig.token,
  })

  return algodClient
}

const getIndexerClient = async (): Promise<algosdk.Indexer> => {
  const indexerConfig = getIndexerConfigFromViteEnvironment()
  const indexer = algokit.getAlgoIndexerClient({
    server: indexerConfig.server,
    port: indexerConfig.port,
    token: indexerConfig.token,
  })

  return indexer
}

export interface AlgodConfigOverride {
  server: string;
  port: string | number;
  token: string;
}

const createFryStakingClient = async (signer: TransactionSigner, activeAddress: string, appId: number, algodConfigOverride?: AlgodConfigOverride) => {
  algokit.Config.configure({ populateAppCallResources: true })

  const algodConfig = algodConfigOverride
    ? { ...algodConfigOverride, network: '' }
    : getAlgodConfigFromViteEnvironment()
  const algorandClient: algokit.AlgorandClient = algokit.AlgorandClient.fromConfig({ algodConfig })
  algorandClient.setDefaultSigner(signer)

  const algodClient = algokit.getAlgoClient({
    server: algodConfig.server,
    port: algodConfig.port,
    token: algodConfig.token,
  })

  const stakingClient = new FryStakingClient(
    {
      resolveBy: 'id',
      id: appId,
      sender: { addr: activeAddress!, signer },
    },
    algorandClient.client.algod,
  )

  return { stakingClient, algorandClient, algodClient }
}

const createFryStakingV3Client = async (signer: TransactionSigner, activeAddress: string, appId: number, algodConfigOverride?: AlgodConfigOverride) => {
  algokit.Config.configure({ populateAppCallResources: true })

  const algodConfig = algodConfigOverride
    ? { ...algodConfigOverride, network: '' }
    : getAlgodConfigFromViteEnvironment()
  const algorandClient: algokit.AlgorandClient = algokit.AlgorandClient.fromConfig({ algodConfig })
  algorandClient.setDefaultSigner(signer)

  const algodClient = algokit.getAlgoClient({
    server: algodConfig.server,
    port: algodConfig.port,
    token: algodConfig.token,
  })

  const stakingClient = new FryStakingV3Client(
    {
      resolveBy: 'id',
      id: appId,
      sender: { addr: activeAddress!, signer },
    },
    algorandClient.client.algod,
  )

  return { stakingClient, algorandClient, algodClient }
}

export const initStaking = async (
  stakeTokenId: number,
  rewardTokenId: number,
  rewardTokenAmount: number,
  poolTime: number,
  startDate: number,
  lockPeriod: number,
  sender: string,
  signer: TransactionSigner,
  algodConfigOverride?: AlgodConfigOverride,
) => {
  try {
    // Validate reward token amount
    if (rewardTokenAmount <= 0) {
      throw new Error('Reward token amount must be greater than 0')
    }

    const algodConfig = algodConfigOverride
      ? { ...algodConfigOverride, network: '' }
      : getAlgodConfigFromViteEnvironment()
    const algodClient = algokit.getAlgoClient({
      server: algodConfig.server,
      port: algodConfig.port,
      token: algodConfig.token,
    })

    // Deploy V3 contract using pre-compiled bytecode
    const abiContract = new algosdk.ABIContract(V3_APP_SPEC.contract as any)
    const initMethod = abiContract.getMethodByName('init_staking')

    const suggestedParams = await algodClient.getTransactionParams().do()

    const atc = new algosdk.AtomicTransactionComposer()
    atc.addMethodCall({
      appID: 0,
      method: initMethod,
      methodArgs: [
        sender,                           // _authority: address
        stakeTokenId,                     // _stake_token: uint64 (0 = native)
        rewardTokenId,                    // _reward_token: uint64 (0 = native)
        rewardTokenAmount,                // _reward_token_amount: uint64
        BigInt(startDate),                // _stake_start_time: uint64
        BigInt(startDate + poolTime),     // _stake_end_time: uint64
        lockPeriod,                       // _lock_period: uint64
        poolTime,                         // _pool_time: uint64
      ],
      approvalProgram: V3_COMPILED_APPROVAL,
      clearProgram: V3_COMPILED_CLEAR,
      numGlobalInts: 12,
      numGlobalByteSlices: 1,
      numLocalInts: 0,
      numLocalByteSlices: 0,
      sender,
      signer,
      suggestedParams,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
    })

    const result = await atc.execute(algodClient, 4)
    const createdAppId = result.methodResults[0].txInfo?.['application-index']
    if (!createdAppId) {
      throw new Error('Failed to create staking pool.')
    }

    const initStake = { appId: BigInt(createdAppId) }

    const { stakingClient, algorandClient } = await createFryStakingV3Client(signer, sender, Number(initStake.appId), algodConfigOverride)

    // Count unique ASA assets that need opt-in (native tokens don't need opt-in)
    const asaTokens = new Set<number>()
    if (stakeTokenId > 0) asaTokens.add(stakeTokenId)
    if (rewardTokenId > 0) asaTokens.add(rewardTokenId)
    const uniqueAssets = asaTokens.size

    // MBR: 0.1 ALGO (base) + 0.1 ALGO per unique ASA + 0.1 ALGO buffer
    const mbrAmount = 0.1 + (uniqueAssets * 0.1) + 0.1;
    await algorandClient.send.payment({
      sender,
      receiver: algosdk.getApplicationAddress(initStake.appId),
      amount: algokit.algos(mbrAmount),
      extraFee: algokit.algos(0.001),
    })

    await new Promise((resolve) => setTimeout(resolve, 500))

    if (initStake?.appId) {
      // Opt-in to ASA tokens (skip for native tokens)
      if (uniqueAssets > 0) {
        const mbrPay = await algorandClient.transactions.payment({
          sender,
          receiver: algosdk.getApplicationAddress(initStake?.appId),
          amount: algokit.algos(0.1),
          extraFee: algokit.algos(0.002),
          signer,
        })

        await stakingClient
          .optInAsset(
            {
              assetOne: rewardTokenId,    // V3 accepts uint64; 0 = skip opt-in
              assetTwo: stakeTokenId,     // V3 accepts uint64; 0 = skip opt-in
              mbrPay: mbrPay,
            },
            uniqueAssets === 1
              ? {
                  assets: [...asaTokens],
                  sendParams: {
                    populateAppCallResources: false,
                    fee: algokit.algos(0.003),
                  },
                }
              : {},
          )
          .then((res) => res)
      }

      // Fund reward tokens
      if (rewardTokenId > 0) {
        // ASA rewards: use assetReceive
        const rewardtx = await algorandClient.transactions.assetTransfer({
          assetId: BigInt(rewardTokenId),
          amount: BigInt(rewardTokenAmount),
          receiver: algosdk.getApplicationAddress(initStake?.appId),
          signer,
          sender,
        })

        await stakingClient
          .assetReceive({
            rewardTokenTransfer: rewardtx,
          })
          .then((res) => res)

        await algorandClient.send.assetTransfer({
          sender,
          signer,
          receiver: algosdk.getApplicationAddress(initStake?.appId),
          amount: 1_000_000n, // 1 token assuming 6 decimals
          assetId: BigInt(rewardTokenId),
        })
      } else {
        // Native rewards: use nativeReceive
        const rewardPay = await algorandClient.transactions.payment({
          sender,
          receiver: algosdk.getApplicationAddress(initStake?.appId),
          amount: algokit.microAlgos(rewardTokenAmount),
          signer,
        })

        await stakingClient
          .nativeReceive({
            rewardPayment: rewardPay,
          })
          .then((res) => res)
      }
    }
    if (!initStake?.appId) {
      throw new Error('Failed to create staking pool. Please try again.')
    }

    return initStake?.appId
  } catch (e) {
    console.error('Error in initStaking:', e)
    
    // Improve error messages for better user experience
    if (e instanceof Error) {
      const errorMsg = e.message
      
      // Check for balance errors and provide better context
      if (errorMsg.includes('balance') && errorMsg.includes('below min')) {
        // Extract balance information if available
        const balanceMatch = errorMsg.match(/balance\s+(\d+)\s+below\s+(?:min|minimum)\s+(\d+)/i);
        const accountMatch = errorMsg.match(/account\s+([A-Z0-9]{58})/i);
        const assetsMatch = errorMsg.match(/\((\d+)\s+assets?\)/i);
        
        if (balanceMatch) {
          const currentBalance = parseInt(balanceMatch[1]);
          const minBalance = parseInt(balanceMatch[2]);
          const currentBalanceAlgo = (currentBalance / 1_000_000).toFixed(2);
          const minBalanceAlgo = (minBalance / 1_000_000).toFixed(2);
          const neededAlgo = ((minBalance - currentBalance) / 1_000_000).toFixed(2);
          const assetCount = assetsMatch ? assetsMatch[1] : 'multiple';
          
          // Check if this is about the contract account (not user's wallet)
          // Contract accounts are application addresses, user wallets are typically different
          const isContractAccount = accountMatch && accountMatch[1] !== sender;
          
          if (isContractAccount) {
            throw new Error(`Contract account needs more ALGO: The staking pool contract account has ${currentBalanceAlgo} ALGO, but needs at least ${minBalanceAlgo} ALGO to hold ${assetCount} asset(s). The system will automatically send more ALGO to the contract, but you may need to ensure your wallet has enough ALGO to cover this. Please try again or add more ALGO to your wallet if the issue persists.`)
          } else {
            throw new Error(`Insufficient ALGO balance: The account has ${currentBalanceAlgo} ALGO, but needs at least ${minBalanceAlgo} ALGO to create a staking pool with ${assetCount} asset(s). Please ensure you have at least ${neededAlgo} more ALGO available.`)
          }
        }
      }
      
      // Re-throw with original message if it's already informative
      throw e
    }
    
    // For non-Error objects, convert to Error
    throw new Error(e?.toString() || 'Unknown error occurred during staking initialization')
  }
}

const BOX_PRICE = 2500 + 400 * 64
export const stakeTokens = async (stakingId: number, stakeAmount: number, sender: string, signer: TransactionSigner, feeAmount: number, feeTokenId: number, feeRecipient: string, algodConfig?: AlgodConfigOverride, contractVersion?: number, feeRouterAppId?: number | null, feeRouterAddr?: string | null) => {
//!Marketplace functions
  try {
    const appAddress = algosdk.getApplicationAddress(stakingId)
    
    // Check if this is Haystack (external app, contractVersion 4)
    if (contractVersion === 4) {
      // Haystack staking - use raw ARC-4 selectors
      const algodClient = await getAlgodClient()
      
      // Build Haystack transactions
      const txns = await buildHaystackStakeTxns(sender, stakeAmount, algodClient)
      
      // Sign transactions
      const atc = new algosdk.AtomicTransactionComposer()
      txns.forEach(txn => atc.addTransaction({ txn, signer }))
      const result = await atc.execute(algodClient, 4)
      const txId = result.txIDs[0]
      
      let feeTxId: string | undefined
      if (feeAmount > 0) {
        try {
          const feeRouterResult = await routeFeeViaRouter(sender, signer, feeAmount, feeTokenId, algodClient, feeRouterAppId, feeRouterAddr)
          feeTxId = feeRouterResult.txId
        } catch (feeErr) {
          console.warn('Fee transfer failed after successful stake:', feeErr)
        }
      }
      

      // Log fee for haystack staking
      if (feeTxId) {
        logFee({ appId: stakingId, userId: sender, gasAmount: feeAmount, gasType: 'stakingDeposit', feeType: 'percentage', txId: feeTxId }).catch(() => {})
      }

      return { tx: { transaction: { txID: () => txId } }, feeTxId, feeTokenId }
    }
    
    const isV3 = contractVersion !== undefined && contractVersion >= 3

    // Use appropriate client based on contract version
    const v2Result = !isV3 ? await createFryStakingClient(signer, sender, stakingId, algodConfig) : null
    const v3Result = isV3 ? await createFryStakingV3Client(signer, sender, stakingId, algodConfig) : null
    const algorandClient = (v3Result || v2Result)!.algorandClient
    const algodClient = (v3Result || v2Result)!.algodClient

    const globalState: any = isV3
      ? await v3Result!.stakingClient.getGlobalState()
      : await v2Result!.stakingClient.getGlobalState()

    const boxTx = await algorandClient.transactions.payment({
      receiver: appAddress,
      sender,
      amount: algokit.microAlgos(BOX_PRICE),
    })

    const stakeTokenAsaId = globalState?.stakeToken?.asNumber()
    const netAmount = feeTokenId === stakeTokenAsaId ? stakeAmount - feeAmount : stakeAmount

    let updatedApr =
      (globalState.rewardTokenAmount?.asNumber() / (globalState.totalStaked?.asNumber() + netAmount)) *
      100 *
      ((86400 * 360) / globalState.poolTime.asNumber())
    if (!isFinite(updatedApr)) {
      updatedApr = 0
    }

    let tx: any
    if (isV3) {
      // V3: dual pay+axfer pattern
      let stakePay, stakeAxfer
      if (stakeTokenAsaId === 0) {
        // Native token: real pay, dummy axfer
        stakePay = await algorandClient.transactions.payment({
          sender,
          receiver: appAddress,
          amount: algokit.microAlgos(Number(netAmount)),
          signer,
        })
        // Use the reward token as dummy axfer asset (contract is opted into it, chain-specific)
        // If reward token is also native (0), fall back to chain's FRY token from env
        const rewardTokenAsaId = globalState?.rewardToken?.asNumber()
        const dummyAssetId = BigInt(rewardTokenAsaId ?? Number(import.meta.env.VITE_FRY_TOKEN_ID) ?? 2485314946)
        stakeAxfer = await algorandClient.transactions.assetTransfer({
          sender,
          receiver: appAddress,
          amount: 0n,
          assetId: dummyAssetId,
          signer,
        })
      } else {
        // ASA: dummy pay, real axfer
        stakePay = await algorandClient.transactions.payment({
          sender,
          receiver: appAddress,
          amount: algokit.microAlgos(1000),
          signer,
        })
        stakeAxfer = await algorandClient.transactions.assetTransfer({
          sender,
          receiver: appAddress,
          amount: BigInt(netAmount),
          assetId: BigInt(stakeTokenAsaId),
          signer,
        })
      }
      tx = await v3Result!.stakingClient.stakeTokens({
        stakeAmount: netAmount,
        updatedApr: Math.floor(updatedApr * 100),
        stakePay: stakePay,
        stakeAxfer: stakeAxfer,
        boxTx: boxTx,
      })
    } else {
      // V2: axfer only
      const assetTransfer = await algorandClient.transactions.assetTransfer({
        receiver: appAddress,
        sender,
        amount: BigInt(netAmount),
        assetId: stakeTokenAsaId,
      })
      tx = await v2Result!.stakingClient.stakeTokens({
        stakeAmount: netAmount,
        boxTx,
        updatedApr: Math.floor(updatedApr * 100),
        stakeAxfer: assetTransfer,
      })
    }

    // Wait for on-chain confirmation before returning — ensures box state is readable
    try {
      const txId = tx.transaction.txID()
      if (txId) {
        await algosdk.waitForConfirmation(algodClient, txId, 4)
      }
    } catch (confirmErr) {
      console.warn('waitForConfirmation warning (tx may still succeed):', confirmErr)
    }

    // Send fee AFTER successful contract call
    let feeTxId: string | undefined
    if (feeAmount > 0) {
      try {
        const feeRouterResult = await routeFeeViaRouter(sender, signer, feeAmount, feeTokenId, algodClient, feeRouterAppId, feeRouterAddr)
        feeTxId = feeRouterResult.txId
      } catch (feeErr) {
        console.warn('Fee transfer failed after successful stake:', feeErr);
      }
    }

    return { tx, feeTxId, feeTokenId }
  } catch (e) {
    console.error('Error in stakeTokens:', e)
    throw e
  }
}


export const unstakeTokens = async (
  stakingId: number,
  unstakeAmount: number,
  sender: string,
  signer: TransactionSigner,
  feeAmount: number,
  feeTokenId: number,
  feeRecipient: string,
  algodConfig?: AlgodConfigOverride,
  contractVersion?: number, feeRouterAppId?: number | null, feeRouterAddr?: string | null) => {
  try {
    // Check if this is Haystack (external app, contractVersion 4)
    if (contractVersion === 4) {
      const algodClient = await getAlgodClient()
      
      // Build Haystack unstake transactions
      const txns = await buildHaystackUnstakeTxns(sender, unstakeAmount, algodClient)
      
      // Sign transactions
      const atc = new algosdk.AtomicTransactionComposer()
      txns.forEach(txn => atc.addTransaction({ txn, signer }))
      const result = await atc.execute(algodClient, 4)
      const txId = result.txIDs[0]
      
      let feeTxId: string | undefined
      if (feeAmount > 0) {
        try {
          const feeRouterResult = await routeFeeViaRouter(sender, signer, feeAmount, feeTokenId, algodClient, feeRouterAppId, feeRouterAddr)
          feeTxId = feeRouterResult.txId
        } catch (feeErr) {
          console.warn('Fee transfer failed after successful unstake:', feeErr)
        }
      }
      

      // Log fee for haystack unstaking
      if (feeTxId) {
        logFee({ appId: stakingId, userId: sender, gasAmount: feeAmount, gasType: 'stakingWithdraw', feeType: 'percentage', txId: feeTxId }).catch(() => {})
      }

      return { tx: { transaction: { txID: () => txId } }, feeTxId, feeTokenId }
    }
    
    const isV3 = contractVersion !== undefined && contractVersion >= 3
    const { stakingClient, algorandClient, algodClient } = isV3
      ? await createFryStakingV3Client(signer, sender, stakingId, algodConfig) as any
      : await createFryStakingClient(signer, sender, stakingId, algodConfig)
    const globalState: any = await stakingClient.getGlobalState()
    const stakerData = await getUserData(stakingId, sender, algodClient)

    // APR calculation
    const reward =
      unstakeAmount *
      (globalState?.apr?.asNumber() / 10000) *
      ((Math.floor(Date.now() / 1000) - Number(stakerData?.stakeTime)) / 31104000)

    let updatedApr =
      ((globalState.rewardTokenAmount?.asNumber() - reward) / (globalState.totalStaked?.asNumber() - unstakeAmount)) *
      100 *
      ((86400 * 360) / globalState.poolTime.asNumber())

    if (!isFinite(updatedApr)) {
      updatedApr = 0
    }

    // Call contract
    const tx = await stakingClient
      .unstakeTokens(
        { unstakeAmount, updatedApr: Math.floor(updatedApr * 100) },
        { sendParams: { fee: algokit.algos(0.003) } }
      )

    // Wait for on-chain confirmation before returning
    try {
      const txId = tx.transaction.txID()
      if (txId) {
        await algosdk.waitForConfirmation(algodClient, txId, 4)
      }
    } catch (confirmErr) {
      console.warn('waitForConfirmation warning (tx may still succeed):', confirmErr)
    }

    // Send fee AFTER successful contract call
    let feeTxId: string | undefined
    if (feeAmount > 0) {
      try {
        const feeRouterResult = await routeFeeViaRouter(sender, signer, feeAmount, feeTokenId, algodClient, feeRouterAppId, feeRouterAddr)
        feeTxId = feeRouterResult.txId
      } catch (feeErr) {
        console.warn('Fee transfer failed after successful unstake:', feeErr);
      }
    }

    return { tx, feeTxId, feeTokenId }
  } catch (e) {
    console.error('Error in unstakeTokens:', e)
    throw e
  }
}


export const claimTokens = async (
  stakingId: number,
  sender: string,
  signer: TransactionSigner,
  feeAmount: number,
  feeTokenId: number,
  feeRecipient: string,
  algodConfig?: AlgodConfigOverride,
  contractVersion?: number, feeRouterAppId?: number | null, feeRouterAddr?: string | null) => {
  try {
    // Check if this is Haystack (external app, contractVersion 4)
    if (contractVersion === 4) {
      const algodClient = await getAlgodClient()
      
      // Build Haystack claim transactions
      const txns = await buildHaystackClaimTxns(sender, algodClient)
      
      // Sign transactions
      const atc = new algosdk.AtomicTransactionComposer()
      txns.forEach(txn => atc.addTransaction({ txn, signer }))
      const result = await atc.execute(algodClient, 4)
      const txId = result.txIDs[0]
      
      let feeTxId: string | undefined
      if (feeAmount > 0) {
        try {
          const feeRouterResult = await routeFeeViaRouter(sender, signer, feeAmount, feeTokenId, algodClient, feeRouterAppId, feeRouterAddr)
          feeTxId = feeRouterResult.txId
        } catch (feeErr) {
          console.warn('Fee transfer failed after successful claim:', feeErr)
        }
      }
      

      // Log fee for haystack claim
      if (feeTxId) {
        logFee({ appId: stakingId, userId: sender, gasAmount: feeAmount, gasType: 'stakingClaim', feeType: 'percentage', txId: feeTxId }).catch(() => {})
      }

      return { tx: { transaction: { txID: () => txId } }, feeTxId, feeTokenId, updatedApr: 0, rewardClaimed: 0, stakedAmount: 0, stakedTime: 0 }
    }
    const isV3 = contractVersion !== undefined && contractVersion >= 3
    
    const { stakingClient, algorandClient, algodClient } = isV3
      ? await createFryStakingV3Client(signer, sender, stakingId, algodConfig) as any
      : await createFryStakingClient(signer, sender, stakingId, algodConfig)
    const globalState: any = await stakingClient.getGlobalState()
    const stakerData = await getUserData(stakingId, sender, algodClient)

    const stakedAmount = Number(stakerData?.stakedAmount)
    const stakeTime = Number(stakerData?.stakeTime)

    // Pre-flight lock period check — prevent the contract from silently resetting stake_time
    const lockPeriod = globalState?.lockPeriod?.asNumber() || 0
    const now = Math.floor(Date.now() / 1000)
    const duration = now - stakeTime
    if (lockPeriod > 0 && duration < lockPeriod) {
      const unlockDate = new Date((stakeTime + lockPeriod) * 1000)
      throw new Error(`Cannot claim yet — your stake is locked until ${unlockDate.toLocaleDateString()}. Claiming before the lock period ends would reset your reward timer without paying out.`)
    }

    // Calculate reward
    const reward =
      stakedAmount *
      (globalState?.apr?.asNumber() / 10000) *
      ((now - stakeTime) / 31104000)

    let updatedApr =
      ((globalState.rewardTokenAmount?.asNumber() - reward) / globalState.totalStaked?.asNumber()) *
      100 *
      ((86400 * 360) / globalState.poolTime.asNumber())
    if (!isFinite(updatedApr)) {
      updatedApr = 0
    }

    // Call contract method
    let tx: any
    try {
      tx = await stakingClient.claimTokens(
        { updatedApr: Math.floor(updatedApr * 100) },
        { sendParams: { fee: algokit.algos(0.002) } }
      )
    } catch (e: any) {
      return { error: e instanceof Error ? e : new Error(String(e)) }
    }

    // Wait for on-chain confirmation before returning
    try {
      const txId = tx.txIds?.[0] || tx.transaction?.txID()
      if (txId) {
        await algosdk.waitForConfirmation(algodClient, txId, 4)
      }
    } catch (confirmErr) {
      console.warn('waitForConfirmation warning (tx may still succeed):', confirmErr)
    }

    // Send fee AFTER successful contract call
    let feeTxId: string | undefined
    if (feeAmount > 0) {
      try {
        const feeRouterResult = await routeFeeViaRouter(sender, signer, feeAmount, feeTokenId, algodClient, feeRouterAppId, feeRouterAddr)
        feeTxId = feeRouterResult.txId
      } catch (feeErr) {
        console.warn('Fee transfer failed after successful claim:', feeErr);
      }
    }

    // Return useful data
    return {
      tx,
      feeTxId,
      feeTokenId,
      updatedApr: Math.floor(updatedApr * 100),
      rewardClaimed: Number((reward / 1_000_000).toFixed(3)),
      stakedAmount,
      stakedTime: stakeTime,
    }
  } catch (e) {
    console.error('Error in claimTokens:', e)
    return { error: e }
  }
}


export const estimateStakingReward = async (stakingId: number, sender: string, signer: TransactionSigner, algodConfig?: AlgodConfigOverride, contractVersion?: number) => {
  const isV3 = contractVersion !== undefined && contractVersion >= 3
  const { stakingClient, algodClient } = isV3
    ? await createFryStakingV3Client(signer, sender, stakingId, algodConfig)
    : await createFryStakingClient(signer, sender, stakingId, algodConfig)
  const globalState: any = await stakingClient.getGlobalState()
  const FRY_ASSET_ID = Number(import.meta.env.VITE_FRY_TOKEN_ID) || 2485314946

  try {
    const stakerData = await getUserData(stakingId, sender, algodClient)
    const stakedAmount = Number(stakerData.stakedAmount)
    const stakeTime = Number(stakerData.stakeTime)
    const reward = stakedAmount *
      (globalState?.apr?.asNumber() / 10000) *
      ((Math.floor(Date.now() / 1000) - stakeTime) / 31104000)
    const rewardTokenId = globalState?.rewardToken?.asNumber() || FRY_ASSET_ID
    return { reward: Math.floor(reward), rewardTokenId }
  } catch (err) {
    console.warn(`estimateStakingReward(${stakingId}): failed`, err)
    return { reward: 0, rewardTokenId: globalState?.rewardToken?.asNumber() || FRY_ASSET_ID }
  }
}

export const checkPoolRewardBalance = async (appId: number, rewardTokenId: number, algodConfigOverride?: AlgodConfigOverride) => {
  const algodConfig = algodConfigOverride
    ? { ...algodConfigOverride, network: '' }
    : getAlgodConfigFromViteEnvironment()
  const algod = algokit.getAlgoClient({
    server: algodConfig.server,
    port: algodConfig.port,
    token: algodConfig.token,
  })
  const appAddress = algosdk.getApplicationAddress(appId)
  try {
    if (rewardTokenId === 0) {
      // Native token: check ALGO balance
      const info = await algod.accountInformation(appAddress).do()
      return BigInt(info.amount || 0)
    }
    const info = await algod.accountAssetInformation(appAddress, rewardTokenId).do()
    return BigInt(info['asset-holding']?.amount ?? 0)
  } catch {
    return 0n
  }
}

export const getPoolRewardDeficit = async (appId: number, rewardTokenId: number, signer: TransactionSigner, sender: string, algodConfig?: AlgodConfigOverride, contractVersion?: number, tokenDecimals?: number) => {
  const decimals = tokenDecimals ?? 6

  const balanceMicro = await checkPoolRewardBalance(appId, rewardTokenId, algodConfig)

  const isV3 = contractVersion !== undefined && contractVersion >= 3
  const { stakingClient } = isV3
    ? await createFryStakingV3Client(signer, sender, appId, algodConfig)
    : await createFryStakingClient(signer, sender, appId, algodConfig)
  const globalState: any = await stakingClient.getGlobalState()
  const totalConfiguredMicro = BigInt(globalState.rewardTokenAmount?.asNumber() ?? 0)
  const totalDistributedMicro = BigInt(globalState.rewardsDistributed?.asNumber() ?? 0)

  const unclaimedMicro = totalConfiguredMicro - totalDistributedMicro
  const deficitMicro = unclaimedMicro > balanceMicro ? unclaimedMicro - balanceMicro : 0n
  const divisor = 10 ** decimals

  return {
    currentBalance: Number(balanceMicro) / divisor,
    totalConfigured: Number(totalConfiguredMicro) / divisor,
    totalDistributed: Number(totalDistributedMicro) / divisor,
    unclaimed: Number(unclaimedMicro) / divisor,
    deficit: Number(deficitMicro) / divisor,
    decimals,
  }
}

export const topUpRewards = async (
  appId: number,
  rewardTokenId: number,
  amount: number,
  sender: string,
  signer: TransactionSigner,
  contractVersion?: number,
) => {
  const isV3 = contractVersion !== undefined && contractVersion >= 3

  if (isV3 && rewardTokenId === 0) {
    // V3 native reward top-up
    const { stakingClient, algorandClient } = await createFryStakingV3Client(signer, sender, appId)

    const rewardPay = await algorandClient.transactions.payment({
      sender,
      receiver: algosdk.getApplicationAddress(appId),
      amount: algokit.microAlgos(amount),
      signer,
    })

    await stakingClient.nativeReceive({
      rewardPayment: rewardPay,
    })

    return { success: true, amount }
  } else {
    // ASA reward top-up (V2 or V3 with ASA rewards)
    const { stakingClient, algorandClient } = isV3
      ? await createFryStakingV3Client(signer, sender, appId)
      : await createFryStakingClient(signer, sender, appId)

    const rewardTx = await algorandClient.transactions.assetTransfer({
      assetId: BigInt(rewardTokenId),
      amount: BigInt(amount),
      receiver: algosdk.getApplicationAddress(appId),
      signer,
      sender,
    })

    await stakingClient.assetReceive({
      rewardTokenTransfer: rewardTx,
    })

    return { success: true, amount }
  }
}

/**
 * @deprecated takeOutAsset is not routed in the current TEAL contract.
 * The ABI method exists in the AppSpec but has no matching routing entry,
 * so calling it will always fail with "invalid method selector".
 * Renamed from getApr to make the broken state explicit.
 */
export const takeOutAsset_BROKEN = async (_stakingID: number, _sender: string, _signer: TransactionSigner) => {
  throw new Error(
    'takeOutAsset is not routed in the current FryStaking TEAL contract. ' +
    'This function cannot succeed until the contract is recompiled with the route enabled.'
  )
}

export const getUsersStakeData = async (stakingId: number, algodOverride?: algosdk.Algodv2) => {
  const algod = algodOverride || await getAlgodClient()
  const stakings: any[] = []
  const boxes = await algokit.getAppBoxNames(stakingId, algod)
  await Promise.all(
    boxes.map(async (bx) => {
      let box = await algokit.getAppBoxValue(stakingId, bx.nameRaw, algod)
      const stakerId = algosdk.encodeAddress(bx.nameRaw)
      const stakedAmount = algosdk.decodeUint64(box.slice(0, 8), 'mixed')
      const stakeTime = algosdk.decodeUint64(box.slice(8, 16), 'mixed')
      const claimed = algosdk.decodeUint64(box.slice(16, 24), 'mixed')

      let stakingData = {
        stakerId,
        stakedAmount,
        stakeTime,
        claimed,
      }
      stakings.push(stakingData)
    }),
  )

  return stakings
}

export const getUserData = async (stakingId: number, staker: string, algodOverride?: algosdk.Algodv2) => {
  const algod = algodOverride || await getAlgodClient()
  const boxes = await algokit.getAppBoxNames(stakingId, algod)
  let stakerData: any = boxes?.filter((item) => algosdk.encodeAddress(item.nameRaw) === staker)[0]
  if (!stakerData) {
    throw new Error(`Staker ${staker} not found in staking pool ${stakingId}`)
  }
  let box = await algokit.getAppBoxValue(stakingId, stakerData.nameRaw, algod)
  const stakerId = algosdk.encodeAddress(stakerData.nameRaw)
  const stakedAmount = algosdk.decodeUint64(box.slice(0, 8), 'mixed')
  const stakeTime = algosdk.decodeUint64(box.slice(8, 16), 'mixed')
  const claimed = algosdk.decodeUint64(box.slice(16, 24), 'mixed')

  let stakingData = {
    stakerId,
    stakedAmount,
    stakeTime,
    claimed,
  }

  return stakingData
}

export const getStakingData = async (stakingId: number, sender: string, signer: TransactionSigner, algodConfig?: AlgodConfigOverride, contractVersion?: number) => {
  try {
    const isV3 = contractVersion !== undefined && contractVersion >= 3
    const { stakingClient } = isV3
      ? await createFryStakingV3Client(signer, sender, stakingId, algodConfig) as any
      : await createFryStakingClient(signer, sender, stakingId, algodConfig)
    let globalState = await stakingClient.getGlobalState()
    return {
      apr: globalState.apr?.asNumber(),
      stakeToken: globalState?.stakeToken?.asNumber(),
      rewardToken: globalState?.rewardToken?.asNumber(),
      poolTime: globalState?.poolTime?.asNumber(),
      lockPeriod: globalState?.lockPeriod?.asNumber(),
      poolStartTime: globalState?.stakeStartTime?.asNumber(),
      poolEndTime: globalState?.stakeEndTime?.asNumber(),
      totalStaked: globalState?.totalStaked?.asNumber(),
    }
  } catch (e) {
    console.error('getStakingData error:', e)
    throw e
  }
}
