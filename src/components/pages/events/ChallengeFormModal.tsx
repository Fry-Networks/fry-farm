import React, { useEffect, useState } from 'react'
import { Modal, Select, Switch } from 'antd'
import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'
import { useAuth } from '../../../hooks/useAuth'
import { getChallengeConfig } from '../../../utils/challengeUtils'
import {
  addChallenge,
  updateChallenge,
  type EventChallenge,
  type CreateChallengePayload,
} from '../../../services/eventService'

const CHALLENGE_TYPES = [
  'staking_volume',
  'farming_volume',
  'trading_volume',
  'staking_profit',
  'farming_profit',
  'daily_claim_streak',
  'hold_duration',
  'referral',
  'nft_staking_volume',
  'prediction_lp_volume',
]

interface ChallengeFormModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  eventId: string
  challenge?: EventChallenge | null
}

const ChallengeFormModal: React.FC<ChallengeFormModalProps> = ({
  open, onClose, onSuccess, eventId, challenge,
}) => {
  const { ensureAuth } = useAuth()
  const isEditing = !!challenge

  const [type, setType] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [multiplier, setMultiplier] = useState<number>(1)
  const [enabled, setEnabled] = useState(true)
  const [minAmount, setMinAmount] = useState<number | undefined>()
  const [poolIds, setPoolIds] = useState('')
  const [tokenIds, setTokenIds] = useState('')
  const [streakBonus, setStreakBonus] = useState<number>(10)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open && challenge) {
      setType(challenge.type)
      setName(challenge.name)
      setDescription(challenge.description || '')
      setMultiplier(challenge.pointsMultiplier)
      setEnabled(challenge.enabled)
      setMinAmount(challenge.config?.minAmount)
      setPoolIds(challenge.config?.specificPoolIds?.join(', ') || '')
      setTokenIds(challenge.config?.specificTokenIds?.join(', ') || '')
      setStreakBonus(challenge.config?.streakBonusPerDay ?? 10)
    } else if (open) {
      setType('')
      setName('')
      setDescription('')
      setMultiplier(1)
      setEnabled(true)
      setMinAmount(undefined)
      setPoolIds('')
      setTokenIds('')
      setStreakBonus(10)
    }
  }, [open, challenge])

  const handleTypeChange = (value: string) => {
    setType(value)
    if (!isEditing) {
      const config = getChallengeConfig(value)
      setName(config.name)
      setDescription(config.description)
    }
  }

  const showMinAmount = ['staking_volume', 'farming_volume', 'trading_volume', 'prediction_lp_volume'].includes(type)
  const showPoolIds = ['staking_volume', 'farming_volume', 'nft_staking_volume'].includes(type)
  const showTokenIds = type === 'trading_volume'
  const showStreakBonus = type === 'daily_claim_streak'

  const handleSubmit = async () => {
    if (!type) { toast.error('Challenge type is required'); return }
    if (!name.trim()) { toast.error('Challenge name is required'); return }

    setSubmitting(true)

    // Step 1: Ensure authenticated
    try {
      await ensureAuth()
    } catch (err: any) {
      console.error('[ChallengeForm] Auth failed:', err)
      setSubmitting(false)
      return
    }

    // Step 2: Build payload and submit
    try {
      const config: EventChallenge['config'] = {}
      if (showMinAmount && minAmount !== undefined) config.minAmount = minAmount
      if (showPoolIds && poolIds.trim()) {
        config.specificPoolIds = poolIds.split(',').map(s => s.trim()).filter(Boolean)
      }
      if (showTokenIds && tokenIds.trim()) {
        config.specificTokenIds = tokenIds.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n))
      }
      if (showStreakBonus) config.streakBonusPerDay = streakBonus

      const payload: CreateChallengePayload = {
        type,
        name: name.trim(),
        description: description.trim() || undefined,
        pointsMultiplier: multiplier,
        enabled,
        config: Object.keys(config).length > 0 ? config : undefined,
      }

      if (isEditing) {
        await updateChallenge(challenge!._id, payload)
        toast.success('Challenge updated')
      } else {
        await addChallenge(eventId, payload)
        toast.success('Challenge added')
      }
      onSuccess()
      onClose()
    } catch (err: any) {
      console.error('[ChallengeForm] Save failed:', err.response?.status, err.response?.data)
      toast.error(err.response?.data?.message || `Failed to ${isEditing ? 'update' : 'add'} challenge`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onCancel={() => { if (!submitting) onClose() }}
      className="del-modal"
      centered
      width={500}
      footer={null}
      maskClosable={!submitting}
    >
      <div className="modal-content flex flex-col pt-[24px] pb-[24px] px-[24px]">
        <h5 className="text-[var(--text-primary)] font-apex text-center">
          {isEditing ? 'Edit Challenge' : 'Add Challenge'}
        </h5>
        <div className="red-line w-full h-[1px] mt-[16px] mb-[16px]" />

        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar px-[4px] space-y-4">
          {/* Type */}
          <div className="input-box">
            <label>Type *</label>
            <Select
              value={type || undefined}
              onChange={handleTypeChange}
              disabled={isEditing}
              placeholder="Select challenge type"
              className="w-full antd-dark-select"
              options={CHALLENGE_TYPES.map(t => {
                const cfg = getChallengeConfig(t)
                return { value: t, label: cfg.name }
              })}
            />
          </div>

          {/* Name */}
          <div className="input-box">
            <label>Name *</label>
            <div className="input-wrapper">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Challenge name" />
            </div>
          </div>

          {/* Description */}
          <div className="input-box">
            <label>Description</label>
            <div className="input-wrapper">
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Challenge description" />
            </div>
          </div>

          {/* Multiplier + Enabled */}
          <div className="grid grid-cols-2 gap-3">
            <div className="input-box">
              <label>Points Multiplier</label>
              <div className="input-wrapper">
                <input
                  type="number"
                  value={multiplier}
                  onChange={e => setMultiplier(Number(e.target.value) || 1)}
                  min={0.1}
                  step={0.1}
                />
              </div>
            </div>
            <div className="input-box">
              <label>Enabled</label>
              <div className="flex items-center h-[40px]">
                <Switch checked={enabled} onChange={setEnabled} />
              </div>
            </div>
          </div>

          {/* Dynamic config fields */}
          {showMinAmount && (
            <div className="input-box">
              <label>Min Amount (USD)</label>
              <div className="input-wrapper">
                <input
                  type="number"
                  value={minAmount ?? ''}
                  onChange={e => setMinAmount(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="No minimum"
                  min={0}
                />
              </div>
            </div>
          )}

          {showPoolIds && (
            <div className="input-box">
              <label>Specific Pool IDs (comma-separated)</label>
              <div className="input-wrapper">
                <input
                  value={poolIds}
                  onChange={e => setPoolIds(e.target.value)}
                  placeholder="Leave empty for all pools"
                />
              </div>
            </div>
          )}

          {showTokenIds && (
            <div className="input-box">
              <label>Specific Token IDs (comma-separated)</label>
              <div className="input-wrapper">
                <input
                  value={tokenIds}
                  onChange={e => setTokenIds(e.target.value)}
                  placeholder="Leave empty for all tokens"
                />
              </div>
            </div>
          )}

          {showStreakBonus && (
            <div className="input-box">
              <label>Streak Bonus Per Day</label>
              <div className="input-wrapper">
                <input
                  type="number"
                  value={streakBonus}
                  onChange={e => setStreakBonus(Number(e.target.value) || 10)}
                  min={1}
                />
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-5 py-2 rounded-[8px] bg-[var(--bg-secondary)] text-text_clr font-apex font-bold uppercase text-sm hover:text-[var(--text-heading)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2 rounded-[8px] bg-[#DE0308] text-white font-apex font-bold uppercase text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {submitting && <Icon icon="eos-icons:loading" width={18} />}
            {isEditing ? 'Update' : 'Add'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default ChallengeFormModal
