import { useEffect, useState } from 'react'
import { DatePicker, Modal, Steps, InputNumber, Select, Input, Switch } from 'antd'
import dayjs from 'dayjs'
import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'
import { useMultiChainWallet } from '../../hooks/useMultiChainWallet'
import { useChain } from '../../context/ChainContext'
import { useAuth } from '../../hooks/useAuth'
import { createOfferAsa, createOfferAlgo } from '../../p2p_swap_func'
import { recordP2POffer } from '../../services/p2pSwapApi'
import { fetchFeeConfig, calculateFeeSimple } from '../../services/FeeService'
import { P2P_BOX_MBR, EXPIRY_OPTIONS, type P2PMarketConfig } from '../../config/p2pSwapConfig'

interface CreateP2POfferWizardProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  market: P2PMarketConfig;
  onSuccess: () => void;
}

const CreateP2POfferWizard: React.FC<CreateP2POfferWizardProps> = ({
  isOpen, setIsOpen, market, onSuccess,
}) => {
  const { activeAddress, signer } = useMultiChainWallet()
  const { activeChain } = useChain()
  const { ensureAuth } = useAuth()

  const [step, setStep] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [platformFeePercent, setPlatformFeePercent] = useState(0)

  // Fetch platform fee config on open
  useEffect(() => {
    if (isOpen) {
      fetchFeeConfig().then(config => {
        setPlatformFeePercent(config.p2pCreateFeePercent ?? 0)
      }).catch(() => {})
    }
  }, [isOpen])

  // Form state
  const [offerAmount, setOfferAmount] = useState<number | null>(null)
  const [requestAmount, setRequestAmount] = useState<number | null>(null)
  const [isPrivate, setIsPrivate] = useState(false)
  const [counterparty, setCounterparty] = useState('')
  const [expirySeconds, setExpirySeconds] = useState(0)
  const [customExpiry, setCustomExpiry] = useState<Date | null>(null)

  const reset = () => {
    setStep(0)
    setOfferAmount(null)
    setRequestAmount(null)
    setIsPrivate(false)
    setCounterparty('')
    setExpirySeconds(0)
    setCustomExpiry(null)
    setIsSubmitting(false)
  }

  const handleClose = () => {
    reset()
    setIsOpen(false)
  }

  const offerAmountMicro = Math.floor((offerAmount || 0) * Math.pow(10, market.offerAssetDecimals))
  const requestAmountMicro = Math.floor((requestAmount || 0) * Math.pow(10, market.requestAssetDecimals))
  const rate = offerAmount && requestAmount ? (requestAmount / offerAmount).toFixed(6) : '-'
  const fee = offerAmountMicro > 0 ? Math.floor(offerAmountMicro * market.feeBps / 10000) : 0
  const takerReceives = offerAmountMicro - fee
  const platformFee = offerAmountMicro > 0 ? Math.floor(offerAmountMicro * platformFeePercent / 100) : 0
  const CUSTOM_EXPIRY_VALUE = -1
  const expiryTimestamp = expirySeconds === CUSTOM_EXPIRY_VALUE && customExpiry
    ? Math.floor(customExpiry.getTime() / 1000)
    : expirySeconds > 0
      ? Math.floor(Date.now() / 1000) + expirySeconds
      : 0

  const canProceedStep0 = offerAmount && offerAmount > 0
  const canProceedStep1 = requestAmount && requestAmount > 0
  const canProceedStep2 = !isPrivate || (counterparty.length >= 58)
  const canSubmit = canProceedStep0 && canProceedStep1 && canProceedStep2 && activeAddress && signer

  const handleSubmit = async () => {
    if (!canSubmit || !signer || !activeAddress) return
    if (expirySeconds === CUSTOM_EXPIRY_VALUE && customExpiry) {
      const minExpiry = new Date(Date.now() + 6 * 60 * 1000) // 5 min contract minimum + 1 min buffer
      if (customExpiry < minExpiry) {
        toast.error('Custom expiry must be at least 6 minutes from now.')
        return
      }
    }
    setIsSubmitting(true)

    try {
      await ensureAuth()

      const algodConfig = {
        server: (activeChain.connection as any).algodServer,
        port: String((activeChain.connection as any).algodPort),
        token: (activeChain.connection as any).algodToken,
      }

      const isOfferNative = market.offerAssetId === 0

      // Compute platform fee
      const feeConfig = await fetchFeeConfig()
      const feeCalc = calculateFeeSimple('p2pCreate', offerAmountMicro, feeConfig, activeChain.feeRecipient)
      let result: { offerId: number; txId: string; feeTxId?: string }

      if (isOfferNative) {
        result = await createOfferAlgo(
          market.appId, offerAmountMicro, requestAmountMicro,
          isPrivate ? counterparty : '', expiryTimestamp,
          activeAddress, signer, algodConfig,
          feeCalc.feeAmount, 0, feeCalc.feeRecipient,
        )
      } else {
        result = await createOfferAsa(
          market.appId, market.offerAssetId, offerAmountMicro, requestAmountMicro,
          isPrivate ? counterparty : '', expiryTimestamp,
          activeAddress, signer, algodConfig,
          feeCalc.feeAmount, market.offerAssetId, feeCalc.feeRecipient,
        )
      }

      // Record in backend
      await recordP2POffer({
        marketAppId: market.appId,
        offerId: result.offerId,
        escrowTxId: result.txId,
        offerAmount: String(offerAmountMicro),
        requestAmount: String(requestAmountMicro),
        offerType: isPrivate ? 'private' : 'public',
        counterparty: isPrivate ? counterparty : '',
        expiresAt: expiryTimestamp > 0 ? new Date(expiryTimestamp * 1000).toISOString() : null,
        ...(result.feeTxId ? {
          feeTxId: result.feeTxId,
          feeAssetId: isOfferNative ? 0 : market.offerAssetId,
        } : {}),
      })

      toast.success(`Offer #${result.offerId} created successfully!`)
      handleClose()
      onSuccess()
    } catch (err: any) {
      console.error('Create offer failed:', err)
      toast.error(err?.message || 'Failed to create offer')
    } finally {
      setIsSubmitting(false)
    }
  }

  const steps = [
    {
      title: "You're Offering",
      content: (
        <div className="space-y-4">
          <div className="text-center text-[var(--text-secondary)] mb-2">
            How much {market.offerAssetSymbol} do you want to sell?
          </div>
          <InputNumber
            className="w-full"
            size="large"
            placeholder={`Amount in ${market.offerAssetSymbol}`}
            value={offerAmount}
            onChange={(v) => setOfferAmount(v)}
            min={0.000001}
            step={1}
            controls={false}
          />
          <div className="text-xs text-[var(--text-secondary)] text-center">
            MBR deposit: {(P2P_BOX_MBR / 1_000_000).toFixed(4)} {market.requestAssetSymbol} (refunded on cancel/fill)
          </div>
        </div>
      ),
    },
    {
      title: "You Want",
      content: (
        <div className="space-y-4">
          <div className="text-center text-[var(--text-secondary)] mb-2">
            How much {market.requestAssetSymbol} do you want in return?
          </div>
          <InputNumber
            className="w-full"
            size="large"
            placeholder={`Amount in ${market.requestAssetSymbol}`}
            value={requestAmount}
            onChange={(v) => setRequestAmount(v)}
            min={0.000001}
            step={0.1}
            controls={false}
          />
          {offerAmount && requestAmount && (
            <div className="text-center text-sm text-[var(--text-secondary)]">
              Rate: {rate} {market.requestAssetSymbol} per {market.offerAssetSymbol}
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Options",
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-primary)]">Private offer</span>
            <Switch checked={isPrivate} onChange={setIsPrivate} />
          </div>
          {isPrivate && (
            <Input
              placeholder="Counterparty wallet address"
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              className="font-mono text-sm"
            />
          )}
          <div>
            <label className="block text-[var(--text-primary)] mb-2">Expiry</label>
            <Select
              className="w-full"
              value={expirySeconds}
              onChange={(v) => { setExpirySeconds(v); if (v !== CUSTOM_EXPIRY_VALUE) setCustomExpiry(null) }}
              options={[...EXPIRY_OPTIONS, { label: 'Custom', value: CUSTOM_EXPIRY_VALUE }]}
            />
            {expirySeconds === CUSTOM_EXPIRY_VALUE && (
              <DatePicker
                showTime
                className="w-full mt-2"
                value={customExpiry ? dayjs(customExpiry) : null}
                onChange={(date) => setCustomExpiry(date?.toDate() || null)}
                disabledDate={(current) => current && current < dayjs().startOf('minute')}
                placeholder="Select date and time"
              />
            )}
          </div>
        </div>
      ),
    },
    {
      title: "Review",
      content: (
        <div className="space-y-3">
          <div className="p-4 rounded-lg bg-[var(--bg-secondary)] space-y-2">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">You send</span>
              <span className="font-bold text-[var(--text-primary)]">
                {offerAmount} {market.offerAssetSymbol}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">You receive</span>
              <span className="font-bold text-[#08A700]">
                {requestAmount} {market.requestAssetSymbol}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Rate</span>
              <span className="text-[var(--text-primary)]">
                {rate} {market.requestAssetSymbol}/{market.offerAssetSymbol}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Taker fee ({market.feeBps / 100}%)</span>
              <span className="text-[var(--text-primary)]">
                {(fee / Math.pow(10, market.offerAssetDecimals)).toFixed(market.offerAssetDecimals)} {market.offerAssetSymbol}
              </span>
            </div>
            {platformFee > 0 && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Platform fee ({platformFeePercent}%)</span>
                <span className="text-[var(--text-primary)]">
                  {(platformFee / Math.pow(10, market.offerAssetDecimals)).toFixed(market.offerAssetDecimals)} {market.offerAssetSymbol}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Type</span>
              <span className="text-[var(--text-primary)]">{isPrivate ? 'Private' : 'Public'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Expiry</span>
              <span className="text-[var(--text-primary)]">
                {expirySeconds === CUSTOM_EXPIRY_VALUE && customExpiry
                  ? customExpiry.toLocaleString()
                  : EXPIRY_OPTIONS.find(o => o.value === expirySeconds)?.label || 'No expiry'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">MBR deposit</span>
              <span className="text-[var(--text-primary)]">
                {(P2P_BOX_MBR / 1_000_000).toFixed(4)} {market.requestAssetSymbol}
              </span>
            </div>
          </div>
        </div>
      ),
    },
  ]

  const isLastStep = step === steps.length - 1
  const canNext = step === 0 ? canProceedStep0 : step === 1 ? canProceedStep1 : step === 2 ? canProceedStep2 : false

  return (
    <Modal
      open={isOpen}
      onCancel={handleClose}
      title={<span className="font-apex text-lg">Create P2P Offer</span>}
      footer={null}
      width={500}
      destroyOnClose
    >
      <Steps current={step} size="small" className="mb-6"
        items={steps.map(s => ({ title: s.title }))}
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
                Creating...
              </>
            ) : (
              'Create Offer'
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
    </Modal>
  )
}

export default CreateP2POfferWizard
