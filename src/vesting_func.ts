import * as algokit from '@algorandfoundation/algokit-utils'
import algosdk, { TransactionSigner } from 'algosdk'
import { EventVestingClient, APP_SPEC } from './contracts/EventVestingClient'
import { COMPILED_APPROVAL, COMPILED_CLEAR } from './contracts/EventVestingCompiled'
import { getAlgodConfigFromViteEnvironment } from './utils/network/getAlgoClientConfigs'

// Box: 32-byte key (Algorand address) + 32-byte value (4 x uint64)
// MBR = 2500 base + 400 * (32 key + 32 value) = 2500 + 25600 = 28100 microAlgo
// Source: contracts/event_vesting/contract.py:46
const BOX_MBR = 28_100

export interface AlgodConfigOverride {
  server: string
  port: string | number
  token: string
}

const createEventVestingClient = async (
  signer: TransactionSigner,
  activeAddress: string,
  appId: number,
  algodConfigOverride?: AlgodConfigOverride,
) => {
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

  const client = new EventVestingClient(
    {
      resolveBy: 'id',
      id: appId,
      sender: { addr: activeAddress, signer },
    },
    algorandClient.client.algod,
  )

  return { client, algorandClient, algodClient }
}

export const initVesting = async (
  authority: string,
  eventCaller: string,
  eventEnd: number,
  rewardTokenId: number,
  vestingStart: number,
  vestingEnd: number,
  cliffPeriod: number,
  sender: string,
  signer: TransactionSigner,
  algodConfigOverride?: AlgodConfigOverride,
): Promise<bigint> => {
  try {
    const algodConfig = algodConfigOverride
      ? { ...algodConfigOverride, network: '' }
      : getAlgodConfigFromViteEnvironment()
    const algodClient = algokit.getAlgoClient({
      server: algodConfig.server,
      port: algodConfig.port,
      token: algodConfig.token,
    })

    const abiContract = new algosdk.ABIContract(APP_SPEC.contract as any)
    const initMethod = abiContract.getMethodByName('init_vesting')

    const suggestedParams = await algodClient.getTransactionParams().do()

    const atc = new algosdk.AtomicTransactionComposer()
    atc.addMethodCall({
      appID: 0,
      method: initMethod,
      methodArgs: [
        authority,
        eventCaller,
        BigInt(eventEnd),
        rewardTokenId,
        BigInt(vestingStart),
        BigInt(vestingEnd),
        BigInt(cliffPeriod),
      ],
      approvalProgram: COMPILED_APPROVAL,
      clearProgram: COMPILED_CLEAR,
      numGlobalInts: 11,
      numGlobalByteSlices: 2,
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
      throw new Error('Failed to create EventVesting contract.')
    }

    return BigInt(createdAppId)
  } catch (e) {
    console.error('Error in initVesting:', e)
    throw e
  }
}

export const optInAsset = async (
  appId: number,
  assetId: number,
  sender: string,
  signer: TransactionSigner,
  algodConfigOverride?: AlgodConfigOverride,
): Promise<void> => {
  try {
    const { client, algorandClient } = await createEventVestingClient(signer, sender, appId, algodConfigOverride)

    const mbrPay = await algorandClient.transactions.payment({
      sender,
      receiver: algosdk.getApplicationAddress(appId),
      amount: algokit.algos(0.1),
      extraFee: algokit.algos(0.001),
      signer,
    })

    await client.optInAsset({ mbrPay, assetId })
  } catch (e) {
    console.error('Error in optInAsset:', e)
    throw e
  }
}

export const fundPool = async (
  appId: number,
  rewardTokenId: number,
  amount: bigint,
  sender: string,
  signer: TransactionSigner,
  algodConfigOverride?: AlgodConfigOverride,
): Promise<void> => {
  try {
    const { client, algorandClient } = await createEventVestingClient(signer, sender, appId, algodConfigOverride)

    if (rewardTokenId === 0) {
      const poolPayment = await algorandClient.transactions.payment({
        sender,
        receiver: algosdk.getApplicationAddress(appId),
        amount: algokit.microAlgos(Number(amount)),
        signer,
      })
      await client.fundPoolNative({ poolPayment })
    } else {
      const poolTransfer = await algorandClient.transactions.assetTransfer({
        sender,
        receiver: algosdk.getApplicationAddress(appId),
        assetId: BigInt(rewardTokenId),
        amount,
        signer,
      })
      await client.fundPool({ poolTransfer })
    }
  } catch (e) {
    console.error('Error in fundPool:', e)
    throw e
  }
}

export const seedAllocation = async (
  appId: number,
  participant: string,
  amount: bigint,
  sender: string,
  signer: TransactionSigner,
  algodConfigOverride?: AlgodConfigOverride,
): Promise<void> => {
  try {
    const { client, algorandClient } = await createEventVestingClient(signer, sender, appId, algodConfigOverride)

    const mbrPay = await algorandClient.transactions.payment({
      sender,
      receiver: algosdk.getApplicationAddress(appId),
      amount: algokit.microAlgos(BOX_MBR),
      signer,
    })

    await client.seedAllocation({ participant, amount, mbrPay })
  } catch (e) {
    console.error('Error in seedAllocation:', e)
    throw e
  }
}

export const seedBulk = async (
  appId: number,
  entries: [string, bigint][],
  sender: string,
  signer: TransactionSigner,
  algodConfigOverride?: AlgodConfigOverride,
): Promise<void> => {
  try {
    const { client, algorandClient } = await createEventVestingClient(signer, sender, appId, algodConfigOverride)

    const mbrPay = await algorandClient.transactions.payment({
      sender,
      receiver: algosdk.getApplicationAddress(appId),
      amount: algokit.microAlgos(BOX_MBR * entries.length),
      signer,
    })

    await client.seedBulk({ entries, mbrPay })
  } catch (e) {
    console.error('Error in seedBulk:', e)
    throw e
  }
}

export const finalizeVesting = async (
  appId: number,
  sender: string,
  signer: TransactionSigner,
  algodConfigOverride?: AlgodConfigOverride,
): Promise<void> => {
  try {
    const { client } = await createEventVestingClient(signer, sender, appId, algodConfigOverride)
    await client.finalize({})
  } catch (e) {
    console.error('Error in finalizeVesting:', e)
    throw e
  }
}

export const claimVesting = async (
  appId: number,
  sender: string,
  signer: TransactionSigner,
  algodConfigOverride?: AlgodConfigOverride,
): Promise<{ claimedAmount: bigint; txId: string }> => {
  try {
    const { client } = await createEventVestingClient(signer, sender, appId, algodConfigOverride)
    const result = await client.claim(
      {},
      { sendParams: { fee: algokit.algos(0.002) } },
    )
    return {
      claimedAmount: result.return?.valueOf() as bigint,
      txId: result.transaction.txID(),
    }
  } catch (e) {
    console.error('Error in claimVesting:', e)
    throw e
  }
}

export const sweepUnclaimed = async (
  appId: number,
  sender: string,
  signer: TransactionSigner,
  algodConfigOverride?: AlgodConfigOverride,
): Promise<bigint> => {
  try {
    const { client } = await createEventVestingClient(signer, sender, appId, algodConfigOverride)
    const result = await client.sweepUnclaimed(
      {},
      { sendParams: { fee: algokit.algos(0.002) } },
    )
    return result.return?.valueOf() as bigint
  } catch (e) {
    console.error('Error in sweepUnclaimed:', e)
    throw e
  }
}

export const getVestingInfo = async (
  appId: number,
  algodConfigOverride?: AlgodConfigOverride,
) => {
  const algodConfig = algodConfigOverride
    ? { ...algodConfigOverride, network: '' }
    : getAlgodConfigFromViteEnvironment()
  const algodClient = algokit.getAlgoClient({
    server: algodConfig.server,
    port: algodConfig.port,
    token: algodConfig.token,
  })

  const dummySigner: TransactionSigner = async () => []
  const client = new EventVestingClient(
    {
      resolveBy: 'id',
      id: appId,
      sender: { addr: algosdk.getApplicationAddress(Number(appId)), signer: dummySigner },
    },
    algodClient,
  )

  const result = await client.compose()
    .getVestingInfo({})
    .simulate({ allowEmptySignatures: true, allowUnnamedResources: true })

  const arr = result.returns[0] as bigint[]
  return {
    rewardToken: Number(arr[0]),
    totalAllocated: Number(arr[1]),
    totalClaimed: Number(arr[2]),
    vestingStart: Number(arr[3]),
    vestingEnd: Number(arr[4]),
    cliffPeriod: Number(arr[5]),
    participantCount: Number(arr[6]),
    poolFunded: Number(arr[7]),
    finalized: Number(arr[8]),
  }
}

export const getParticipantInfo = async (
  appId: number,
  participant: string,
  algodConfigOverride?: AlgodConfigOverride,
) => {
  const algodConfig = algodConfigOverride
    ? { ...algodConfigOverride, network: '' }
    : getAlgodConfigFromViteEnvironment()
  const algodClient = algokit.getAlgoClient({
    server: algodConfig.server,
    port: algodConfig.port,
    token: algodConfig.token,
  })

  const dummySigner: TransactionSigner = async () => []
  const client = new EventVestingClient(
    {
      resolveBy: 'id',
      id: appId,
      sender: { addr: algosdk.getApplicationAddress(Number(appId)), signer: dummySigner },
    },
    algodClient,
  )

  const result = await client.compose()
    .getParticipantInfo({ participant })
    .simulate({ allowEmptySignatures: true, allowUnnamedResources: true })

  const arr = result.returns[0] as bigint[]
  if (!arr || arr.length === 0) return null

  return {
    allocation: Number(arr[0]),
    claimed: Number(arr[1]),
    vested: Number(arr[2]),
    claimable: Number(arr[3]),
    lastClaimTime: Number(arr[4]),
    claimCount: Number(arr[5]),
  }
}

export const getVestingGlobalState = async (
  appId: number,
  sender: string,
  signer: TransactionSigner,
  algodConfigOverride?: AlgodConfigOverride,
) => {
  const { client } = await createEventVestingClient(signer, sender, appId, algodConfigOverride)
  return client.getGlobalState()
}
