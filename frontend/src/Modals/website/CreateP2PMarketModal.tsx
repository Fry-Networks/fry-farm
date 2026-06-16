import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input, Modal, Steps, Switch } from 'antd'
import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'
import { useMultiChainWallet } from '../../hooks/useMultiChainWallet'
import { useChain } from '../../context/ChainContext'
import { useAuth } from '../../hooks/useAuth'
import { deployP2PMarket } from '../../p2p_swap_func'
import { registerP2PMarket } from '../../services/p2pSwapApi'
import { P2P_DEFAULT_FEE_BPS } from '../../config/p2pSwapConfig'
import TokenSelector from '../../components/shared/TokenSelector'
import type { DiscoveredToken } from '../../services/TokenDiscoveryService'

interface CreateP2PMarketModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSuccess: () => void;
}

const CreateP2PMarketModal: React.FC<CreateP2PMarketModalProps> = ({
  isOpen, setIsOpen, onSuccess,
}) => {
  const navigate = useNavigate()
  const { activeAddress, signer } = useMultiChainWallet()
  const { chainId, activeChain } = useChain()
  const { ensureAuth } = useAuth()

  const [step, setStep] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state
  const [offerToken, setOfferToken] = useState<DiscoveredToken | null>(null)
  const [requestToken, setRequestToken] = useState<DiscoveredToken | null>(null)
  const [isPrivate, setIsPrivate] = useState(false)
  const [gatedWallet, setGatedWallet] = useState('')

  const nativeSymbol = activeChain.nativeAsset.symbol

  const reset = () => {
    setStep(0)
    setOfferToken(null)
    setRequestToken(null)
    setIsPrivate(false)
    setGatedWallet('')
    setIsSubmitting(false)
  }

  const handleClose = () => {
    reset()
    setIsOpen(false)
  }

  const canProceedStep0 = offerToken !== null
  const canProceedStep1 = requestToken !== null && requestToken.id !== offerToken?.id
  const canSubmit = canProceedStep0 && canProceedStep1 && !!activeAddress && !!signer

  const pairName = `${offerToken?.symbol ?? '?'}/${requestToken?.symbol ?? '?'}`

  const handleSubmit = async () => {
    if (!canSubmit || !signer || !activeAddress || !offerToken || !requestToken) return
    setIsSubmitting(true)

    try {
      await ensureAuth()

      const algodConfig = {
        server: (activeChain.connection as any).algodServer,
        port: String((activeChain.connection as any).algodPort),
        token: (activeChain.connection as any).algodToken,
      }

      const { appId, appAddress, txId } = await deployP2PMarket(
        offerToken.id, requestToken.id, P2P_DEFAULT_FEE_BPS,
        activeAddress, signer, chainId,
        activeChain.feeRecipient || undefined,
        algodConfig,
      )

      // Register with backend
      await registerP2PMarket({
        appId,
        deployTxId: txId,
        offerAssetId: offerToken.id,
        requestAssetId: requestToken.id,
        feeBps: P2P_DEFAULT_FEE_BPS,
        offerAssetName: offerToken.name,
        offerAssetSymbol: offerToken.symbol,
        requestAssetName: requestToken.name,
        requestAssetSymbol: requestToken.symbol,
        isPrivate,
        gatedWallet: isPrivate ? gatedWallet : '',
      })

      toast.success(`Market ${pairName} deployed! App ID: ${appId}`)
      handleClose()
      onSuccess()
      navigate(`/p2p/${appId}`)
    } catch (err: any) {
      console.error('Deploy market failed:', err)
      toast.error(err?.message || 'Failed to deploy market')
    } finally {
      setIsSubmitting(false)
    }
  }

  const steps = [
    {
      title: 'Offer Asset',
      content: (
        <div className="space-y-4">
          <div className="text-center text-[var(--text-secondary)] mb-2">
            Which asset will makers sell in this market?
          </div>
          <TokenSelector
            label="Offer Asset"
            selected={offerToken}
            onSelect={setOfferToken}
            excludeIds={requestToken ? [requestToken.id] : []}
          />
        </div>
      ),
    },
    {
      title: 'Request Asset',
      content: (
        <div className="space-y-4">
          <div className="text-center text-[var(--text-secondary)] mb-2">
            Which asset will makers receive in return?
          </div>
          <TokenSelector
            label="Request Asset"
            selected={requestToken}
            onSelect={setRequestToken}
            excludeIds={offerToken ? [offerToken.id] : []}
          />
        </div>
      ),
    },
    {
      title: 'Options',
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-primary)]">Private market</span>
            <Switch checked={isPrivate} onChange={setIsPrivate} />
          </div>
          {isPrivate && (
            <>
              <p className="text-sm text-[var(--text-secondary)]">
                This market won't appear in the public list. Share the link directly.
              </p>
              <Input
                placeholder="Restrict to wallet address (optional)"
                value={gatedWallet}
                onChange={(e) => setGatedWallet(e.target.value.trim())}
                className="font-mono text-sm mt-3"
              />
              {gatedWallet && (
                <p className="text-xs text-[var(--text-secondary)]">
                  Only this wallet will be able to view and trade on this market.
                </p>
              )}
            </>
          )}
        </div>
      ),
    },
    {
      title: 'Deploy',
      content: (
        <div className="space-y-3">
          <div className="p-4 rounded-lg bg-[var(--bg-secondary)] space-y-2">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Market pair</span>
              <span className="font-bold text-[var(--text-primary)]">{pairName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Offer asset ID</span>
              <span className="text-[var(--text-primary)]">{offerToken?.id === 0 ? `${nativeSymbol} (native)` : offerToken?.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Request asset ID</span>
              <span className="text-[var(--text-primary)]">{requestToken?.id === 0 ? `${nativeSymbol} (native)` : requestToken?.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Taker fee</span>
              <span className="text-[var(--text-primary)]">{P2P_DEFAULT_FEE_BPS / 100}% (collected by Fry Networks)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Deploy cost</span>
              <span className="text-[var(--text-primary)]">~0.5 {nativeSymbol}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Visibility</span>
              <span className="text-[var(--text-primary)]">{isPrivate ? 'Private' : 'Public'}</span>
            </div>
            {isPrivate && gatedWallet && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Restricted to</span>
                <span className="text-[var(--text-primary)] font-mono text-xs">{gatedWallet.slice(0, 8)}...{gatedWallet.slice(-4)}</span>
              </div>
            )}
          </div>
          <div className="p-3 rounded border border-[#d4a017] bg-[#d4a01715] text-sm text-[var(--text-primary)]">
            <Icon icon="mdi:alert" className="inline mr-1 text-[#d4a017]" width={16} />
            The contract is immutable — the asset pair and fee cannot be changed after deployment.
            The contract is owned by you but fees are directed to Fry Networks.
          </div>
        </div>
      ),
    },
  ]

  const isLastStep = step === steps.length - 1
  const canNext = step === 0 ? canProceedStep0 : step === 1 ? canProceedStep1 : step === 2 ? true : false

  return (
    <Modal
      open={isOpen}
      onCancel={handleClose}
      title={<span className="font-apex text-lg">Create P2P Market</span>}
      footer={null}
      width={700}
      destroyOnClose
    >
      <div className="flex flex-col pt-[24px] pb-[24px] px-[24px]">
        <Steps current={step} size="small" className="mb-6"
          items={steps.map(s => ({ title: s.title }))}
          onChange={(s) => { if (s <= step) setStep(s) }}
        />

        <div className="min-h-[200px]">
          {steps[step].content}
        </div>

        <div className="flex justify-between mt-6">
          <button
            onClick={() => step > 0 ? setStep(step - 1) : handleClose()}
            className="px-4 py-2 rounded border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </button>

          {isLastStep ? (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || isSubmitting}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#DE0308] text-white font-bold disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {isSubmitting ? (
                <>
                  <Icon icon="mdi:loading" className="animate-spin" width={18} />
                  Deploying...
                </>
              ) : (
                'Deploy Market'
              )}
            </button>
          ) : (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canNext}
              className="px-5 py-2 rounded-lg bg-[#DE0308] text-white font-bold disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default CreateP2PMarketModal
