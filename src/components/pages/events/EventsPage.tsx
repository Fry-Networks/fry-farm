import { Icon } from '@iconify/react'
import { useMultiChainWallet } from '../../../hooks/useMultiChainWallet'
import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { useAuth } from '../../../hooks/useAuth'
import {
  fetchAllEvents,
  fetchCommunityEvents,
  activateEvent,
  endEvent,
  cancelEvent,
  deleteEvent,
  type FryEvent,
} from '../../../services/eventService'
import CommunityEventFormModal from './CommunityEventFormModal'
import CommunityEventPanel from './CommunityEventPanel'
import EventCard from './EventCard'
import EventFormModal from './EventFormModal'

type ScopeKey = 'official' | 'community'
type TabKey = 'active' | 'upcoming' | 'ended'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'ended', label: 'Ended' },
]

function filterEvents(events: FryEvent[], tab: TabKey): FryEvent[] {
  switch (tab) {
    case 'active':
      return events.filter(e => e.status === 'active')
    case 'upcoming':
      return events.filter(e => e.status === 'scheduled' || e.status === 'draft')
    case 'ended':
      return events.filter(e => e.status === 'ended' || e.status === 'cancelled')
  }
}

const EventsPage: React.FC = () => {
  const { activeAddress } = useMultiChainWallet()
  const { isAdmin, isAuthenticated, ensureAuth } = useAuth()

  // Scope tab
  const [eventScope, setEventScope] = useState<ScopeKey>('official')

  // Official events state
  const [events, setEvents] = useState<FryEvent[]>([])
  const [loading, setLoading] = useState(true)

  // Community events state
  const [communityEvents, setCommunityEvents] = useState<FryEvent[]>([])
  const [communityLoading, setCommunityLoading] = useState(false)

  // Shared state
  const [activeTab, setActiveTab] = useState<TabKey>('active')

  // Admin modal state (create new + card-level edit)
  const [showEventForm, setShowEventForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<FryEvent | null>(null)

  // Community modal state
  const [showCommunityForm, setShowCommunityForm] = useState(false)

  // Load official events
  const loadEvents = () => {
    fetchAllEvents()
      .then(setEvents)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  // Load community events
  const loadCommunityEvents = () => {
    setCommunityLoading(true)
    fetchCommunityEvents()
      .then(setCommunityEvents)
      .catch(() => {})
      .finally(() => setCommunityLoading(false))
  }

  useEffect(() => { loadEvents() }, [])

  useEffect(() => {
    if (eventScope === 'community') {
      loadCommunityEvents()
    }
  }, [eventScope])

  const refetchEvents = () => {
    if (eventScope === 'official') {
      fetchAllEvents().then(setEvents).catch(() => {})
    } else {
      loadCommunityEvents()
    }
  }

  const currentEvents = eventScope === 'official' ? events : communityEvents
  const currentLoading = eventScope === 'official' ? loading : communityLoading
  const filtered = filterEvents(currentEvents, activeTab)

  const handleCardAction = async (action: (id: string) => Promise<any>, event: FryEvent, msg: string) => {
    try {
      await ensureAuth()
      await action(event._id)
      toast.success(msg)
      refetchEvents()
    } catch (err: any) {
      if (!err.message?.includes('cancelled') && !err.message?.includes('CANCELLED')) {
        toast.error(err.response?.data?.message || 'Action failed')
      }
    }
  }

  const handleScopeChange = (scope: ScopeKey) => {
    setEventScope(scope)
    setActiveTab('active')
  }

  return (
    <div className="max-xxxl:w-[95%] w-[80%] m-auto py-[40px] flex-1">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-[var(--text-heading)] font-apex font-bold text-3xl uppercase tracking-wide">
            Events
          </h1>
          <p className="text-text_clr mt-2">
            {eventScope === 'official'
              ? 'Compete in challenges, earn points, win FRY airdrops'
              : 'User-created events with custom reward tokens'}
          </p>
        </div>
        {eventScope === 'official' && isAdmin && (
          <button
            onClick={() => { setEditingEvent(null); setShowEventForm(true) }}
            className="px-5 py-2.5 rounded-[8px] bg-[#DE0308] text-white font-apex font-bold uppercase text-sm flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <Icon icon="mdi:plus" width={18} /> Create Event
          </button>
        )}
        {eventScope === 'community' && activeAddress && (
          <button
            onClick={async () => {
              try { await ensureAuth(); setShowCommunityForm(true) } catch {}
            }}
            className="px-5 py-2.5 rounded-[8px] bg-[#DE0308] text-white font-apex font-bold uppercase text-sm flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <Icon icon="mdi:plus" width={18} /> Create Event
          </button>
        )}
        {eventScope === 'official' && activeAddress && !isAuthenticated && (
          <button
            onClick={() => { ensureAuth().catch(() => {}) }}
            className="px-4 py-2 rounded-[8px] bg-[var(--bg-card)] text-text_clr font-apex text-sm flex items-center gap-2 hover:text-[var(--text-heading)] transition-colors"
          >
            <Icon icon="mdi:login" width={16} /> Sign In
          </button>
        )}
      </div>

      {/* Scope tabs (Official / Community) */}
      <div className="flex gap-6 mb-4 border-b border-[var(--border-color)]">
        {(['official', 'community'] as const).map(scope => (
          <button
            key={scope}
            onClick={() => handleScopeChange(scope)}
            className={`pb-3 font-apex font-bold uppercase text-sm transition-colors border-b-2 ${
              eventScope === scope
                ? 'text-[#DE0308] border-[#DE0308]'
                : 'text-text_clr border-transparent hover:text-[var(--text-heading)]'
            }`}
          >
            {scope === 'official' ? 'Official Events' : 'Community Events'}
          </button>
        ))}
      </div>

      {/* Community disclaimer */}
      {eventScope === 'community' && (
        <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Icon icon="mdi:alert-circle" className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
            <p className="text-yellow-200/70 text-xs">
              <span className="text-yellow-400 font-semibold">Disclaimer:</span>{' '}
              Community events are created by users and are not endorsed, verified, or guaranteed by Fry Networks.
              Reward tokens are held in platform escrow until distribution. Participate at your own risk.
            </p>
          </div>
        </div>
      )}

      {/* My Events panel (community tab, wallet connected) */}
      {eventScope === 'community' && activeAddress && (
        <CommunityEventPanel
          wallet={activeAddress}
          onRefresh={loadCommunityEvents}
        />
      )}

      {/* Sub-tabs (Active / Upcoming / Ended) */}
      <div className="flex gap-2 mb-8">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2 rounded-[8px] font-apex font-bold uppercase text-sm transition-colors ${
              activeTab === tab.key
                ? 'bg-[#DE0308] text-white'
                : 'bg-[var(--bg-card)] text-text_clr hover:text-[var(--text-heading)]'
            }`}
          >
            {tab.label}
            {activeTab === tab.key && ` (${filtered.length})`}
          </button>
        ))}
      </div>

      {/* Loading */}
      {currentLoading && (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-[#DE0308] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!currentLoading && filtered.length === 0 && (
        <div className="bg-[var(--bg-card)] rounded-[18px] p-12 text-center shadow-[0px_4px_24.2px_0px_var(--shadow-color)]">
          <p className="text-text_clr text-lg">
            {activeTab === 'active'
              ? eventScope === 'community'
                ? 'No active community events right now.'
                : 'No active events right now. Check back soon!'
              : activeTab === 'upcoming'
              ? eventScope === 'community'
                ? 'No upcoming community events.'
                : 'No upcoming events scheduled.'
              : eventScope === 'community'
                ? 'No past community events.'
                : 'No past events to display.'}
          </p>
        </div>
      )}

      {/* Event cards */}
      {!currentLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          {filtered.map(event => (
            <EventCard
              key={event._id}
              event={event}
              isAdmin={isAdmin && eventScope === 'official'}
              onEdit={e => { setEditingEvent(e); setShowEventForm(true) }}
              onActivate={e => handleCardAction(activateEvent, e, 'Event activated')}
              onEnd={e => handleCardAction(endEvent, e, 'Event ended, airdrop triggered')}
              onCancel={e => handleCardAction(cancelEvent, e, 'Event cancelled')}
              onDelete={e => handleCardAction(deleteEvent, e, 'Event deleted')}
            />
          ))}
        </div>
      )}

      {/* Admin modals (event create + card-level edit) */}
      {isAdmin && (
        <EventFormModal
          open={showEventForm}
          onClose={() => { setShowEventForm(false); setEditingEvent(null) }}
          onSuccess={refetchEvents}
          event={editingEvent}
        />
      )}

      {/* Community event creation modal */}
      <CommunityEventFormModal
        visible={showCommunityForm}
        onClose={() => setShowCommunityForm(false)}
        onSuccess={() => {
          loadCommunityEvents()
          setShowCommunityForm(false)
        }}
      />
    </div>
  )
}

export default EventsPage
