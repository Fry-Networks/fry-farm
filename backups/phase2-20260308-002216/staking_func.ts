import * as algokit from '@algorandfoundation/algokit-utils'
import { TransactionSignerAccount } from '@algorandfoundation/algokit-utils/types/account'
import { AppDetails } from '@algorandfoundation/algokit-utils/types/app-client'
import algosdk, { TransactionSigner } from 'algosdk'
import { FryStakingClient } from './contracts/FryStaking'
import { getAlgodConfigFromViteEnvironment, getIndexerConfigFromViteEnvironment } from './utils/network/getAlgoClientConfigs'
import { authFetch } from './services/apiClient'

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

const createFryStakingClient = async (signer: TransactionSigner, activeAddress: string, appId: number) => {
  algokit.Config.configure({ populateAppCallResources: true })

  const algodConfig = getAlgodConfigFromViteEnvironment()
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

export const initStaking = async (
  stakeTokenId: number,
  rewardTokenId: number,
  rewardTokenAmount: number,
  poolTime: number,
  startDate: number,
  lockPeriod: number,
  sender: string,
  signer: TransactionSigner,
) => {
  try {
    // Validate that reward token is not ALGO (tokenId 0) as it requires payment, not asset transfer
    if (rewardTokenId === 0) {
      throw new Error('ALGO cannot be used as a reward token. Please select a different token.')
    }

    if (!stakeTokenId || stakeTokenId === 0) {
      throw new Error('Invalid stake token ID: token ID cannot be zero')
    }

    // Validate reward token amount
    if (rewardTokenAmount <= 0) {
      throw new Error('Reward token amount must be greater than 0')
    }
    
    const indexer = await getIndexerClient()

    const algodClient = await getAlgodClient()
    const appDetails = {
      resolveBy: 'creatorAndName',
      sender: { signer, addr: sender } as TransactionSignerAccount,
      creatorAddress: sender,
      findExistingUsing: indexer,
    } as AppDetails

    const staking = new FryStakingClient(appDetails, algodClient)

    const initStake = await staking.create
      .initStaking({
        authority: sender,
        stakeToken: stakeTokenId,
        rewardToken: rewardTokenId,
        rewardTokenAmount: rewardTokenAmount,
        stakeStartTime: BigInt(startDate),
        stakeEndTime: BigInt(startDate + poolTime),
        lockPeriod: lockPeriod,
        poolTime: poolTime,
      })
      .then((res) => res)
      .catch((e) => {
        console.error('Error in initStaking creation:', e)
        // Throw the error so it can be caught by the outer try-catch
        throw e
      })

    const { stakingClient, algorandClient } = await createFryStakingClient(signer, sender, Number(initStake.appId))

    // Send initial payment to cover minimum balance requirement (MBR)
    // Contract needs: 0.1 ALGO (base) + 0.1 ALGO per unique asset + 0.1 ALGO buffer
    // For same-token pools (stake == reward), only 1 unique asset opt-in is needed
    const uniqueAssets = stakeTokenId === rewardTokenId ? 1 : 2;
    const mbrAmount = 0.1 + (uniqueAssets * 0.1) + 0.1; // base + per-asset + buffer
    await algorandClient.send.payment({
      sender,
      receiver: algosdk.getApplicationAddress(initStake.appId),
      amount: algokit.algos(mbrAmount),
      extraFee: algokit.algos(0.001),
    })
    
    // Wait a moment to ensure the payment is confirmed before proceeding
    await new Promise((resolve) => setTimeout(resolve, 500))
    
    if (initStake?.appId) {
      // MBR payment for asset opt-in (0.1 ALGO per asset)
      // This payment is included in the optInAsset transaction group
      // Note: The initial payment of 0.5 ALGO should be sufficient, but this MBR payment
      // is still required as part of the opt-in transaction structure
      const mbrPay = await algorandClient.transactions.payment({
        sender,
        receiver: algosdk.getApplicationAddress(initStake?.appId),
        amount: algokit.algos(0.1),
        extraFee: algokit.algos(0.002),
        signer,
      })

      const rewardtx = await algorandClient.transactions.assetTransfer({
        assetId: BigInt(rewardTokenId),
        amount: BigInt(rewardTokenAmount),
        receiver: algosdk.getApplicationAddress(initStake?.appId),
        signer,
        sender,
      })

      const isSameToken = stakeTokenId === rewardTokenId
      await stakingClient
        .optInAsset(
          {
            assetOne: rewardTokenId,
            assetTwo: stakeTokenId,
            mbrPay: mbrPay,
          },
          isSameToken
            ? {
                assets: [stakeTokenId],
                sendParams: {
                  populateAppCallResources: false,
                  fee: algokit.algos(0.003),
                },
              }
            : {},
        )
        .then((res) => res)

      await stakingClient
        .assetReceive({
          rewardTokenTransfer: rewardtx,
        })
        .then((res) => res)

      await algorandClient.send.assetTransfer({
        sender,
        signer,
        receiver: algosdk.getApplicationAddress(initStake?.appId),
        amount: 1_000_000n, // 1 FRY assuming 6 decimals
        assetId: BigInt(rewardTokenId),
      })
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

//!Marketplace functions
const BOX_PRICE = 2500 + 400 * 64
export const stakeTokens = async (stakingId: number, stakeAmount: number, sender: string, signer: TransactionSigner, feeAmount: number, feeTokenId: number, feeRecipient: string) => {
  try {
    const { stakingClient, algorandClient } = await createFryStakingClient(signer, sender, stakingId)
    let globalState: any = await stakingClient.getGlobalState()

    // Send fee in the transacted token BEFORE contract call
    if (feeAmount > 0) {
      await algorandClient.send.assetTransfer({
        sender,
        signer,
        receiver: feeRecipient,
        amount: BigInt(feeAmount),
        assetId: BigInt(feeTokenId),
      });

      authFetch(`${import.meta.env.VITE_API_BASE_URL}/gasfee/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: stakingId,
          userId: sender,
          gasAmount: feeAmount,
          gasType: 'stakingStake',
          feeType: 'percentage',
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) console.log('Fee logged:', data);
          else console.warn('Fee log response:', data.message);
        })
        .catch((err) => console.error('Error logging fee:', err));
    }

    const boxTx = await algorandClient.transactions.payment({
      receiver: algosdk.getApplicationAddress(stakingId),
      sender,
      amount: algokit.microAlgos(BOX_PRICE),
    })

    const assetTransfer = await algorandClient.transactions.assetTransfer({
      receiver: algosdk.getApplicationAddress(stakingId),
      sender,
      amount: BigInt(stakeAmount),
      assetId: globalState?.stakeToken?.asNumber(),
    })

    let updatedApr =
      (globalState.rewardTokenAmount?.asNumber() / (globalState.totalStaked?.asNumber() + stakeAmount)) *
      100 *
      ((86400 * 360) / globalState.poolTime.asNumber())
    const tx = await stakingClient
      .stakeTokens({ stakeAmount, boxTx, updatedApr: Math.floor(updatedApr * 100), stakeAxfer: assetTransfer })
      .then((res) => res)
      .catch((e) => e)
    return tx
  } catch (e) {
    console.error('Error in stakeTokens:', e)
    return e
  }
}


export const unstakeTokens = async (
  stakingId: number,
  unstakeAmount: number,
  sender: string,
  signer: TransactionSigner,
  feeAmount: number,
  feeTokenId: number,
  feeRecipient: string
) => {
  try {
    const { stakingClient, algorandClient, algodClient } = await createFryStakingClient(signer, sender, stakingId)
    const globalState: any = await stakingClient.getGlobalState()
    const stakerData = await getUserData(stakingId, sender)

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
      .then((res) => res)
      .catch((e) => e)

    // Send fee in the transacted token AFTER contract call
    if (feeAmount > 0) {
      await algorandClient.send.assetTransfer({
        sender,
        signer,
        receiver: feeRecipient,
        amount: BigInt(feeAmount),
        assetId: BigInt(feeTokenId),
      });

      authFetch(`${import.meta.env.VITE_API_BASE_URL}/gasfee/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: stakingId,
          userId: sender,
          gasAmount: feeAmount,
          gasType: 'stakingWithdraw',
          feeType: 'percentage',
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) console.log('Fee logged:', data);
          else console.warn('Fee log response:', data.message);
        })
        .catch((err) => console.error('Error logging fee:', err));
    }

    return tx
  } catch (e) {
    console.error('Error in unstakeTokens:', e)
    return e
  }
}


export const claimTokens = async (
  stakingId: number,
  sender: string,
  signer: TransactionSigner,
  feeAmount: number,
  feeTokenId: number,
  feeRecipient: string
) => {
  try {
    const { stakingClient, algorandClient } = await createFryStakingClient(signer, sender, stakingId)
    const globalState: any = await stakingClient.getGlobalState()
    const stakerData = await getUserData(stakingId, sender)

    const stakedAmount = Number(stakerData?.stakedAmount)
    const stakeTime = Number(stakerData?.stakeTime)

    // Calculate reward
    const reward =
      stakedAmount *
      (globalState?.apr?.asNumber() / 10000) *
      ((Math.floor(Date.now() / 1000) - stakeTime) / 31104000)

    const updatedApr =
      ((globalState.rewardTokenAmount?.asNumber() - reward) / globalState.totalStaked?.asNumber()) *
      100 *
      ((86400 * 360) / globalState.poolTime.asNumber())

    // Call contract method
    const tx = await stakingClient
      .claimTokens(
        { updatedApr: Math.floor(updatedApr * 100) },
        { sendParams: { fee: algokit.algos(0.002) } }
      )
      .then((res) => res)
      .catch((e) => e)

    // Send fee in the reward token AFTER contract call
    if (feeAmount > 0) {
      await algorandClient.send.assetTransfer({
        sender,
        signer,
        receiver: feeRecipient,
        amount: BigInt(feeAmount),
        assetId: BigInt(feeTokenId),
      });

      authFetch(`${import.meta.env.VITE_API_BASE_URL}/gasfee/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: stakingId,
          userId: sender,
          gasAmount: feeAmount,
          gasType: 'stakingClaim',
          feeType: 'percentage',
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) console.log('Fee logged:', data);
          else console.warn('Fee log response:', data.message);
        })
        .catch((err) => console.error('Error logging fee:', err));
    }

    // Return useful data
    return {
      tx,
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


export const estimateStakingReward = async (stakingId: number, sender: string, signer: TransactionSigner) => {
  const { stakingClient } = await createFryStakingClient(signer, sender, stakingId)
  const globalState: any = await stakingClient.getGlobalState()
  const FRY_ASSET_ID = Number(import.meta.env.VITE_FRY_TOKEN_ID) || 2485314946

  try {
    const stakerData = await getUserData(stakingId, sender)
    const stakedAmount = Number(stakerData.stakedAmount)
    const stakeTime = Number(stakerData.stakeTime)
    const reward = stakedAmount *
      (globalState?.apr?.asNumber() / 10000) *
      ((Math.floor(Date.now() / 1000) - stakeTime) / 31104000)
    const rewardTokenId = globalState?.rewardToken?.asNumber() || FRY_ASSET_ID
    return { reward: Math.floor(reward), rewardTokenId }
  } catch {
    return { reward: 0, rewardTokenId: globalState?.rewardToken?.asNumber() || FRY_ASSET_ID }
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

export const getUsersStakeData = async (stakingId: number) => {
  const algod = await getAlgodClient()
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

export const getUserData = async (stakingId: number, staker: string) => {
  const algod = await getAlgodClient()
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

export const getStakingData = async (stakingId: number, sender: string, signer: TransactionSigner) => {
  try {
    const { stakingClient } = await createFryStakingClient(signer, sender, stakingId)
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
