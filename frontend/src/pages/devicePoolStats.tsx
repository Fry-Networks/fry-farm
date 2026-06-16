import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Footer from '../components/layout/footer'
import Navbar from '../components/layout/navbar'
import PageBg from '../components/shared/pageBg'
import { getDevicePool, getPositionsByPool, checkRequirements, getAnnouncements } from '../services/deviceStakingApi'
import { tokenServiceInstance as tokenService } from '../services/TokenService'
import { useWallet } from '@txnlab/use-wallet'
import type { DevicePool, DevicePosition, DeviceAnnouncement } from '../types/deviceStaking'
import { Spin } from 'antd'
import { Icon } from '@iconify/react'
import { usePreferences } from '../contexts/PreferencesContext'
import { friendlyFee } from '../utils/grandmaLabels'

const REWARD_MODELS: Record<string, string> = {
  fixed_rate: 'Fixed Rate',
  proportional: 'Proportional',
  apr: 'APR',
}

const DevicePoolStats = () => {
  const [searchParams] = useSearchParams()
  const appId = searchParams.get('appId') || ''
  const { activeAddress } = useWallet()
  const { isSimpleMode } = usePreferences()

  const [pool, setPool] = useState<DevicePool | null>(null)
  const [positions, setPositions] = useState<DevicePosition[]>([])
  const [announcements, setAnnouncements] = useState<DeviceAnnouncement[]>([])
  const [requirementStatuses, setRequirementStatuses] = useState<any[]>([])
  const [allRequiredMet, setAllRequiredMet] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!appId) return
    const load = async () => {
      try {
        const [poolData, stakes] = await Promise.all([
          getDevicePool(appId),
          getPositionsByPool(appId),
        ])

        setPool(poolData)
        setPositions(stakes)

        if (poolData.announcementsEnabled) {
          try {
            const ann = await getAnnouncements(appId)
            setAnnouncements(ann)
          } catch { /* skip */ }
        }

        if (activeAddress && poolData.requirements?.length > 0) {
          try {
            const result = await checkRequirements(appId, activeAddress)
            setRequirementStatuses(result.statuses)
            setAllRequiredMet(result.allRequiredMet)
          } catch { /* skip */ }
        }
      } catch (err) {
        console.error('Error loading pool stats:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [appId, activeAddress])

  const tokenSymbol = pool?.rewardToken?.symbol || ''
  const decimals = pool?.rewardToken?.decimals || 6

  const getRewardDisplay = () => {
    if (!pool) return ''
    switch (pool.rewardModel) {
      case 'fixed_rate':
        return `${((pool.rewardPerDay || 0) / Math.pow(10, decimals)).toLocaleString()} ${tokenSymbol}/day`
      case 'proportional':
        return `${((pool.dailyPoolReward || 0) / Math.pow(10, decimals)).toLocaleString()} ${tokenSymbol} daily pool`
      case 'apr':
        return `${((pool.apr || 0) / 100).toFixed(2)}% APR`
      default:
        return ''
    }
  }

  return (
    <>
      <div className="relative overflow-hidden min-h-screen flex flex-col">
        <PageBg />
        <Navbar />
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
            ) : (
              <div className="flex flex-col gap-6">
                {/* Header */}
                <div className="flex items-center gap-4">
                  {pool.imageUrl && (
                    <img src={pool.imageUrl} alt={pool.name} className="w-16 h-16 rounded-full object-cover" />
                  )}
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl font-bold text-[var(--text-primary)] font-apex">{pool.name}</h2>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        pool.stakingMode === 'verified-hold'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      }`}>
                        {pool.stakingMode === 'verified-hold' ? 'Verified Hold' : 'Escrow'}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        pool.status === 'active'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {pool.status}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)]">{pool.description}</p>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div className="bg-[var(--bg-card)] rounded-xl p-4 shadow">
                    <p className="text-sm text-[var(--text-secondary)]">Devices Staked</p>
                    <p className="text-xl font-bold text-[var(--text-primary)]">{pool.totalStaked || 0}</p>
                  </div>
                  <div className="bg-[var(--bg-card)] rounded-xl p-4 shadow">
                    <p className="text-sm text-[var(--text-secondary)]">Total Stakers</p>
                    <p className="text-xl font-bold text-[var(--text-primary)]">{pool.totalStakers || 0}</p>
                  </div>
                  <div className="bg-[var(--bg-card)] rounded-xl p-4 shadow">
                    <p className="text-sm text-[var(--text-secondary)]">Staking Mode</p>
                    <p className="text-xl font-bold text-[var(--text-primary)]">{pool.stakingMode === 'verified-hold' ? 'Hold' : 'Escrow'}</p>
                  </div>
                  <div className="bg-[var(--bg-card)] rounded-xl p-4 shadow">
                    <p className="text-sm text-[var(--text-secondary)]">Reward Model</p>
                    <p className="text-xl font-bold text-[var(--text-primary)]">{REWARD_MODELS[pool.rewardModel] || pool.rewardModel}</p>
                  </div>
                  <div className="bg-[var(--bg-card)] rounded-xl p-4 shadow">
                    <p className="text-sm text-[var(--text-secondary)]">Reward Token</p>
                    <p className="text-xl font-bold text-[var(--text-primary)]">{tokenSymbol}</p>
                  </div>
                  <div className="bg-[var(--bg-card)] rounded-xl p-4 shadow">
                    <p className="text-sm text-[var(--text-secondary)]">Status</p>
                    <p className={`text-xl font-bold ${pool.status === 'active' ? 'text-green' : 'text-red-500'}`}>
                      {pool.status === 'active' ? 'Active' : pool.status}
                    </p>
                  </div>
                </div>

                {/* Pool Details */}
                <div className="bg-[var(--bg-card)] rounded-xl p-6 shadow">
                  <h4 className="text-lg font-bold text-[var(--text-primary)] mb-4">Pool Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">App ID</span>
                      <a
                        href={`https://explorer.perawallet.app/application/${pool.appId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline"
                      >
                        {pool.appId}
                      </a>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Creator</span>
                      <span className="text-[var(--text-primary)] text-sm">{pool.creator?.slice(0, 8)}...{pool.creator?.slice(-6)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Reward Rate</span>
                      <span className="text-[var(--text-primary)]">{getRewardDisplay()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Lock Period</span>
                      <span className="text-[var(--text-primary)]">{pool.lockPeriod > 0 ? `${pool.lockPeriod / 86400} days` : 'None'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Pool Ends</span>
                      <span className="text-[var(--text-primary)]">
                        {pool.endDate ? new Date(pool.endDate).toLocaleDateString() : 'No end date'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Deposit Fee</span>
                      <span className="text-[var(--text-primary)]">{isSimpleMode ? friendlyFee((pool.depositFeeBps || 0) / 100) : `${((pool.depositFeeBps || 0) / 100).toFixed(2)}%`}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Withdraw Fee</span>
                      <span className="text-[var(--text-primary)]">{isSimpleMode ? friendlyFee((pool.withdrawFeeBps || 0) / 100) : `${((pool.withdrawFeeBps || 0) / 100).toFixed(2)}%`}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Claim Fee</span>
                      <span className="text-[var(--text-primary)]">{isSimpleMode ? friendlyFee((pool.claimFeeBps || 0) / 100) : `${((pool.claimFeeBps || 0) / 100).toFixed(2)}%`}</span>
                    </div>
                    {pool.gatedAccessEnabled && pool.gatedAccessLabel && (
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Gated Access</span>
                        <span className="text-[var(--text-primary)]">{pool.gatedAccessLabel}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Requirements */}
                {pool.requirements?.length > 0 && (
                  <div className="bg-[var(--bg-card)] rounded-xl p-6 shadow">
                    <h4 className="text-lg font-bold text-[var(--text-primary)] mb-4">Requirements</h4>
                    <div className="flex flex-col gap-3">
                      {pool.requirements.map((req) => {
                        const status = requirementStatuses.find((s) => s.requirementId === req.requirementId)
                        return (
                          <div key={req.requirementId} className="flex items-center justify-between bg-[var(--bg-secondary)] rounded-lg p-3">
                            <div className="flex items-center gap-3">
                              <Icon
                                icon={req.type === 'token_balance' ? 'mdi:coin' : req.type === 'nft_holding' ? 'mdi:image' : req.type === 'staking_position' ? 'mdi:lock' : req.type === 'multi_device' ? 'mdi:devices' : 'mdi:clock'}
                                width={20}
                                className="text-[var(--text-secondary)]"
                              />
                              <div>
                                <p className="text-sm font-medium text-[var(--text-primary)]">{req.label}</p>
                                {req.description && <p className="text-xs text-[var(--text-secondary)]">{req.description}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                req.enforcement === 'required'
                                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                  : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                              }`}>
                                {req.enforcement === 'required' ? 'Required' : 'Boost'}
                              </span>
                              {status && (
                                <Icon
                                  icon={status.met ? 'mdi:check-circle' : 'mdi:close-circle'}
                                  width={18}
                                  className={status.met ? 'text-green-500' : 'text-red-500'}
                                />
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Multipliers */}
                {pool.boostMultipliers?.length > 0 && (
                  <div className="bg-[var(--bg-card)] rounded-xl p-6 shadow">
                    <h4 className="text-lg font-bold text-[var(--text-primary)] mb-4">Boost Multipliers</h4>
                    {isSimpleMode ? (
                      <p className="text-sm text-[var(--text-secondary)]">Bonus rewards available for meeting certain conditions</p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {pool.boostMultipliers.map((mult) => (
                          <div key={mult.multiplierId} className="bg-[var(--bg-secondary)] rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-sm font-medium text-[var(--text-primary)]">{mult.label}</p>
                              <span className="text-xs text-[var(--text-secondary)]">
                                Max: {(mult.maxMultiplier / 10000).toFixed(2)}x
                              </span>
                            </div>
                            {mult.description && <p className="text-xs text-[var(--text-secondary)]">{mult.description}</p>}
                            <div className="flex gap-2 mt-1">
                              <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                {mult.type.replace('_', ' ')}
                              </span>
                              {mult.stackable && (
                                <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                  Stackable
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Staked Devices */}
                <div className="bg-[var(--bg-card)] rounded-xl p-6 shadow">
                  <h4 className="text-lg font-bold text-[var(--text-primary)] mb-4">Staked Devices ({positions.length})</h4>
                  {positions.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No devices currently staked in this pool.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      {positions.map((pos) => (
                        <div key={pos._id} className="bg-[var(--bg-secondary)] rounded-lg p-3 text-center">
                          <div className="w-full aspect-square bg-[var(--bg-card)] rounded-md mb-2 flex items-center justify-center">
                            <Icon icon="mdi:devices" width={32} className="text-[var(--text-secondary)]" />
                          </div>
                          <p className="text-xs text-[var(--text-primary)] truncate">{pos.deviceNftName || `Device #${pos.deviceNftId}`}</p>
                          <p className="text-[10px] text-gray-500">{pos.wallet?.slice(0, 4)}...{pos.wallet?.slice(-4)}</p>
                          <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            pos.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {pos.status}
                          </span>
                          {pos.effectiveMultiplier > 10000 && !isSimpleMode && (
                            <p className="text-[10px] text-blue-500 mt-0.5">{(pos.effectiveMultiplier / 10000).toFixed(2)}x</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Announcements */}
                {pool.announcementsEnabled && announcements.length > 0 && (
                  <div className="bg-[var(--bg-card)] rounded-xl p-6 shadow">
                    <h4 className="text-lg font-bold text-[var(--text-primary)] mb-4">Announcements</h4>
                    <div className="flex flex-col gap-3">
                      {announcements.map((ann) => (
                        <div key={ann._id} className={`rounded-lg p-4 border ${
                          ann.priority === 'urgent'
                            ? 'border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800'
                            : 'border-[var(--border-color)] bg-[var(--bg-secondary)]'
                        }`}>
                          <div className="flex items-center justify-between mb-1">
                            <p className="font-medium text-[var(--text-primary)]">{ann.title}</p>
                            {ann.priority === 'urgent' && (
                              <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">Urgent</span>
                            )}
                          </div>
                          <p className="text-sm text-[var(--text-secondary)]">{ann.body}</p>
                          <p className="text-xs text-gray-400 mt-2">{new Date(ann.createdAt).toLocaleDateString()}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <Footer />
      </div>
    </>
  )
}

export default DevicePoolStats
