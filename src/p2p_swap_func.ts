// @ts-nocheck — WIP: requestAssetId type not yet in generated client
import * as algokit from '@algorandfoundation/algokit-utils'
import algosdk, { TransactionSigner } from 'algosdk'
import { FryP2PSwapClient } from './contracts/FryP2PSwapClient'
import { getAlgodConfigFromViteEnvironment } from './utils/network/getAlgoClientConfigs'
import { P2P_BOX_MBR, P2P_FEE_CREATE, P2P_FEE_ACCEPT, P2P_FEE_CANCEL, P2P_FEE_UPDATE, P2P_GLOBAL_INTS, P2P_GLOBAL_BYTES, P2P_APP_MBR, P2P_ASA_OPT_IN_MBR } from './config/p2pSwapConfig'
import { ALGO_COMPILED_APPROVAL, ALGO_COMPILED_CLEAR, VOI_COMPILED_APPROVAL, VOI_COMPILED_CLEAR, P2P_EXTRA_PAGES } from './contracts/FryP2PSwapCompiled'
// @ts-ignore — ARC32 JSON import for ABI method resolution
import P2P_APP_SPEC from './contracts/FryP2PSwap.arc32.json'
import { routeFeeViaRouter } from './services/FeeService'

export interface AlgodConfigOverride {
  server: string;
  port: string | number;
  token: string;
}

const ZERO_ADDRESS = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ'

/**
 * Encode an offer ID as 8-byte big-endian Uint8Array for box references.
 */
export function encodeOfferId(offerId: number): Uint8Array {
  const buf = new ArrayBuffer(8)
  new DataView(buf).setBigUint64(0, BigInt(offerId))
  return new Uint8Array(buf)
}

/**
 * Create a P2P swap client for an existing market contract.
 */
const createP2PSwapClient = async (
  signer: TransactionSigner,
  activeAddress: string,
  appId: number,
  algodConfigOverride?: AlgodConfigOverride,
) => {
  algokit.Config.configure({ populateAppCallResources: true })

  const algodConfig = algodConfigOverride
    ? { ...algodConfigOverride, network: '' }
    : getAlgodConfigFromViteEnvironment()
  const algorandClient = algokit.AlgorandClient.fromConfig({ algodConfig })
  algorandClient.setDefaultSigner(signer)

  const algodClient = algokit.getAlgoClient({
    server: algodConfig.server,
    port: algodConfig.port,
    token: algodConfig.token,
  })

  const p2pClient = new FryP2PSwapClient(
    {
      resolveBy: 'id',
      id: appId,
      sender: { addr: activeAddress!, signer },
    },
    algorandClient.client.algod,
  )

  return { p2pClient, algorandClient, algodClient }
}

// ────────────────────────────────────────────────────────────────
// CREATE OFFER (ASA → native, e.g. FRY → ALGO)
// ────────────────────────────────────────────────────────────────

