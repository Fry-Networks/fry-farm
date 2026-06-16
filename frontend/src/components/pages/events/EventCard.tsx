import { Icon } from '@iconify/react'
import { Popconfirm } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FryEvent } from '../../../services/eventService'

interface EventCardProps {
  event: FryEvent
  isAdmin?: boolean
  onEdit?: (event: FryEvent) => void
  onActivate?: (event: FryEvent) => void
  onEnd?: (event: FryEvent) => void
  onCancel?: (event: FryEvent) => void
  onDelete?: (event: FryEvent) => void
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getTimeRemaining(endDate: string) {
  const diff = new Date(endDate).getTime() - Date.now()
  if (diff <= 0) return null
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
  const minutes = Math.floor((diff / (1000 * 60)) % 60)
  return `${days}d ${hours}h ${minutes}m`
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string; pulse?: boolean }> = {
  active:    { bg: 'bg-green/20', text: 'text-green', label: 'Active', pulse: true },
  scheduled: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Upcoming' },
  draft:     { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Upcoming' },
  ended:     { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Ended' },
  cancelled: { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Cancelled' },
}

const ADMIN_STATUS_STYLES: Record<string, { bg: string; text: string; label: string; pulse?: boolean }> = {
  ...STATUS_STYLES,
  draft: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Draft' },
}

const EventCard: React.FC<EventCardProps> = ({
  event, isAdmin, onEdit, onActivate, onEnd, onCancel, onDelete,
}) => {
  const navigate = useNavigate()
  const [countdown, setCountdown] = useState(() => event.endDate ? getTimeRemaining(event.endDate) : null)

  useEffect(() => {
    if (event.status !== 'active' || !event.endDate) return
    const timer = setInterval(() => {
      setCountdown(getTimeRemaining(event.endDate!))
    }, 60000)
    return () => clearInterval(timer)
  }, [event.endDate, event.status])

  const styles = isAdmin ? ADMIN_STATUS_STYLES : STATUS_STYLES
  const statusStyle = styles[event.status] || STATUS_STYLES.cancelled

  return (
    <div
      onClick={() => navigate(`/events/${event._id}`)}
      className="bg-[var(--bg-card)] rounded-[18px] overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.01] shadow-[0px_4px_24.2px_0px_var(--shadow-color)] border-solid border-2 border-transparent"
    >
      {event.bannerImage && (
        <img
          src={event.bannerImage}
          alt=""
          className="w-full h-[160px] object-cover"
        />
      )}
      <div className="p-6">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-[var(--text-heading)] font-apex font-bold text-xl uppercase">{event.name}</h3>
          {event.eventType === 'community' && (
            <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 text-[10px] font-medium uppercase">
              Community
            </span>
          )}
        </div>
        <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium shrink-0 ${statusStyle.bg} ${statusStyle.text}`}>
          {statusStyle.pulse && (
            <span className="w-2 h-2 rounded-full bg-green animate-pulse" />
          )}
          {statusStyle.label}
        </span>
      </div>

      {event.description && (
        <p className="text-text_clr text-sm mb-4 line-clamp-2">{event.description}</p>
      )}

      {event.eventType === 'community' && event.creatorWallet && (
        <div className="flex items-center gap-1.5 text-text_clr text-xs mb-3">
          <Icon icon="mdi:account" width={14} />
          <span>by {event.creatorWallet.slice(0, 6)}...{event.creatorWallet.slice(-4)}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-4 text-sm">
        {(event.startDate || event.endDate) && (
          <div className="flex items-center gap-1.5 text-text_clr">
            <Icon icon="mdi:calendar-range" width={16} />
            <span>{event.startDate ? formatDate(event.startDate) : '—'} – {event.endDate ? formatDate(event.endDate) : '—'}</span>
          </div>
        )}

        {event.status === 'active' && countdown && (
          <div className="flex items-center gap-1.5 text-green font-medium">
            <Icon icon="mdi:clock-outline" width={16} />
            <span>Ends in {countdown}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-[var(--border-color)]">
        {event.airdropPoolFry > 0 && event.eventType !== 'community' && (
          <div className="flex items-center gap-1.5 text-[var(--text-heading)] font-medium">
            <Icon icon="mdi:trophy" width={18} color="#DE0308" />
            <span>{event.airdropPoolFry.toLocaleString()} FRY</span>
          </div>
        )}
        {event.eventType === 'community' && (event.rewardPool ?? 0) > 0 && (
          <div className="flex items-center gap-1.5 text-[var(--text-heading)] font-medium">
            <Icon icon="mdi:trophy" width={18} color="#DE0308" />
            <span>
              {(event.rewardPool! / Math.pow(10, event.rewardAsaDecimals || 6)).toLocaleString()}{' '}
              {event.rewardAsaName || `ASA #${event.rewardAsaId}`}
            </span>
          </div>
        )}
        {event.eventType === 'community' && event.fundingStatus === 'unfunded' && (
          <span className="flex items-center gap-1 text-yellow-400 text-xs">
            <Icon icon="mdi:clock-outline" width={14} />
            Awaiting Funding
          </span>
        )}
        <div className="flex items-center gap-1.5 text-text_clr">
          <Icon icon="mdi:account-group" width={16} />
          <span>{event.totalParticipants} participants</span>
        </div>
        {event.challenges && (
          <div className="flex items-center gap-1.5 text-text_clr">
            <Icon icon="mdi:flag-checkered" width={16} />
            <span>{event.challenges.length} challenges</span>
          </div>
        )}
      </div>

      {/* Admin action buttons */}
      {isAdmin && (
        <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-[var(--border-color)]">
          {(event.status === 'draft' || event.status === 'scheduled' || event.status === 'active') && onEdit && (
            <button
              onClick={e => { e.stopPropagation(); onEdit(event) }}
              className="px-3 py-1 rounded-[6px] bg-[var(--bg-secondary)] text-text_clr text-xs font-medium flex items-center gap-1 hover:text-[var(--text-heading)] transition-colors"
            >
              <Icon icon="mdi:pencil" width={14} /> Edit
            </button>
          )}
          {(event.status === 'draft' || event.status === 'scheduled') && onActivate && (
            <Popconfirm
              title="Activate this event?"
              onConfirm={() => onActivate(event)}
              okText="Activate"
            >
              <button
                onClick={e => e.stopPropagation()}
                className="px-3 py-1 rounded-[6px] bg-green/20 text-green text-xs font-medium flex items-center gap-1 hover:opacity-80 transition-opacity"
              >
                <Icon icon="mdi:play" width={14} /> Activate
              </button>
            </Popconfirm>
          )}
          {event.status === 'active' && onEnd && (
            <Popconfirm
              title="End this event?"
              description="Triggers final point calc + airdrop."
              onConfirm={() => onEnd(event)}
              okText="End"
              okButtonProps={{ danger: true }}
            >
              <button
                onClick={e => e.stopPropagation()}
                className="px-3 py-1 rounded-[6px] bg-orange-500/20 text-orange-400 text-xs font-medium flex items-center gap-1 hover:opacity-80 transition-opacity"
              >
                <Icon icon="mdi:stop" width={14} /> End
              </button>
            </Popconfirm>
          )}
          {(event.status === 'scheduled' || event.status === 'active') && onCancel && (
            <Popconfirm
              title="Cancel this event?"
              onConfirm={() => onCancel(event)}
              okText="Cancel Event"
              okButtonProps={{ danger: true }}
            >
              <button
                onClick={e => e.stopPropagation()}
                className="px-3 py-1 rounded-[6px] bg-red-500/20 text-red-400 text-xs font-medium flex items-center gap-1 hover:opacity-80 transition-opacity"
              >
                <Icon icon="mdi:cancel" width={14} /> Cancel
              </button>
            </Popconfirm>
          )}
          {(event.status === 'draft' || event.status === 'cancelled') && onDelete && (
            <Popconfirm
              title="Delete this event permanently?"
              onConfirm={() => onDelete(event)}
              okText="Delete"
              okButtonProps={{ danger: true }}
            >
              <button
                onClick={e => e.stopPropagation()}
                className="px-3 py-1 rounded-[6px] bg-red-500/20 text-red-400 text-xs font-medium flex items-center gap-1 hover:opacity-80 transition-opacity"
              >
                <Icon icon="mdi:delete" width={14} /> Delete
              </button>
            </Popconfirm>
          )}
        </div>
      )}
      </div>
    </div>
  )
}

export default EventCard
