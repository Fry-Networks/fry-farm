import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useWallet } from '@txnlab/use-wallet'
import { toast } from 'react-toastify'
import { Spin } from 'antd'
import { Icon } from '@iconify/react'
import { getDevicePool, getCreatorAnalytics, createAnnouncement, getAnnouncements } from '../../../services/deviceStakingApi'
import { pauseDevicePool, resumeDevicePool } from '../../../device_staking_func'
import type { DevicePool, CreatorAnalytics, DeviceAnnouncement, CreateAnnouncementPayload } from '../../../types/deviceStaking'
import Button from '../../shared/button'

const REWARD_MODELS: Record<string, string> = {
  fixed_rate: 'Fixed Rate',
  proportional: 'Proportional',
  apr: 'APR',
}

const DeviceDashboardContent = () => {
  const [searchParams] = useSearchParams()
  const appId = searchParams.get('appId') || ''
  const { activeAddress, signer } = useWallet()

  const [pool, setPool] = useState<DevicePool | null>(null)
  const [analytics, setAnalytics] = useState<CreatorAnalytics | null>(null)
  const [announcements, setAnnouncements] = useState<DeviceAnnouncement[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  // Announcement form
  const [annTitle, setAnnTitle] = useState('')
  const [annBody, setAnnBody] = useState('')
  const [annPriority, setAnnPriority] = useState<'normal' | 'urgent'>('normal')
  const [annSubmitting, setAnnSubmitting] = useState(false)

  useEffect(() => {
    if (!appId) return
    loadData()
  }, [appId])

  const loadData = async () => {
    setLoading(true)
    try {
      const poolData = await getDevicePool(appId)
      setPool(poolData)

      try {
        const analyticsData = await getCreatorAnalytics(appId)
        setAnalytics(analyticsData)
      } catch { /* may not have analytics yet */ }

      if (poolData.announcementsEnabled) {
        try {
          const ann = await getAnnouncements(appId)
          setAnnouncements(ann)
        } catch { /* skip */ }
      }
    } catch (err) {
      console.error('Error loading dashboard:', err)
    } finally {
      setLoading(false)
    }
  }

  const isCreator = pool?.creator?.toLowerCase() === activeAddress?.toLowerCase()

  const handlePauseResume = async () => {
    if (!activeAddress || !signer || !pool) return
    setActionLoading(true)
    try {
      if (pool.status === 'active') {
        await pauseDevicePool(Number(pool.appId), activeAddress, signer)
        toast.success('Pool paused')
      } else {
        await resumeDevicePool(Number(pool.appId), activeAddress, signer)
        toast.success('Pool resumed')
      }
      await loadData()
    } catch (err: any) {
      toast.error(err?.message || 'Action failed')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCreateAnnouncement = async () => {
    if (!annTitle.trim() || !annBody.trim()) {
      toast.error('Title and body are required')
      return
    }
    setAnnSubmitting(true)
    try {
      await createAnnouncement(appId, {
        title: annTitle.trim(),
        body: annBody.trim(),
        priority: annPriority,
      })
      toast.success('Announcement created!')
      setAnnTitle('')
      setAnnBody('')
      setAnnPriority('normal')
      const ann = await getAnnouncements(appId)
      setAnnouncements(ann)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create announcement')
    } finally {
      setAnnSubmitting(false)
    }
  }

  return (
    <div className="w-full mt-[40px] mb-[47px] flex-1">
      <div className="max-xxxl:w-[95%] w-[80%] m-auto">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Spin size="large" />
          </div>
        ) : !pool ? (
          <div className="text-center py-20">
            <h3 className="text-xl font-semibold text-[var(--text-heading)]">Pool Not Found</h3>
            <p className="text-gray-500 mt-2">Could not find device staking pool with App ID: {appId}</p>
          </div>
        ) : !isCreator ? (
          <div className="text-center py-20">
            <h3 className="text-xl font-semibold text-[var(--text-heading)]">Access Denied</h3>
            <p className="text-gray-500 mt-2">Only the pool creator can access this dashboard.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {pool.imageUrl && (
                  <img src={pool.imageUrl} alt={pool.name} className="w-14 h-14 rounded-full object-cover" />
                )}
                <div>
                  <h2 className="text-2xl font-bold text-[var(--text-primary)] font-apex">{pool.name}</h2>
                  <p className="text-sm text-[var(--text-secondary)]">Creator Dashboard</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  text={actionLoading ? 'Processing...' : pool.status === 'active' ? 'Pause Pool' : 'Resume Pool'}
                  className={`button ${pool.status === 'active' ? 'btn-red-border' : 'btn-primary'}`}
                  height={40}
                  width={140}
                  onClick={handlePauseResume}
                  disabled={actionLoading}
                  loading={actionLoading}
                />
              </div>
            </div>

            {/* Status Breakdown */}
            {analytics?.statusBreakdown && (
              <div className="bg-[var(--bg-card)] rounded-xl p-6 shadow">
                <h4 className="text-lg font-bold text-[var(--text-primary)] mb-4">Status Breakdown</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(analytics.statusBreakdown).map(([status, count]) => (
                    <div key={status} className="bg-[var(--bg-secondary)] rounded-lg p-3 text-center">
                      <p className="text-xs text-[var(--text-secondary)] capitalize">{status.replace(/_/g, ' ')}</p>
                      <p className="text-xl font-bold text-[var(--text-primary)]">{count}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Requirement Compliance */}
            {analytics?.complianceRates && Object.keys(analytics.complianceRates).length > 0 && (
              <div className="bg-[var(--bg-card)] rounded-xl p-6 shadow">
                <h4 className="text-lg font-bold text-[var(--text-primary)] mb-4">Requirement Compliance</h4>
                <div className="flex flex-col gap-3">
                  {Object.entries(analytics.complianceRates).map(([reqId, rate]) => {
                    const req = pool.requirements?.find((r) => r.requirementId === reqId)
                    return (
                      <div key={reqId}>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm text-[var(--text-primary)]">{req?.label || reqId}</span>
                          <span className="text-sm font-medium text-[var(--text-primary)]">{(rate as number).toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className="bg-green-500 h-2 rounded-full transition-all"
                            style={{ width: `${Math.min(rate as number, 100)}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Multiplier Distribution */}
            {analytics?.multiplierDistribution && Object.keys(analytics.multiplierDistribution).length > 0 && (
              <div className="bg-[var(--bg-card)] rounded-xl p-6 shadow">
                <h4 className="text-lg font-bold text-[var(--text-primary)] mb-4">Multiplier Distribution</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(analytics.multiplierDistribution).map(([range, count]) => (
                    <div key={range} className="bg-[var(--bg-secondary)] rounded-lg p-3 text-center">
                      <p className="text-xs text-[var(--text-secondary)]">{range}</p>
                      <p className="text-lg font-bold text-[var(--text-primary)]">{count}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Total Claimed */}
            {analytics?.totalClaimed !== undefined && (
              <div className="bg-[var(--bg-card)] rounded-xl p-6 shadow">
                <h4 className="text-lg font-bold text-[var(--text-primary)] mb-2">Total Rewards Claimed</h4>
                <p className="text-2xl font-bold text-green">
                  {(analytics.totalClaimed / Math.pow(10, pool.rewardToken?.decimals || 6)).toLocaleString()} {pool.rewardToken?.symbol}
                </p>
              </div>
            )}

            {/* Staker Growth */}
            {analytics?.stakerGrowth && Object.keys(analytics.stakerGrowth).length > 0 && (
              <div className="bg-[var(--bg-card)] rounded-xl p-6 shadow">
                <h4 className="text-lg font-bold text-[var(--text-primary)] mb-4">Staker Growth</h4>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                  {Object.entries(analytics.stakerGrowth).map(([month, count]) => (
                    <div key={month} className="bg-[var(--bg-secondary)] rounded-lg p-3 text-center">
                      <p className="text-xs text-[var(--text-secondary)]">{month}</p>
                      <p className="text-lg font-bold text-[var(--text-primary)]">{count}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Announcement Management */}
            {pool.announcementsEnabled && (
              <div className="bg-[var(--bg-card)] rounded-xl p-6 shadow">
                <h4 className="text-lg font-bold text-[var(--text-primary)] mb-4">Announcements</h4>

                {/* Create Form */}
                <div className="bg-[var(--bg-secondary)] rounded-lg p-4 mb-4">
                  <p className="text-sm font-medium text-[var(--text-primary)] mb-3">New Announcement</p>
                  <div className="flex flex-col gap-3">
                    <input
                      type="text"
                      placeholder="Title"
                      value={annTitle}
                      onChange={(e) => setAnnTitle(e.target.value)}
                      className="w-full bg-[var(--input-bg)] rounded-lg p-2 text-sm text-[var(--input-text)] focus:outline-none"
                      maxLength={200}
                    />
                    <textarea
                      placeholder="Body"
                      value={annBody}
                      onChange={(e) => setAnnBody(e.target.value)}
                      rows={3}
                      className="w-full bg-[var(--input-bg)] rounded-lg p-2 text-sm text-[var(--input-text)] focus:outline-none resize-none"
                      maxLength={2000}
                    />
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={annPriority === 'normal'}
                          onChange={() => setAnnPriority('normal')}
                        />
                        <span className="text-sm text-[var(--text-primary)]">Normal</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={annPriority === 'urgent'}
                          onChange={() => setAnnPriority('urgent')}
                        />
                        <span className="text-sm text-red-500">Urgent</span>
                      </label>
                    </div>
                    <Button
                      text={annSubmitting ? 'Creating...' : 'Create Announcement'}
                      className="button btn-primary"
                      height={38}
                      width={180}
                      onClick={handleCreateAnnouncement}
                      disabled={annSubmitting || !annTitle.trim() || !annBody.trim()}
                      loading={annSubmitting}
                    />
                  </div>
                </div>

                {/* Existing Announcements */}
                {announcements.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {announcements.map((ann) => (
                      <div key={ann._id} className={`rounded-lg p-3 border ${
                        ann.priority === 'urgent'
                          ? 'border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800'
                          : 'border-[var(--border-color)] bg-[var(--bg-secondary)]'
                      }`}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-medium text-sm text-[var(--text-primary)]">{ann.title}</p>
                          {ann.priority === 'urgent' && (
                            <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">Urgent</span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-secondary)]">{ann.body}</p>
                        <p className="text-[10px] text-gray-400 mt-1">{new Date(ann.createdAt).toLocaleDateString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default DeviceDashboardContent