export const createOfferAsa = async (
  appId: number,
  offerAssetId: number,
  offerAmount: number,
  requestAmount: number,
  counterparty: string,
  expiry: number,
  sender: string,
  signer: TransactionSigner,
  algodConfig?: AlgodConfigOverride,
  feeAmount?: number,
  feeTokenId?: number,
  feeRecipient?: string, feeRouterAppId?: number | null, feeRouterAddr?: string | null) => {
  try {
    const appAddress = algosdk.getApplicationAddress(appId)
    const { p2pClient, algorandClient, algodClient } = await createP2PSwapClient(signer, sender, appId, algodConfig)

    // Read request_asset_id from global state
    const globalState = await p2pClient.getGlobalState()
    const requestAssetId = globalState.requestAssetId?.asNumber() ?? 0

    // Build asset transfer (escrow the offered ASA)
    const assetTransfer = await algorandClient.transactions.assetTransfer({
      sender,
      receiver: appAddress,
      amount: BigInt(offerAmount),
      assetId: BigInt(offerAssetId),
      signer,
    })

    // Build box MBR payment
    const boxPayment = await algorandClient.transactions.payment({
      sender,
      receiver: appAddress,
      amount: algokit.microAlgos(P2P_BOX_MBR),
      signer,
    })

    const result = await p2pClient.createOfferAsa(
      {
        assetTransfer,
        boxPayment,
        requestAmount,
        counterparty: counterparty || ZERO_ADDRESS,
        expiry,
      },
      {
        sendParams: { fee: algokit.microAlgos(P2P_FEE_CREATE) },
      },
    )

    // Wait for confirmation
    const txId = result.transaction.txID()
    await algosdk.waitForConfirmation(algodClient, txId, 4)

    // Parse returned offer ID
    const offerId = Number(result.return)

    // Send platform fee after successful offer creation
    let feeTxId: string | undefined
    if (feeAmount && feeAmount > 0) {
      try {
        const feeRouterResult = await routeFeeViaRouter(sender, signer, feeAmount, feeTokenId || 0, algodClient, feeRouterAppId, feeRouterAddr)
        feeTxId = feeRouterResult.txId
      } catch (feeErr) {
        throw new Error(
          `Offer created on-chain (ID: ${offerId}) but platform fee payment failed: ${(feeErr as Error).message || feeErr}. Please contact support with your offer ID.`
        )
      }
    }

    return { offerId, txId, feeTxId }
  } catch (e) {
    console.error('Error in createOfferAsa:', e)
    throw e
  }
}

// ────────────────────────────────────────────────────────────────
// CREATE OFFER (native → ASA, e.g. ALGO → FRY)
// ────────────────────────────────────────────────────────────────

export const createOfferAlgo = async (
  appId: number,
  offerAmount: number,
  requestAmount: number,
  counterparty: string,
  expiry: number,
  sender: string,
  signer: TransactionSigner,
  algodConfig?: AlgodConfigOverride,
  feeAmount?: number,
  feeTokenId?: number,
  feeRecipient?: string, feeRouterAppId?: number | null, feeRouterAddr?: string | null) => {
  try {
    const appAddress = algosdk.getApplicationAddress(appId)
    const { p2pClient, algorandClient, algodClient } = await createP2PSwapClient(signer, sender, appId, algodConfig)

    const globalState = await p2pClient.getGlobalState()
    const requestAssetId = globalState.requestAssetId?.asNumber() ?? 0

    // Offer payment (native ALGO/VOI)
    const offerPayment = await algorandClient.transactions.payment({
      sender,
      receiver: appAddress,
      amount: algokit.microAlgos(offerAmount),
      signer,
    })

    // Box MBR payment
    const boxPayment = await algorandClient.transactions.payment({
      sender,
      receiver: appAddress,
      amount: algokit.microAlgos(P2P_BOX_MBR),
      signer,
    })

    const result = await p2pClient.createOfferAlgo(
      {
        offerPayment,
        boxPayment,
        offerAmount,
        requestAmount,
        counterparty: counterparty || ZERO_ADDRESS,
        expiry,
      },
      {
        sendParams: { fee: algokit.microAlgos(P2P_FEE_CREATE) },
      },
    )

    const txId = result.transaction.txID()
    await algosdk.waitForConfirmation(algodClient, txId, 4)
    const offerId = Number(result.return)

    // Send platform fee after successful offer creation
    let feeTxId: string | undefined
    if (feeAmount && feeAmount > 0) {
      try {
        const feeRouterResult = await routeFeeViaRouter(sender, signer, feeAmount, feeTokenId || 0, algodClient, feeRouterAppId, feeRouterAddr)
        feeTxId = feeRouterResult.txId
      } catch (feeErr) {
        throw new Error(
          `Offer created on-chain (ID: ${offerId}) but platform fee payment failed: ${(feeErr as Error).message || feeErr}. Please contact support with your offer ID.`
        )
      }
    }

    return { offerId, txId, feeTxId }
  } catch (e) {
    console.error('Error in createOfferAlgo:', e)
    throw e
  }
}

