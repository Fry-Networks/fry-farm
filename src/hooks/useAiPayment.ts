import { useState } from 'react'
import { useWallet } from '@txnlab/use-wallet'
import algosdk from 'algosdk'
import { useChain } from '../context/ChainContext'
import { useVoiWallet } from '../context/VoiWalletContext'
import { fetchVoiUsd } from '../contracts/nomadex/NomadexPriceService'
import { isAvmChain } from '../config/chains/types'
import { routeFeeViaRouter } from '../services/FeeService'

const FRY_ASA_ID = Number(import.meta.env.VITE_FRY_TOKEN_ID) || 2485314946
const ADMIN_WALLET = 'E2F2LT2INE75DBOYHQXTCTOP2PAP5MHAXQRXTTCCXFKHQTVG36DJONBQZE'
const ALGOD_SERVER = import.meta.env.VITE_ALGOD_SERVER || 'https://mainnet-api.algonode.cloud'

const useAiPayment = () => {
  const { activeAddress: algoAddress, signer: algoSigner } = useWallet()
  const { chainId, activeChain } = useChain()
  const voiWallet = useVoiWallet()
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const payForAnalysis = async (fryAmount: number, fryPriceUsd?: number): Promise<string | null> => {
    const isVoi = chainId === 'voi-mainnet'
    const activeAddress = isVoi ? voiWallet.address : algoAddress
    const signer = isVoi ? voiWallet.signer : algoSigner

    if (!activeAddress || !signer) {
      setError('Wallet not connected')
      return null
    }

    setIsProcessing(true)
    setError(null)

    try {
      if (isVoi && isAvmChain(activeChain)) {
        // Voi: charge equivalent USD value in VOI
        const usdCost = fryAmount * (fryPriceUsd || 0)
        if (usdCost <= 0) throw new Error('Could not determine analysis cost')

        const voiUsd = await fetchVoiUsd()
        if (!voiUsd || voiUsd <= 0) throw new Error('Could not fetch VOI price')

        const voiMicroAmount = Math.ceil((usdCost / voiUsd) * 1_000_000)
        const recipient = activeChain.feeRecipient
        if (!recipient) throw new Error('Voi fee recipient not configured')

        const algod = new algosdk.Algodv2(
          activeChain.connection.algodToken,
          activeChain.connection.algodServer,
          activeChain.connection.algodPort,
        )
        const params = await algod.getTransactionParams().do()

        const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
          from: activeAddress,
          to: recipient,
          amount: voiMicroAmount,
          suggestedParams: params,
        })

        const signedTxns: any = await signer([txn], [0])
        const { txId } = await algod.sendRawTransaction(signedTxns).do()
        await algosdk.waitForConfirmation(algod, txId, 4)

        return txId
      } else {
        // Algorand: charge FRY via FeeRouter
        const algod = new algosdk.Algodv2('', ALGOD_SERVER, '')
        const microAmount = fryAmount * 1_000_000

        const { txId } = await routeFeeViaRouter(activeAddress, signer, microAmount, FRY_ASA_ID, algod, activeChain?.feeRouterAppId, activeChain?.feeRouterAddr)
        await algosdk.waitForConfirmation(algod, txId, 4)

        return txId
      }
    } catch (err: any) {
      const msg = err?.message || ''
      if (msg.includes('CANCELLED') || msg.includes('rejected')) {
        setError('Transaction cancelled')
      } else if (msg.includes('balance') && msg.includes('below min')) {
        setError(isVoi ? 'Insufficient VOI balance' : 'Insufficient FRY balance')
      } else {
        setError(msg || 'Payment failed')
      }
      return null
    } finally {
      setIsProcessing(false)
    }
  }

  return { payForAnalysis, isProcessing, error, chainId }
}

export default useAiPayment
