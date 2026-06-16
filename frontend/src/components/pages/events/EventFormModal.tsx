import React, { useEffect, useRef, useState } from 'react'
import { Modal, DatePicker, Select, Switch } from 'antd'
import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'
import dayjs from 'dayjs'
import { useAuth } from '../../../hooks/useAuth'
import {
  createEvent,
  updateEvent,
  uploadEventBanner,
  type FryEvent,
  type AirdropTier,
  type CreateEventPayload,
} from '../../../services/eventService'
import CreateVestingWizard from '../../../Modals/website/CreateVestingWizard'

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_BANNER_MB = 5
const MAX_BANNER_BYTES = MAX_BANNER_MB * 1024 * 1024

interface EventFormModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  event?: FryEvent | null
}

const EventFormModal: React.FC<EventFormModalProps> = ({ open, onClose, onSuccess, event }) => {
  const { ensureAuth } = useAuth()
  const isEditing = !!event

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState<dayjs.Dayjs | null>(null)
  const [endDate, setEndDate] = useState<dayjs.Dayjs | null>(null)
  const [airdropPoolFry, setAirdropPoolFry] = useState<number>(0)
  const [distribution, setDistribution] = useState<'proportional' | 'tiered'>('proportional')
  const [tiers, setTiers] = useState<AirdropTier[]>([])
  const [minPoints, setMinPoints] = useState<number>(0)
  const [bannerImage, setBannerImage] = useState('')
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [bannerPreview, setBannerPreview] = useState('')
  const bannerInputRef = useRef<HTMLInputElement>(null)
  const [autoEnabled, setAutoEnabled] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [recurrence, setRecurrence] = useState<'daily' | 'weekly' | 'biweekly' | 'monthly'>('weekly')
  const [submitting, setSubmitting] = useState(false)

  // On-chain vesting
  const [vestingEnabled, setVestingEnabled] = useState(false)
  const [vestingAsaId, setVestingAsaId] = useState<number>(0)
  const [vestingDurationDays, setVestingDurationDays] = useState<number>(30)
  const [vestingCliffDays, setVestingCliffDays] = useState<number>(0)
  const [vestingTotalPool, setVestingTotalPool] = useState<number>(0)
  const [showVestingWizard, setShowVestingWizard] = useState(false)
  const [savedEventId, setSavedEventId] = useState<string | null>(null)

  useEffect(() => {
    if (open && event) {
      setName(event.name)
      setDescription(event.description || '')
      setStartDate(event.startDate ? dayjs(event.startDate) : null)
      setEndDate(event.endDate ? dayjs(event.endDate) : null)
      setAirdropPoolFry(event.airdropPoolFry)
      setDistribution(event.airdropDistribution)
      setTiers(event.airdropTiers || [])
      setMinPoints(event.minPointsToQualify)
      setBannerImage(event.bannerImage || '')
      setBannerFile(null)
      setBannerPreview('')
      setAutoEnabled(event.autoSchedule?.enabled || false)
      setTemplateName(event.autoSchedule?.templateName || '')
      setRecurrence(event.autoSchedule?.recurrence || 'weekly')
    } else if (open) {
      setName('')
      setDescription('')
      setStartDate(null)
      setEndDate(null)
      setAirdropPoolFry(0)
      setDistribution('proportional')
      setTiers([])
      setMinPoints(0)
      setBannerImage('')
      setBannerFile(null)
      setBannerPreview('')
      setAutoEnabled(false)
      setTemplateName('')
      setRecurrence('weekly')
      setVestingEnabled(false)
      setVestingAsaId(0)
      setVestingDurationDays(30)
      setVestingCliffDays(0)
      setVestingTotalPool(0)
      setShowVestingWizard(false)
      setSavedEventId(null)
    }
  }, [open, event])

  const addTier = () => {
    const lastEnd = tiers.length > 0 ? tiers[tiers.length - 1].rankEnd : 0
    setTiers([...tiers, { rank: lastEnd + 1, rankEnd: lastEnd + 10, rewardFry: 0 }])
  }

  const updateTier = (index: number, field: keyof AirdropTier, value: number) => {
    const updated = [...tiers]
    updated[index] = { ...updated[index], [field]: value }
    setTiers(updated)
  }

  const removeTier = (index: number) => {
    setTiers(tiers.filter((_, i) => i !== index))
  }

  const handleBannerSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Invalid image type. Use JPEG, PNG, WebP, or GIF.')
      return
    }
    if (file.size > MAX_BANNER_BYTES) {
      toast.error(`Image too large. Max ${MAX_BANNER_MB}MB.`)
      return
    }
    setBannerFile(file)
    setBannerPreview(URL.createObjectURL(file))
  }

  const handleSubmit = async (submitStatus: 'draft' | 'scheduled') => {
    if (!name.trim()) { toast.error('Event name is required'); return }
    if (submitStatus === 'scheduled') {
      if (!startDate || !endDate) { toast.error('Start and end dates are required'); return }
      if (endDate.isBefore(startDate)) { toast.error('End date must be after start date'); return }
    }

    setSubmitting(true)

    // Step 1: Ensure authenticated
    try {
      await ensureAuth()
    } catch (err: any) {
      console.error('[EventForm] Auth failed:', err)
      // ensureAuth already shows its own toast for cancelled/failed — just bail
      setSubmitting(false)
      return
    }

    // Step 2: Create or update event
    let savedEvent: FryEvent
    try {
      const payload: CreateEventPayload = {
        name: name.trim(),
        description: description.trim() || undefined,
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
        airdropPoolFry,
        airdropDistribution: distribution,
        airdropTiers: distribution === 'tiered' ? tiers : undefined,
        minPointsToQualify: minPoints,
        bannerImage: bannerImage.trim() || undefined,
        autoSchedule: autoEnabled
          ? { enabled: true, templateName: templateName.trim() || undefined, recurrence }
          : undefined,
        status: submitStatus,
        ...(vestingEnabled ? {
          vesting: {
            enabled: true,
            vestingType: 'on-chain' as const,
            rewardAsaId: vestingAsaId,
            durationDays: vestingDurationDays,
            cliffDays: vestingCliffDays,
            totalPool: vestingTotalPool,
            model: 'linear' as const,
            startDate: startDate?.toISOString(),
          },
        } : {}),
      }

      if (isEditing) {
        savedEvent = await updateEvent(event!._id, payload)
      } else {
        savedEvent = await createEvent(payload)
      }
    } catch (err: any) {
      console.error('[EventForm] Save failed:', err.response?.status, err.response?.data)
      toast.error(err.response?.data?.message || `Failed to ${isEditing ? 'update' : 'create'} event`)
      setSubmitting(false)
      return
    }

    // Step 3: Upload banner (non-fatal — event already saved)
    if (bannerFile) {
      try {
        await uploadEventBanner(savedEvent._id, bannerFile)
      } catch (err: any) {
        console.error('[EventForm] Banner upload failed:', err.response?.status, err.response?.data)
        toast.error('Event saved but banner upload failed. You can re-upload later.')
      }
    }

    if (vestingEnabled) {
      setSavedEventId(savedEvent._id)
      setShowVestingWizard(true)
      setSubmitting(false)
      toast.info('Event saved. Complete the on-chain vesting setup.')
    } else {
      toast.success(submitStatus === 'draft' ? 'Draft saved' : `Event ${isEditing ? 'updated' : 'created'}`)
      onSuccess()
      onClose()
      setSubmitting(false)
    }
  }

  return (
    <>
    <Modal
      open={open}
      onCancel={() => { if (!submitting) onClose() }}
      className="del-modal"
      centered
      width={600}
      footer={null}
      maskClosable={!submitting}
    >
      <div className="modal-content flex flex-col pt-[24px] pb-[24px] px-[24px]">
        <h5 className="text-[var(--text-primary)] font-apex text-center">
          {isEditing ? 'Edit Event' : 'Create Event'}
        </h5>
        <div className="red-line w-full h-[1px] mt-[16px] mb-[16px]" />

        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar px-[4px] space-y-4">
          {/* Name */}
          <div className="input-box">
            <label>Name *</label>
            <div className="input-wrapper">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Event name" />
            </div>
          </div>

          {/* Description */}
          <div className="input-box">
            <label>Description</label>
            <div className="input-wrapper" style={{ minHeight: 60 }}>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Event description"
                className="w-full bg-transparent border-none outline-none text-[var(--text-clr)] resize-none"
                rows={3}
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="input-box">
              <label>Start Date</label>
              <DatePicker
                showTime
                value={startDate}
                onChange={setStartDate}
                className="w-full antd-dark-picker"
                format="MMM D, YYYY HH:mm"
              />
            </div>
            <div className="input-box">
              <label>End Date</label>
              <DatePicker
                showTime
                value={endDate}
                onChange={setEndDate}
                className="w-full antd-dark-picker"
                format="MMM D, YYYY HH:mm"
              />
            </div>
          </div>

          {/* Airdrop Pool */}
          <div className="input-box">
            <label>Airdrop Pool (FRY)</label>
            <div className="input-wrapper">
              <input
                type="number"
                value={airdropPoolFry || ''}
                onChange={e => setAirdropPoolFry(Number(e.target.value) || 0)}
                placeholder="0"
                min={0}
              />
            </div>
          </div>

          {/* Distribution Type */}
          <div className="input-box">
            <label>Distribution Type</label>
            <Select
              value={distribution}
              onChange={setDistribution}
              className="w-full antd-dark-select"
              options={[
                { value: 'proportional', label: 'Proportional' },
                { value: 'tiered', label: 'Tiered' },
              ]}
            />
          </div>

          {/* Tiers (conditional) */}
          {distribution === 'tiered' && (
            <div className="space-y-2">
              <label className="text-text_clr text-sm">Airdrop Tiers</label>
              {tiers.map((tier, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <div className="input-box flex-1">
                    <div className="input-wrapper">
                      <input
                        type="number"
                        value={tier.rank}
                        onChange={e => updateTier(i, 'rank', Number(e.target.value))}
                        placeholder="Rank start"
                        min={1}
                      />
                    </div>
                  </div>
                  <span className="text-text_clr">–</span>
                  <div className="input-box flex-1">
                    <div className="input-wrapper">
                      <input
                        type="number"
                        value={tier.rankEnd}
                        onChange={e => updateTier(i, 'rankEnd', Number(e.target.value))}
                        placeholder="Rank end"
                        min={1}
                      />
                    </div>
                  </div>
                  <div className="input-box flex-1">
                    <div className="input-wrapper">
                      <input
                        type="number"
                        value={tier.rewardFry}
                        onChange={e => updateTier(i, 'rewardFry', Number(e.target.value))}
                        placeholder="FRY"
                        min={0}
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => removeTier(i)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Icon icon="mdi:close" width={18} />
                  </button>
                </div>
              ))}
              <button
                onClick={addTier}
                className="text-sm text-[#DE0308] hover:underline flex items-center gap-1"
              >
                <Icon icon="mdi:plus" width={16} /> Add Tier
              </button>
            </div>
          )}

          {/* Min Points */}
          <div className="input-box">
            <label>Min Points to Qualify</label>
            <div className="input-wrapper">
              <input
                type="number"
                value={minPoints || ''}
                onChange={e => setMinPoints(Number(e.target.value) || 0)}
                placeholder="0"
                min={0}
              />
            </div>
          </div>

          {/* Banner Image */}
          <div className="input-box">
            <label>Banner Image</label>
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleBannerSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => bannerInputRef.current?.click()}
              className="w-full rounded-[12px] border-2 border-dashed border-[var(--border-color)] hover:border-[#DE0308] transition-colors overflow-hidden"
            >
              {(bannerPreview || bannerImage) ? (
                <div className="relative group">
                  <img
                    src={bannerPreview || bannerImage}
                    alt="Banner preview"
                    className="w-full h-[140px] object-cover"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white font-apex text-sm">Click to change</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-text_clr">
                  <Icon icon="mdi:image-plus" width={32} className="mb-2 opacity-50" />
                  <span className="text-sm">Click to upload banner image</span>
                  <span className="text-xs opacity-50 mt-1">JPEG, PNG, WebP, GIF — max {MAX_BANNER_MB}MB</span>
                </div>
              )}
            </button>
          </div>

          {/* Auto-Schedule */}
          <details className="bg-[var(--bg-secondary)] rounded-[12px] p-4">
            <summary className="text-[var(--text-heading)] font-apex text-sm uppercase cursor-pointer">
              Auto-Schedule
            </summary>
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-text_clr text-sm">Enabled</label>
                <Switch checked={autoEnabled} onChange={setAutoEnabled} />
              </div>
              {autoEnabled && (
                <>
                  <div className="input-box">
                    <label>Template Name</label>
                    <div className="input-wrapper">
                      <input
                        value={templateName}
                        onChange={e => setTemplateName(e.target.value)}
                        placeholder="Template name"
                      />
                    </div>
                  </div>
                  <div className="input-box">
                    <label>Recurrence</label>
                    <Select
                      value={recurrence}
                      onChange={setRecurrence}
                      className="w-full antd-dark-select"
                      options={[
                        { value: 'daily', label: 'Daily' },
                        { value: 'weekly', label: 'Weekly' },
                        { value: 'biweekly', label: 'Biweekly' },
                        { value: 'monthly', label: 'Monthly' },
                      ]}
                    />
                  </div>
                </>
              )}
            </div>
          </details>

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
                    <label>Reward ASA ID</label>
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
                      <label>Duration (days)</label>
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
                      <label>Cliff (days)</label>
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
                    <label>Total Pool (base units)</label>
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
          {(!isEditing || event?.status === 'draft') && (
            <button
              onClick={() => handleSubmit('draft')}
              disabled={submitting}
              className="px-5 py-2 rounded-[8px] bg-[var(--bg-secondary)] text-text_clr font-apex font-bold uppercase text-sm flex items-center gap-2 hover:text-[var(--text-heading)] transition-colors disabled:opacity-50"
            >
              {submitting && <Icon icon="eos-icons:loading" width={18} />}
              Save Draft
            </button>
          )}
          <button
            onClick={() => handleSubmit('scheduled')}
            disabled={submitting}
            className="px-5 py-2 rounded-[8px] bg-[#DE0308] text-white font-apex font-bold uppercase text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {submitting && <Icon icon="eos-icons:loading" width={18} />}
            {isEditing ? 'Update Event' : 'Create Event'}
          </button>
        </div>
      </div>
    </Modal>

    {showVestingWizard && savedEventId && startDate && (
      <CreateVestingWizard
        visible={showVestingWizard}
        eventId={savedEventId}
        rewardAsaId={vestingAsaId}
        vestingStart={Math.floor(startDate.valueOf() / 1000)}
        vestingEnd={Math.floor(startDate.valueOf() / 1000) + vestingDurationDays * 86400}
        eventEnd={Math.floor(endDate!.valueOf() / 1000)}
        cliffDays={vestingCliffDays}
        totalPool={BigInt(Math.round(vestingTotalPool))}
        eventType="official"
        onSuccess={(appId) => {
          setShowVestingWizard(false)
          toast.success('Vesting contract deployed \u2014 App ID: ' + appId)
          onSuccess()
          onClose()
        }}
        onCancel={() => {
          setShowVestingWizard(false)
          toast.warning('Event saved but vesting contract was NOT deployed. You can deploy it later.')
          onSuccess()
          onClose()
        }}
      />
    )}
    </>
  )
}

export default EventFormModal
