import React, { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { Popconfirm } from 'antd'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useAuth } from '../../../hooks/useAuth'
import {
  fetchMyCommunityEvents,
  cancelCommunityEvent,
  type FryEvent,
} from '../../../services/eventService'
import FundingModal from './FundingModal'

interface CommunityEventPanelProps {
  wallet: string
  onRefresh: () => void
}

const STATUS_LABELS: Record<string, { bg: string; text: string; label: string }> = {
  draft:     { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Draft' },
  scheduled: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Scheduled' },
  active:    { bg: 'bg-green/20', text: 'text-green', label: 'Active' },
  ended:     { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Ended' },
  cancelled: { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Cancelled' },
}

const FUNDING_LABELS: Record<string, { text: string; color: string }> = {
  unfunded:    { text: 'Unfunded', color: 'text-yellow-400' },
  funded:      { text: 'Funded', color: 'text-green' },
  distributed: { text: 'Distributed', color: 'text-blue-400' },
  refunded:    { text: 'Refunded', color: 'text-gray-400' },
}

const CommunityEventPanel: React.FC<CommunityEventPanelProps> = ({ wallet, onRefresh }) => {
  const navigate = useNavigate()
  const { ensureAuth } = useAuth()
  const [events, setEvents] = useState<FryEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [fundingEvent, setFundingEvent] = useState<FryEvent | null>(null)

  const loadMyEvents = () => {
    fetchMyCommunityEvents()
      .then(setEvents)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (wallet) loadMyEvents()
  }, [wallet])

  const handleCancel = async (event: FryEvent) => {
    try {
      await ensureAuth()
      await cancelCommunityEvent(event._id)
      toast.success(event.fundingStatus === 'funded' ? 'Event cancelled and tokens refunded' : 'Event cancelled')
      loadMyEvents()
      onRefresh()
    } catch (err: any) {
      if (!err.message?.includes('cancelled') && !err.message?.includes('CANCELLED')) {
        toast.error(err.response?.data?.message || 'Cancel failed')
      }
    }
  }

  const handleFundingSuccess = () => {
    setFundingEvent(null)
    loadMyEvents()
    onRefresh()
  }

  if (events.length === 0 && !loading) return null

  return (
    <>
      <div className="bg-[var(--bg-card)] rounded-[18px] p-5 mb-6 shadow-[0px_4px_24.2px_0px_var(--shadow-color)]">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-between w-full"
        >
          <div className="flex items-center gap-2">
            <Icon icon="mdi:calendar-account" width={20} className="text-[#DE0308]" />
            <h3 className="text-[var(--text-heading)] font-apex font-bold text-sm uppercase">
              My Events
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-[var(--bg-secondary)] text-text_clr text-xs">
              {events.length}
            </span>
          </div>
          <Icon
            icon={collapsed ? 'mdi:chevron-down' : 'mdi:chevron-up'}
            width={20}
            className="text-text_clr"
          />
        </button>

        {!collapsed && (
          <div className="mt-4 flex flex-col gap-2">
            {loading && (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-[#DE0308] border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!loading && events.map(event => {
              const statusStyle = STATUS_LABELS[event.status] || STATUS_LABELS.cancelled
              const fundingStyle = event.fundingStatus ? FUNDING_LABELS[event.fundingStatus] : null
              const decimals = event.rewardAsaDecimals || 6
              const divisor = Math.pow(10, decimals)

              return (
                <div
                  key={event._id}
                  className="flex items-center justify-between bg-[var(--bg-secondary)] rounded-lg px-4 py-3 hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
                  onClick={() => navigate(`/events/${event._id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--text-heading)] font-medium text-sm truncate">
                        {event.name}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                        {statusStyle.label}
                      </span>
                      {fundingStyle && (
                        <span className={`text-[10px] ${fundingStyle.color}`}>
                          {fundingStyle.text}
                        </span>
                      )}
                    </div>
                    {(event.rewardPool ?? 0) > 0 && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-text_clr">
                        <Icon icon="mdi:trophy" width={12} color="#DE0308" />
                        <span>
                          {(event.rewardPool! / divisor).toLocaleString()}{' '}
                          {event.rewardAsaName || `ASA #${event.rewardAsaId}`}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 ml-3" onClick={e => e.stopPropagation()}>
                    {event.status === 'draft' && event.fundingStatus === 'unfunded' && (
                      <button
                        onClick={() => setFundingEvent(event)}
                        className="px-2.5 py-1 rounded-[6px] bg-green/20 text-green text-xs font-medium flex items-center gap-1 hover:opacity-80"
                      >
                        <Icon icon="mdi:cash-plus" width={12} /> Fund
                      </button>
                    )}
                    {(event.status === 'scheduled' || event.status === 'active') && event.fundingStatus === 'funded' && event.status !== 'active' && (
                      <Popconfirm
                        title="Cancel this event?"
                        description={event.fundingStatus === 'funded' ? 'Tokens will be refunded to your wallet.' : undefined}
                        onConfirm={() => handleCancel(event)}
                        okText="Cancel Event"
                        okButtonProps={{ danger: true }}
                      >
                        <button className="px-2.5 py-1 rounded-[6px] bg-red-500/20 text-red-400 text-xs font-medium flex items-center gap-1 hover:opacity-80">
                          <Icon icon="mdi:cancel" width={12} /> Cancel
                        </button>
                      </Popconfirm>
                    )}
                    {event.status === 'ended' && (
                      <button
                        onClick={() => navigate(`/events/${event._id}`)}
                        className="px-2.5 py-1 rounded-[6px] bg-[var(--bg-card)] text-text_clr text-xs font-medium flex items-center gap-1 hover:text-[var(--text-heading)]"
                      >
                        <Icon icon="mdi:chart-bar" width={12} /> Results
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Funding Modal */}
      <FundingModal
        visible={!!fundingEvent}
        event={fundingEvent}
        onClose={() => setFundingEvent(null)}
        onSuccess={handleFundingSuccess}
      />
    </>
  )
}

export default CommunityEventPanel