// ────────────────────────────────────────────────────────────────
// ACCEPT OFFER (taker sends native, e.g. ALGO → get FRY)
// ────────────────────────────────────────────────────────────────

export const acceptOfferAlgo = async (
  appId: number,
  offerId: number,
  requestAmount: number,
  feeRecipient: string,
  makerAddress: string,
  sender: string,
  signer: TransactionSigner,
  algodConfig?: AlgodConfigOverride,
  platformFeeAmount?: number,
  platformFeeTokenId?: number,
  platformFeeRecipient?: string, feeRouterAppId?: number | null, feeRouterAddr?: string | null) => {
  try {
    const appAddress = algosdk.getApplicationAddress(appId)
    const { p2pClient, algorandClient, algodClient } = await createP2PSwapClient(signer, sender, appId, algodConfig)

    // Taker payment (send ALGO/VOI to contract)
    const takerPayment = await algorandClient.transactions.payment({
      sender,
      receiver: appAddress,
      amount: algokit.microAlgos(requestAmount),
      signer,
    })

    const result = await p2pClient.acceptOfferAlgo(
      {
        offerId,
        takerPayment,
      },
      {
        sendParams: {
          fee: algokit.microAlgos(P2P_FEE_ACCEPT),
        },
        // CRITICAL: include fee_recipient and maker in foreign accounts
        accounts: [feeRecipient, makerAddress],
        boxes: [{ appIndex: 0, name: encodeOfferId(offerId) }],
      },
    )

    const txId = result.transaction.txID()
    await algosdk.waitForConfirmation(algodClient, txId, 4)

    // Send platform fee after successful accept
    let feeTxId: string | undefined
    if (platformFeeAmount && platformFeeAmount > 0) {
      try {
        const feeRouterResult = await routeFeeViaRouter(sender, signer, platformFeeAmount, platformFeeTokenId || 0, algodClient, feeRouterAppId, feeRouterAddr)
        feeTxId = feeRouterResult.txId
      } catch (feeErr) {
        throw new Error(
          `Offer accepted on-chain (TxID: ${txId}) but platform fee payment failed: ${(feeErr as Error).message || feeErr}. Please contact support.`
        )
      }
    }

    return { txId, feeTxId }
  } catch (e) {
    console.error('Error in acceptOfferAlgo:', e)
    throw e
  }
}

// ────────────────────────────────────────────────────────────────
// ACCEPT OFFER (taker sends ASA, e.g. FRY → get ALGO)
// ────────────────────────────────────────────────────────────────

export const acceptOfferAsa = async (
  appId: number,
  offerId: number,
  requestAssetId: number,
  requestAmount: number,
  feeRecipient: string,
  makerAddress: string,
  sender: string,
  signer: TransactionSigner,
  algodConfig?: AlgodConfigOverride,
  platformFeeAmount?: number,
  platformFeeTokenId?: number,
  platformFeeRecipient?: string, feeRouterAppId?: number | null, feeRouterAddr?: string | null) => {
  try {
    const appAddress = algosdk.getApplicationAddress(appId)
    const { p2pClient, algorandClient, algodClient } = await createP2PSwapClient(signer, sender, appId, algodConfig)

    const takerTransfer = await algorandClient.transactions.assetTransfer({
      sender,
      receiver: appAddress,
      amount: BigInt(requestAmount),
      assetId: BigInt(requestAssetId),
      signer,
    })

    const result = await p2pClient.acceptOfferAsa(
      {
        offerId,
        takerTransfer,
      },
      {
        sendParams: {
          fee: algokit.microAlgos(P2P_FEE_ACCEPT),
        },
        accounts: [feeRecipient, makerAddress],
        boxes: [{ appIndex: 0, name: encodeOfferId(offerId) }],
      },
    )

    const txId = result.transaction.txID()
    await algosdk.waitForConfirmation(algodClient, txId, 4)

    // Send platform fee after successful accept
    let feeTxId: string | undefined
    if (platformFeeAmount && platformFeeAmount > 0) {
      try {
        const feeRouterResult = await routeFeeViaRouter(sender, signer, platformFeeAmount, platformFeeTokenId || 0, algodClient, feeRouterAppId, feeRouterAddr)
        feeTxId = feeRouterResult.txId
      } catch (feeErr) {
        throw new Error(
          `Offer accepted on-chain (TxID: ${txId}) but platform fee payment failed: ${(feeErr as Error).message || feeErr}. Please contact support.`
        )
      }
    }

    return { txId, feeTxId }
  } catch (e) {
    console.error('Error in acceptOfferAsa:', e)
    throw e
  }
}

