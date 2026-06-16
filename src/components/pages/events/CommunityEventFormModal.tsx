import React, { useState, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { useMultiChainWallet } from '../../../hooks/useMultiChainWallet'
import { Select, Switch } from 'antd'
import { toast } from 'react-toastify'
import algosdk from 'algosdk'
import { useAuth } from '../../../hooks/useAuth'
import { useChain } from '../../../context/ChainContext'
import { getChallengeConfig } from '../../../utils/challengeUtils'
import {
  createCommunityEvent,
  buildCommunityFunding,
  confirmCommunityFunding,
  uploadCommunityBanner,
  type FryEvent,
  type CreateCommunityEventPayload,
  type CreateChallengePayload,
  type FundingResult,
} from '../../../services/eventService'
import CreateVestingWizard from '../../../Modals/website/CreateVestingWizard'

const CHALLENGE_TYPES = [
  'staking_volume', 'farming_volume', 'trading_volume', 'staking_profit',
  'farming_profit', 'daily_claim_streak', 'hold_duration', 'referral',
  'nft_staking_volume', 'prediction_lp_volume',
]

interface CommunityEventFormModalProps {
  visible: boolean
  onClose: () => void
  onSuccess: () => void
}

type FormStep = 'form' | 'review' | 'signing' | 'submitting' | 'confirming' | 'success' | 'error'

interface ChallengeInput {
  type: string
  name: string
  description: string
  pointsMultiplier: number
}

const CommunityEventFormModal: React.FC<CommunityEventFormModalProps> = ({ visible, onClose, onSuccess }) => {
  const { activeAddress, signTransactions } = useMultiChainWallet()
  const { ensureAuth } = useAuth()
  const { activeChain, getAlgodClient } = useChain()
  const algod = getAlgodClient()

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [rewardAsaId, setRewardAsaId] = useState('')
  const [rewardAmount, setRewardAmount] = useState('')
  const [distribution, setDistribution] = useState<'proportional' | 'tiered'>('proportional')
  const [tiers, setTiers] = useState<{ rank: number; rankEnd: number; rewardAmount: number }[]>([])
  const [minPoints, setMinPoints] = useState(0)
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [bannerPreview, setBannerPreview] = useState('')
  const [challenges, setChallenges] = useState<ChallengeInput[]>([
    { type: 'staking_volume', name: '', description: '', pointsMultiplier: 1 },
  ])

  // ASA validation
  const [asaName, setAsaName] = useState('')
  const [asaDecimals, setAsaDecimals] = useState(6)
  const [asaValid, setAsaValid] = useState(false)
  const [asaChecking, setAsaChecking] = useState(false)
  const [asaError, setAsaError] = useState('')

  // Flow state
  const [step, setStep] = useState<FormStep>('form')
  const [submitting, setSubmitting] = useState(false)
  const [createdEvent, setCreatedEvent] = useState<FryEvent | null>(null)
  const [feeInfo, setFeeInfo] = useState<{ feeAmount: number; netAmount: number; grossAmount: number } | null>(null)
  const [error, setError] = useState('')
  const [txId, setTxId] = useState('')

  // On-chain vesting
  const [vestingEnabled, setVestingEnabled] = useState(false)
  const [vestingAsaId, setVestingAsaId] = useState<number>(0)
  const [vestingDurationDays, setVestingDurationDays] = useState<number>(30)
  const [vestingCliffDays, setVestingCliffDays] = useState<number>(0)
  const [vestingTotalPool, setVestingTotalPool] = useState<number>(0)
  const [showVestingWizard, setShowVestingWizard] = useState(false)

  // Validate ASA on Algorand
  const validateAsa = useCallback(async (id: string) => {
    const asaId = parseInt(id)
    if (!asaId || asaId <= 0) {
      setAsaValid(false)
      setAsaName('')
      setAsaError('')
      return
    }

    setAsaChecking(true)
    setAsaError('')
    try {
      const asaInfo = await algod.getAssetByID(asaId).do()
      setAsaName(asaInfo.params?.name || `ASA #${asaId}`)
      setAsaDecimals(asaInfo.params?.decimals ?? 0)
      setAsaValid(true)
    } catch {
      setAsaValid(false)
      setAsaName('')
      setAsaError(`ASA ${asaId} not found on Algorand`)
    } finally {
      setAsaChecking(false)
    }
  }, [algod])

  const handleAsaChange = (val: string) => {
    setRewardAsaId(val)
    setAsaValid(false)
    setAsaName('')
    setAsaError('')
    if (val.trim()) {
      validateAsa(val)
    }
  }

  // Fee calculation
  const parsedAmount = parseFloat(rewardAmount)
  const amountInBaseUnits = !isNaN(parsedAmount) && parsedAmount > 0
    ? Math.floor(parsedAmount * Math.pow(10, asaDecimals))
    : 0
  const feeCalc = Math.floor(amountInBaseUnits * 200 / 10000) // 2%
  const netCalc = amountInBaseUnits - feeCalc

  // Banner upload handling
  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!ALLOWED.includes(file.type)) {
      toast.error('Invalid image type. Use JPEG, PNG, WebP, or GIF.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image too large. Max 5MB.')
      return
    }
    setBannerFile(file)
    setBannerPreview(URL.createObjectURL(file))
  }

  // Challenge management
  const addChallengeRow = () => {
    setChallenges(prev => [...prev, { type: 'staking_volume', name: '', description: '', pointsMultiplier: 1 }])
  }

  const removeChallengeRow = (idx: number) => {
    setChallenges(prev => prev.filter((_, i) => i !== idx))
  }

  const updateChallengeRow = (idx: number, field: keyof ChallengeInput, value: any) => {
    setChallenges(prev => prev.map((ch, i) => {
      if (i !== idx) return ch
      const updated = { ...ch, [field]: value }
      // Auto-fill name from type
      if (field === 'type') {
        const config = getChallengeConfig(value)
        updated.name = config?.name || value
        updated.description = config?.description || ''
      }
      return updated
    }))
  }

  // Tier management
  const addTier = () => {
    setTiers(prev => [...prev, { rank: prev.length + 1, rankEnd: prev.length + 1, rewardAmount: 0 }])
  }

  const removeTier = (idx: number) => {
    setTiers(prev => prev.filter((_, i) => i !== idx))
  }

  const updateTier = (idx: number, field: string, value: number) => {
    setTiers(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t))
  }

  // Validate form
  const canSubmit = () => {
    if (!name.trim()) return false
    if (!startDate || !endDate) return false
    if (new Date(startDate) >= new Date(endDate)) return false
    if (!asaValid) return false
    if (amountInBaseUnits <= 0) return false
    if (netCalc <= 0) return false
    if (challenges.length === 0) return false
    if (challenges.some(ch => !ch.type || !ch.name.trim())) return false
    return true
  }

  // Submit form
  const handleSubmit = async () => {
    if (!canSubmit()) return

    setSubmitting(true)
    try {
      await ensureAuth()

      const payload: CreateCommunityEventPayload = {
        name: name.trim(),
        description: description.trim(),
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        rewardAsaId: parseInt(rewardAsaId),
        rewardAmount: amountInBaseUnits,
        airdropDistribution: distribution,
        airdropTiers: distribution === 'tiered' ? tiers : undefined,
        minPointsToQualify: minPoints,
        challenges: challenges.map(ch => ({
          type: ch.type,
          name: ch.name.trim(),
          description: ch.description.trim() || undefined,
          pointsMultiplier: ch.pointsMultiplier,
        })),
      }

      const result = await createCommunityEvent(payload)
      setCreatedEvent(result.event)
      setFeeInfo({
        feeAmount: result.feeInfo?.feeAmount || feeCalc,
        netAmount: result.feeInfo?.netRewardPool || netCalc,
        grossAmount: amountInBaseUnits,
      })

      // Upload banner (best effort)
      if (bannerFile && result.event?._id) {
        try {
          await uploadCommunityBanner(result.event._id, bannerFile)
        } catch {
          console.warn('Banner upload failed')
        }
      }

      toast.success('Event created!')
      if (vestingEnabled) {
        setShowVestingWizard(true)
      } else {
        setStep('review')
      }
    } catch (err: any) {
      if (!err.message?.includes('cancelled') && !err.message?.includes('CANCELLED')) {
        toast.error(err.response?.data?.message || err.message || 'Failed to create event')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Fund event
  const handleFund = useCallback(async () => {
    if (!activeAddress || !createdEvent || !signTransactions) return

    setError('')
    try {
      setStep('signing')
      await ensureAuth()

      const result: FundingResult = await buildCommunityFunding(createdEvent._id)

      const txnBytes = result.unsignedTxns.map((b64: string) => {
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
        return algosdk.decodeUnsignedTransaction(bytes)
      })

      const encodedUnsigned = txnBytes.map(txn => algosdk.encodeUnsignedTransaction(txn))
      const signed = await signTransactions(encodedUnsigned)

      setStep('submitting')
      const { txId: confirmedTxId } = await algod.sendRawTransaction(signed).do()
      await algosdk.waitForConfirmation(algod, confirmedTxId, 4)
      setTxId(confirmedTxId)

      // Fee txn (best-effort)
      let feeTxId = ''
      if (result.feeTxn) {
        try {
          const feeBytes = Uint8Array.from(atob(result.feeTxn), c => c.charCodeAt(0))
          const feeTxnDecoded = algosdk.decodeUnsignedTransaction(feeBytes)
          const feeEncoded = [algosdk.encodeUnsignedTransaction(feeTxnDecoded)]
          const feeSigned = await signTransactions(feeEncoded)
          const { txId: fTxId } = await algod.sendRawTransaction(feeSigned).do()
          feeTxId = fTxId
        } catch (feeErr) {
          console.warn('Fee transaction failed (funding succeeded):', feeErr)
        }
      }

      setStep('confirming')
      await confirmCommunityFunding(createdEvent._id, confirmedTxId, feeTxId)

      setStep('success')
    } catch (e: any) {
      console.error('Funding error:', e)
      const msg = e?.message || 'Funding failed'
      if (msg.includes('cancelled') || msg.includes('rejected') || msg.includes('User rejected')) {
        setError('Transaction cancelled by user')
      } else {
        setError(msg)
      }
      setStep('error')
    }
  }, [activeAddress, createdEvent, signTransactions, ensureAuth, algod])

  // Reset & close
  const resetForm = () => {
    setStep('form')
    setName('')
    setDescription('')
    setStartDate('')
    setEndDate('')
    setRewardAsaId('')
    setRewardAmount('')
    setDistribution('proportional')
    setTiers([])
    setMinPoints(0)
    setBannerFile(null)
    setBannerPreview('')
    setChallenges([{ type: 'staking_volume', name: '', description: '', pointsMultiplier: 1 }])
    setAsaValid(false)
    setAsaName('')
    setAsaError('')
    setCreatedEvent(null)
    setFeeInfo(null)
    setError('')
    setTxId('')
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleSuccessClose = () => {
    resetForm()
    onClose()
    onSuccess()
  }

  const handleFundLater = () => {
    toast.info('Event created! You can fund it from "My Events".')
    handleClose()
    onSuccess()
  }

  if (!visible) return null

  const divisor = Math.pow(10, asaDecimals)
  const canClose = step === 'form' || step === 'review' || step === 'success' || step === 'error'

  return (
    <>
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={canClose ? handleClose : undefined} />

      <div className="relative bg-[var(--bg-card)] rounded-[16px] w-full max-w-[600px] mx-4 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:calendar-plus" className="text-[#DE0308]" width={22} />
            <h3 className="text-[var(--text-primary)] font-bold text-lg">
              {step === 'form' ? 'Create Community Event' : step === 'review' ? 'Fund Your Event' : 'Event Funding'}
            </h3>
          </div>
          {canClose && (
            <button onClick={handleClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              <Icon icon="mdi:close" width={22} />
            </button>
          )}
        </div>

        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
          {/* ─── Form Step ─── */}
          {step === 'form' && (
            <div className="flex flex-col gap-4">
              {/* Name */}
              <div>
                <label className="text-sm text-[var(--text-secondary)] mb-1 block">Event Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={200}
                  placeholder="My Awesome Event"
                  className="w-full bg-[var(--input-bg)] rounded-[10px] px-3 py-2.5 text-[var(--text-primary)] focus:outline-none"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-sm text-[var(--text-secondary)] mb-1 block">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder="What is this event about?"
                  className="w-full bg-[var(--input-bg)] rounded-[10px] px-3 py-2.5 text-[var(--text-primary)] focus:outline-none resize-none"
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-[var(--text-secondary)] mb-1 block">Start Date *</label>
                  <input
                    type="datetime-local"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full bg-[var(--input-bg)] rounded-[10px] px-3 py-2.5 text-[var(--text-primary)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm text-[var(--text-secondary)] mb-1 block">End Date *</label>
                  <input
                    type="datetime-local"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full bg-[var(--input-bg)] rounded-[10px] px-3 py-2.5 text-[var(--text-primary)] focus:outline-none"
                  />
                </div>
              </div>

              {/* Reward ASA */}
              <div>
                <label className="text-sm text-[var(--text-secondary)] mb-1 block">Reward Token (ASA ID) *</label>
                <input
                  type="number"
                  value={rewardAsaId}
                  onChange={e => handleAsaChange(e.target.value)}
                  placeholder="Enter ASA ID"
                  min="1"
                  className="w-full bg-[var(--input-bg)] rounded-[10px] px-3 py-2.5 text-[var(--text-primary)] focus:outline-none"
                />
                {asaChecking && (
                  <p className="text-blue-400 text-xs mt-1">Verifying ASA...</p>
                )}
                {asaValid && (
                  <p className="text-green-500 text-xs mt-1">
                    Token: {asaName} ({asaDecimals} decimals)
                  </p>
                )}
                {asaError && (
                  <p className="text-red-500 text-xs mt-1">{asaError}</p>
                )}
              </div>

              {/* Reward Amount */}
              <div>
                <label className="text-sm text-[var(--text-secondary)] mb-1 block">
                  Reward Amount * {asaName && `(${asaName})`}
                </label>
                <input
                  type="number"
                  value={rewardAmount}
                  onChange={e => setRewardAmount(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="any"
                  className="w-full bg-[var(--input-bg)] rounded-[10px] px-3 py-2.5 text-[var(--text-primary)] focus:outline-none"
                />
                {amountInBaseUnits > 0 && (
                  <div className="bg-[var(--bg-secondary)] rounded-lg p-2 mt-2 text-xs">
                    <div className="flex justify-between text-[var(--text-secondary)]">
                      <span>Platform fee (2%)</span>
                      <span className="text-red-400">-{(feeCalc / divisor).toLocaleString()} {asaName}</span>
                    </div>
                    <div className="flex justify-between text-[var(--text-secondary)] mt-1">
                      <span>Net reward pool</span>
                      <span className="text-green-500">{(netCalc / divisor).toLocaleString()} {asaName}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Distribution Type */}
              <div>
                <label className="text-sm text-[var(--text-secondary)] mb-1 block">Distribution</label>
                <select
                  value={distribution}
                  onChange={e => setDistribution(e.target.value as 'proportional' | 'tiered')}
                  className="w-full bg-[var(--input-bg)] rounded-[10px] px-3 py-2.5 text-[var(--text-primary)] focus:outline-none"
                >
                  <option value="proportional">Proportional (by points)</option>
                  <option value="tiered">Tiered (by rank)</option>
                </select>
              </div>

              {/* Tiers */}
              {distribution === 'tiered' && (
                <div>
                  <label className="text-sm text-[var(--text-secondary)] mb-1 block">Reward Tiers</label>
                  {tiers.map((tier, idx) => (
                    <div key={idx} className="flex items-center gap-2 mb-2">
                      <input
                        type="number" min="1" placeholder="Rank"
                        value={tier.rank} onChange={e => updateTier(idx, 'rank', parseInt(e.target.value) || 0)}
                        className="w-20 bg-[var(--input-bg)] rounded-[8px] px-2 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none"
                      />
                      <span className="text-[var(--text-secondary)] text-xs">to</span>
                      <input
                        type="number" min="1" placeholder="End"
                        value={tier.rankEnd} onChange={e => updateTier(idx, 'rankEnd', parseInt(e.target.value) || 0)}
                        className="w-20 bg-[var(--input-bg)] rounded-[8px] px-2 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none"
                      />
                      <span className="text-[var(--text-secondary)] text-xs">=</span>
                      <input
                        type="number" min="0" placeholder="Amount"
                        value={tier.rewardAmount} onChange={e => updateTier(idx, 'rewardAmount', parseInt(e.target.value) || 0)}
                        className="flex-1 bg-[var(--input-bg)] rounded-[8px] px-2 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none"
                      />
                      <button onClick={() => removeTier(idx)} className="text-red-400 hover:text-red-300">
                        <Icon icon="mdi:close" width={16} />
                      </button>
                    </div>
                  ))}
                  <button onClick={addTier} className="text-blue-400 text-xs flex items-center gap-1 hover:text-blue-300">
                    <Icon icon="mdi:plus" width={14} /> Add Tier
                  </button>
                </div>
              )}

              {/* Min Points */}
              <div>
                <label className="text-sm text-[var(--text-secondary)] mb-1 block">Min Points to Qualify</label>
                <input
                  type="number"
                  value={minPoints}
                  onChange={e => setMinPoints(parseInt(e.target.value) || 0)}
                  min="0"
                  className="w-full bg-[var(--input-bg)] rounded-[10px] px-3 py-2.5 text-[var(--text-primary)] focus:outline-none"
                />
              </div>

              {/* Banner */}
              <div>
                <label className="text-sm text-[var(--text-secondary)] mb-1 block">Banner Image</label>
                {bannerPreview ? (
                  <div className="relative rounded-lg overflow-hidden cursor-pointer" onClick={() => document.getElementById('community-banner-input')?.click()}>
                    <img src={bannerPreview} alt="" className="w-full h-[120px] object-cover" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <span className="text-white text-xs">Click to change</span>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => document.getElementById('community-banner-input')?.click()}
                    className="w-full py-3 border-2 border-dashed border-[var(--border-color)] rounded-lg text-text_clr text-sm hover:border-[var(--text-secondary)] transition-colors"
                  >
                    Upload Banner (optional)
                  </button>
                )}
                <input id="community-banner-input" type="file" accept="image/*" onChange={handleBannerChange} className="hidden" />
              </div>

              {/* Challenges */}
              <div>
                <label className="text-sm text-[var(--text-secondary)] mb-1 block">Challenges * (at least 1)</label>
                {challenges.map((ch, idx) => (
                  <div key={idx} className="bg-[var(--bg-secondary)] rounded-lg p-3 mb-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-[var(--text-secondary)]">Challenge {idx + 1}</span>
                      {challenges.length > 1 && (
                        <button onClick={() => removeChallengeRow(idx)} className="text-red-400 hover:text-red-300">
                          <Icon icon="mdi:close" width={14} />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        value={ch.type}
                        onChange={val => updateChallengeRow(idx, 'type', val)}
                        className="w-full"
                        size="small"
                        getPopupContainer={() => document.body}
                        popupClassName="!z-[10000]"
                        options={CHALLENGE_TYPES.map(t => {
                          const config = getChallengeConfig(t)
                          return { value: t, label: config?.name || t }
                        })}
                      />
                      <input
                        type="text"
                        value={ch.name}
                        onChange={e => updateChallengeRow(idx, 'name', e.target.value)}
                        placeholder="Challenge name"
                        className="bg-[var(--input-bg)] rounded-[8px] px-2 py-1 text-sm text-[var(--text-primary)] focus:outline-none"
                      />
                    </div>
                    <div className="mt-2">
                      <input
                        type="number"
                        value={ch.pointsMultiplier}
                        onChange={e => updateChallengeRow(idx, 'pointsMultiplier', parseFloat(e.target.value) || 1)}
                        min="0.1"
                        step="0.1"
                        placeholder="Multiplier"
                        className="w-full bg-[var(--input-bg)] rounded-[8px] px-2 py-1 text-sm text-[var(--text-primary)] focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
                <button onClick={addChallengeRow} className="text-blue-400 text-xs flex items-center gap-1 hover:text-blue-300">
                  <Icon icon="mdi:plus" width={14} /> Add Challenge
                </button>
              </div>

              {/* On-Chain Vesting */}
              <details className="bg-[var(--bg-secondary)] rounded-[12px] p-4">
                <summary className="text-[var(--text-heading)] font-apex text-sm uppercase cursor-pointer">
                  On-Chain Vesting
                </summary>
                <div className="mt-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-text_clr text-sm">Enable On-Chain Vesting</label>
                    <Switch checked={vestingEnabled} onChange={setVestingEnabled} />
                  </div>
                  {vestingEnabled && (
                    <>
                      <div className="input-box">
                        <label className="text-text_clr text-xs">Reward ASA ID for Vesting</label>
                        <div className="input-wrapper">
                          <input
                            type="number"
                            value={vestingAsaId || ''}
                            onChange={e => setVestingAsaId(Number(e.target.value) || 0)}
                            placeholder="ASA ID"
                            min={0}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="input-box">
                          <label className="text-text_clr text-xs">Duration (days)</label>
                          <div className="input-wrapper">
                            <input
                              type="number"
                              value={vestingDurationDays || ''}
                              onChange={e => setVestingDurationDays(Number(e.target.value) || 0)}
                              placeholder="30"
                              min={1}
                            />
                          </div>
                        </div>
                        <div className="input-box">
                          <label className="text-text_clr text-xs">Cliff (days)</label>
                          <div className="input-wrapper">
                            <input
                              type="number"
                              value={vestingCliffDays || ''}
                              onChange={e => setVestingCliffDays(Number(e.target.value) || 0)}
                              placeholder="0"
                              min={0}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="input-box">
                        <label className="text-text_clr text-xs">Total Pool (base units)</label>
                        <div className="input-wrapper">
                          <input
                            type="number"
                            value={vestingTotalPool || ''}
                            onChange={e => setVestingTotalPool(Number(e.target.value) || 0)}
                            placeholder="0"
                            min={0}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </details>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!canSubmit() || submitting}
                className="w-full py-3 rounded-lg font-bold text-white transition-colors linearGradient disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting && <Icon icon="eos-icons:loading" width={18} />}
                {submitting ? 'Creating...' : 'Create Event'}
              </button>
            </div>
          )}

          {/* ─── Review Step ─── */}
          {step === 'review' && createdEvent && (
            <div className="flex flex-col gap-4">
              <div className="text-center">
                <Icon icon="mdi:check-circle" width={48} className="text-green-500 mx-auto" />
                <h4 className="text-[var(--text-primary)] font-bold text-lg mt-2">Event Created!</h4>
                <p className="text-[var(--text-secondary)] text-sm mt-1">Fund the escrow to schedule your event</p>
              </div>

              <div className="bg-[var(--bg-secondary)] rounded-lg p-4 flex flex-col gap-3">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Event</span>
                  <span className="text-[var(--text-primary)]">{createdEvent.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Reward Token</span>
                  <span className="text-[var(--text-primary)]">
                    {createdEvent.rewardAsaName || `ASA #${createdEvent.rewardAsaId}`}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Total Deposit</span>
                  <span className="text-[var(--text-primary)]">
                    {feeInfo ? (feeInfo.grossAmount / divisor).toLocaleString() : parsedAmount} {asaName}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Platform Fee (2%)</span>
                  <span className="text-red-400">
                    -{feeInfo ? (feeInfo.feeAmount / divisor).toLocaleString() : (feeCalc / divisor).toLocaleString()} {asaName}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-medium">
                  <span className="text-[var(--text-secondary)]">Reward Pool</span>
                  <span className="text-green-500">
                    {feeInfo ? (feeInfo.netAmount / divisor).toLocaleString() : (netCalc / divisor).toLocaleString()} {asaName}
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleFundLater}
                  className="flex-1 py-3 rounded-lg font-medium text-[var(--text-primary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  Fund Later
                </button>
                <button
                  onClick={handleFund}
                  className="flex-1 py-3 rounded-lg font-bold text-white linearGradient transition-colors"
                >
                  Fund Now
                </button>
              </div>
            </div>
          )}

          {/* ─── Progress Steps ─── */}
          {(step === 'signing' || step === 'submitting' || step === 'confirming') && (
            <div className="flex flex-col items-center py-8 gap-4">
              <Icon icon="eos-icons:loading" width={48} className="text-blue-500" />
              <div className="text-center">
                <p className="text-[var(--text-primary)] font-bold text-lg">
                  {step === 'signing' && 'Building & Signing...'}
                  {step === 'submitting' && 'Submitting Transaction...'}
                  {step === 'confirming' && 'Confirming Escrow...'}
                </p>
                <p className="text-[var(--text-secondary)] text-sm mt-1">
                  {step === 'signing' && 'Please confirm in your wallet'}
                  {step === 'submitting' && 'Waiting for on-chain confirmation'}
                  {step === 'confirming' && 'Almost done'}
                </p>
              </div>
            </div>
          )}

          {/* ─── Success ─── */}
          {step === 'success' && (
            <div className="flex flex-col items-center py-8 gap-4">
              <Icon icon="mdi:check-circle" width={64} className="text-green-500" />
              <div className="text-center">
                <h4 className="text-[var(--text-primary)] font-bold text-xl">Event Funded!</h4>
                <p className="text-[var(--text-secondary)] mt-2">
                  Your event is scheduled and will activate on the start date.
                </p>
                {txId && (
                  <a
                    href={`${activeChain.explorerBaseUrl}/tx/${txId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 text-sm mt-1 inline-flex items-center gap-1 hover:underline"
                  >
                    View transaction <Icon icon="mdi:open-in-new" width={14} />
                  </a>
                )}
              </div>
              <button
                onClick={handleSuccessClose}
                className="mt-2 px-8 py-3 rounded-lg font-bold text-white linearGradient transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {/* ─── Error ─── */}
          {step === 'error' && (
            <div className="flex flex-col items-center py-8 gap-4">
              <Icon icon="mdi:alert-circle" width={64} className="text-red-500" />
              <div className="text-center">
                <h4 className="text-[var(--text-primary)] font-bold text-xl">Funding Failed</h4>
                <p className="text-[var(--text-secondary)] text-sm mt-2 max-w-[350px]">{error}</p>
              </div>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => { setStep('review'); setError('') }}
                  className="px-6 py-2.5 rounded-lg font-medium text-white linearGradient transition-colors"
                >
                  Try Again
                </button>
                <button
                  onClick={handleClose}
                  className="px-6 py-2.5 rounded-lg font-medium text-[var(--text-primary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    {showVestingWizard && createdEvent && (
      <CreateVestingWizard
        visible={showVestingWizard}
        eventId={createdEvent._id}
        rewardAsaId={vestingAsaId}
        vestingStart={Math.floor(new Date(startDate).getTime() / 1000)}
        vestingEnd={Math.floor(new Date(startDate).getTime() / 1000) + vestingDurationDays * 86400}
        eventEnd={Math.floor(new Date(endDate).getTime() / 1000)}
        cliffDays={vestingCliffDays}
        totalPool={BigInt(Math.round(vestingTotalPool))}
        eventType="community"
        onSuccess={() => {
          setShowVestingWizard(false)
          toast.success('Vesting contract deployed!')
          setStep('review')
        }}
        onCancel={() => {
          setShowVestingWizard(false)
          toast.warning('Vesting contract was NOT deployed. You can deploy it later.')
          setStep('review')
        }}
      />
    )}
    </>
  )
}

export default CommunityEventFormModal
