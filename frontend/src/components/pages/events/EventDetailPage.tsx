import { Icon } from '@iconify/react'
import { useMultiChainWallet } from '../../../hooks/useMultiChainWallet'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import {
  fetchEventById,
  type FryEvent,
  type EventChallenge,
} from '../../../services/eventService'
import ChallengeList from './ChallengeList'
import ChallengeFormModal from './ChallengeFormModal'
import EventAdminPanel from './EventAdminPanel'
import EventFormModal from './EventFormModal'
import Leaderboard from './Leaderboard'
import UserStats from './UserStats'

const EventDetailPage: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>()
  const { activeAddress } = useMultiChainWallet()
  const { isAdmin } = useAuth()

  const [event, setEvent] = useState<FryEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Admin modal state
  const [showEventForm, setShowEventForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<FryEvent | null>(null)
  const [showChallengeForm, setShowChallengeForm] = useState(false)
  const [editingChallenge, setEditingChallenge] = useState<EventChallenge | null>(null)

  const refetch = useCallback(async () => {
    if (!eventId) return
    setLoading(true)
    try {
      const fresh = await fetchEventById(eventId)
      setEvent(fresh)
      setNotFound(false)
    } catch {
      setEvent(null)
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    refetch()
  }, [refetch])

  // Loading branch
  if (loading && !event) {
    return (
      <div className="relative z-[1] flex-1 py-[30px] px-[5%]">
        <div className="max-w-[1400px] m-auto flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-[#DE0308] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  // Not-found branch
  if (notFound || !event) {
    return (
      <div className="relative z-[1] flex-1 py-[30px] px-[5%]">
        <div className="max-w-[1400px] m-auto text-center py-20">
          <Icon icon="mdi:alert-circle-outline" width={48} className="mx-auto mb-4 text-[var(--text-secondary)]" />
          <h2 className="text-xl font-bold font-apex text-[var(--text-primary)] mb-2">Event Not Found</h2>
          <p className="text-[var(--text-secondary)] mb-6">This event does not exist or has been deleted.</p>
          <Link to="/events" className="text-[#DE0308] hover:underline font-bold">← Back to Events</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-xxxl:w-[95%] w-[80%] m-auto py-[40px] flex-1">
      {/* Back link */}
      <Link
        to="/events"
        className="text-text_clr hover:text-[var(--text-heading)] text-sm inline-flex items-center gap-1 mb-4"
      >
        <Icon icon="mdi:arrow-left" width={16} /> Back to Events
      </Link>

      {/* Event detail card */}
      <div className="bg-[var(--bg-card)] rounded-[18px] overflow-hidden shadow-[0px_4px_24.2px_0px_var(--shadow-color)]">
        {event.bannerImage && (
          <img
            src={event.bannerImage}
            alt=""
            className="w-full h-[240px] object-cover"
          />
        )}
        <div className="p-6">
          <h2 className="text-[var(--text-heading)] font-apex font-bold text-2xl uppercase mb-6">
            {event.name}
          </h2>

          {/* Community event info */}
          {event.eventType === 'community' && (
            <div className="mb-4">
              <div className="flex items-center gap-2 bg-yellow-900/20 border border-yellow-600/30 rounded-lg px-3 py-2 mb-4">
                <Icon icon="mdi:alert-circle" width={16} className="text-yellow-500 shrink-0" />
                <p className="text-yellow-200/60 text-xs">
                  This is a community-created event. Not endorsed by Fry Networks.
                </p>
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-text_clr mb-4">
                {event.creatorWallet && (
                  <div className="flex items-center gap-1.5">
                    <Icon icon="mdi:account" width={16} />
                    <span>Created by: {event.creatorWallet.slice(0, 6)}...{event.creatorWallet.slice(-4)}</span>
                  </div>
                )}
                {(event.rewardPool ?? 0) > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Icon icon="mdi:trophy" width={16} color="#DE0308" />
                    <span>
                      {(event.rewardPool! / Math.pow(10, event.rewardAsaDecimals || 6)).toLocaleString()}{' '}
                      {event.rewardAsaName || `ASA #${event.rewardAsaId}`}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Icon icon="mdi:safe" width={16} />
                  <span>Escrow: {event.fundingStatus === 'funded' ? 'Funded' : event.fundingStatus}</span>
                  {event.fundingStatus === 'funded' && (
                    <Icon icon="mdi:check-circle" width={14} className="text-green" />
                  )}
                </div>
              </div>
            </div>
          )}

          {event.description && (
            <p className="text-text_clr text-sm mb-6 whitespace-pre-wrap">{event.description}</p>
          )}

          {event.challenges && event.challenges.length > 0 && (
            <ChallengeList challenges={event.challenges} />
          )}

          <Leaderboard eventId={event._id} activeWallet={activeAddress || undefined} />

          {activeAddress ? (
            <UserStats eventId={event._id} wallet={activeAddress} vestingConfig={event.vesting} />
          ) : (
            <div className="bg-[var(--bg-secondary)] rounded-[12px] p-6 text-center">
              <p className="text-text_clr">Connect your wallet to see your stats</p>
            </div>
          )}
        </div>
      </div>

      {/* Admin panel — official events only */}
      {isAdmin && event.eventType !== 'community' && (
        <EventAdminPanel
          event={event}
          onRefresh={refetch}
          onEditEvent={e => {
            setEditingEvent(e)
            setShowEventForm(true)
          }}
          onEditChallenge={c => {
            setEditingChallenge(c)
            setShowChallengeForm(true)
          }}
          onAddChallenge={() => {
            setEditingChallenge(null)
            setShowChallengeForm(true)
          }}
        />
      )}

      {/* Admin modals */}
      {isAdmin && (
        <>
          <EventFormModal
            open={showEventForm}
            onClose={() => {
              setShowEventForm(false)
              setEditingEvent(null)
            }}
            onSuccess={refetch}
            event={editingEvent}
          />
          <ChallengeFormModal
            open={showChallengeForm}
            onClose={() => {
              setShowChallengeForm(false)
              setEditingChallenge(null)
            }}
            onSuccess={refetch}
            eventId={event._id}
            challenge={editingChallenge}
          />
        </>
      )}
    </div>
  )
}

export default EventDetailPage