// ────────────────────────────────────────────────────────────────
// CANCEL OFFER
// ────────────────────────────────────────────────────────────────

export const cancelP2POffer = async (
  appId: number,
  offerId: number,
  sender: string,
  signer: TransactionSigner,
  algodConfig?: AlgodConfigOverride,
) => {
  try {
    const { p2pClient, algodClient } = await createP2PSwapClient(signer, sender, appId, algodConfig)

    const result = await p2pClient.cancelOffer(
      { offerId },
      {
        sendParams: { fee: algokit.microAlgos(P2P_FEE_CANCEL) },
        boxes: [{ appIndex: 0, name: encodeOfferId(offerId) }],
      },
    )

    const txId = result.transaction.txID()
    await algosdk.waitForConfirmation(algodClient, txId, 4)

    return { txId }
  } catch (e) {
    console.error('Error in cancelP2POffer:', e)
    throw e
  }
}

// ────────────────────────────────────────────────────────────────
// UPDATE OFFER (reprice)
// ────────────────────────────────────────────────────────────────

export const updateP2POffer = async (
  appId: number,
  offerId: number,
  newRequestAmount: number,
  sender: string,
  signer: TransactionSigner,
  algodConfig?: AlgodConfigOverride,
) => {
  try {
    const { p2pClient, algodClient } = await createP2PSwapClient(signer, sender, appId, algodConfig)

    const result = await p2pClient.updateOffer(
      { offerId, newRequestAmount },
      {
        sendParams: { fee: algokit.microAlgos(P2P_FEE_UPDATE) },
        boxes: [{ appIndex: 0, name: encodeOfferId(offerId) }],
      },
    )

    const txId = result.transaction.txID()
    await algosdk.waitForConfirmation(algodClient, txId, 4)

    return { txId }
  } catch (e) {
    console.error('Error in updateP2POffer:', e)
    throw e
  }
}

// ────────────────────────────────────────────────────────────────
// RECLAIM EXPIRED
// ────────────────────────────────────────────────────────────────

export const reclaimExpiredOffer = async (
  appId: number,
  offerId: number,
  sender: string,
  signer: TransactionSigner,
  algodConfig?: AlgodConfigOverride,
) => {
  try {
    const { p2pClient, algodClient } = await createP2PSwapClient(signer, sender, appId, algodConfig)

    const result = await p2pClient.reclaimExpired(
      { offerId },
      {
        sendParams: { fee: algokit.microAlgos(P2P_FEE_CANCEL) },
        boxes: [{ appIndex: 0, name: encodeOfferId(offerId) }],
      },
    )

    const txId = result.transaction.txID()
    await algosdk.waitForConfirmation(algodClient, txId, 4)

    return { txId }
  } catch (e) {
    console.error('Error in reclaimExpiredOffer:', e)
    throw e
  }
}

// ────────────────────────────────────────────────────────────────
// DEPLOY NEW P2P MARKET (permissionless)
// ────────────────────────────────────────────────────────────────

export const deployP2PMarket = async (
  offerAssetId: number,
  requestAssetId: number,
  feeBps: number,
  sender: string,
  signer: TransactionSigner,
  chainId: string,
  feeRecipient?: string,
  algodConfigOverride?: AlgodConfigOverride,
) => {
  try {
    const algodConfig = algodConfigOverride
      ? { ...algodConfigOverride, network: '' }
      : getAlgodConfigFromViteEnvironment()
    const algodClient = algokit.getAlgoClient({
      server: algodConfig.server,
      port: algodConfig.port,
      token: algodConfig.token,
    })

    // 1. Select pre-compiled bytecode for this chain
    const isVoi = chainId === 'voi-mainnet'
    const approvalBytes = isVoi ? VOI_COMPILED_APPROVAL : ALGO_COMPILED_APPROVAL
    const clearBytes = isVoi ? VOI_COMPILED_CLEAR : ALGO_COMPILED_CLEAR

    // 2. Build ATC with init method call (appID: 0 = create)
    const abiContract = new algosdk.ABIContract(P2P_APP_SPEC.contract as any)
    const initMethod = abiContract.getMethodByName('init')

    const suggestedParams = await algodClient.getTransactionParams().do()
    suggestedParams.flatFee = true
    suggestedParams.fee = 2000

    const extraPages = P2P_EXTRA_PAGES

    const atc = new algosdk.AtomicTransactionComposer()
    atc.addMethodCall({
      appID: 0,
      method: initMethod,
      methodArgs: [
        feeRecipient || sender, // fee_recipient: address
        feeBps,           // fee_bps: uint64
        offerAssetId,     // offer_asset_id: uint64
        requestAssetId,   // request_asset_id: uint64
      ],
      approvalProgram: approvalBytes,
      clearProgram: clearBytes,
      numGlobalInts: P2P_GLOBAL_INTS,
      numGlobalByteSlices: P2P_GLOBAL_BYTES,
      numLocalInts: 0,
      numLocalByteSlices: 0,
      extraPages,
      sender,
      signer,
      suggestedParams,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
    })

    const result = await atc.execute(algodClient, 4)
    const appId = result.methodResults[0].txInfo?.['application-index']
    if (!appId) throw new Error('Failed to extract app ID from deploy transaction')

    const appAddress = algosdk.getApplicationAddress(appId)
    const txId = result.txIDs[0]

    // 3. Fund the app address for MBR
    const nonNativeCount = (offerAssetId !== 0 ? 1 : 0) + (requestAssetId !== 0 ? 1 : 0)
    const fundAmount = P2P_APP_MBR + (P2P_ASA_OPT_IN_MBR * nonNativeCount) + (extraPages * 100_000)

    const algorandClient = algokit.AlgorandClient.fromConfig({ algodConfig })
    algorandClient.setDefaultSigner(signer)

    await algorandClient.send.payment({
      sender,
      signer,
      receiver: appAddress,
      amount: algokit.microAlgos(fundAmount),
    })

    // 4. Opt the app into non-native ASAs
    const p2pClient = new FryP2PSwapClient(
      { resolveBy: 'id', id: appId, sender: { addr: sender, signer } },
      algorandClient.client.algod,
    )

    if (offerAssetId !== 0) {
      const mbrPayment = await algorandClient.transactions.payment({
        sender,
        receiver: appAddress,
        amount: algokit.microAlgos(P2P_ASA_OPT_IN_MBR),
        signer,
      })
      await p2pClient.optInAsset(
        { asset: offerAssetId, mbrPayment },
        { sendParams: { fee: algokit.microAlgos(2000) } },
      )
    }

    if (requestAssetId !== 0) {
      const mbrPayment = await algorandClient.transactions.payment({
        sender,
        receiver: appAddress,
        amount: algokit.microAlgos(P2P_ASA_OPT_IN_MBR),
        signer,
      })
      await p2pClient.optInAsset(
        { asset: requestAssetId, mbrPayment },
        { sendParams: { fee: algokit.microAlgos(2000) } },
      )
    }

    return { appId, appAddress, txId }
  } catch (e) {
    console.error('Error in deployP2PMarket:', e)
    throw e
  }
}
