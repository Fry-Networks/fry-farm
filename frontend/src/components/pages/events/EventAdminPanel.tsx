import React, { useState } from 'react'
import { Popconfirm, Tooltip } from 'antd'
import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'
import { useAuth } from '../../../hooks/useAuth'
import { getChallengeConfig } from '../../../utils/challengeUtils'
import {
  activateEvent,
  endEvent,
  cancelEvent,
  deleteEvent,
  removeChallenge,
  triggerPointCalculation,
  triggerAirdrop,
  type FryEvent,
  type EventChallenge,
} from '../../../services/eventService'

interface EventAdminPanelProps {
  event: FryEvent
  onRefresh: () => void
  onEditEvent: (event: FryEvent) => void
  onEditChallenge: (challenge: EventChallenge) => void
  onAddChallenge: () => void
}

const EventAdminPanel: React.FC<EventAdminPanelProps> = ({
  event, onRefresh, onEditEvent, onEditChallenge, onAddChallenge,
}) => {
  const { ensureAuth } = useAuth()
  const [loadingAction, setLoadingAction] = useState<string | null>(null)

  const runAction = async (key: string, action: () => Promise<void>, successMsg: string) => {
    setLoadingAction(key)

    try {
      await ensureAuth()
    } catch (err: any) {
      console.error('[EventAdmin] Auth failed:', err)
      setLoadingAction(null)
      return
    }

    try {
      await action()
      toast.success(successMsg)
      onRefresh()
    } catch (err: any) {
      console.error('[EventAdmin] Action failed:', err.response?.status, err.response?.data)
      toast.error(err.response?.data?.message || 'Action failed')
    } finally {
      setLoadingAction(null)
    }
  }

  const isActive = event.status === 'active'
  const isEnded = event.status === 'ended'
  const isDraft = event.status === 'draft'
  const isScheduled = event.status === 'scheduled'
  const isCancelled = event.status === 'cancelled'
  const canDelete = isDraft || isCancelled
  const canEdit = !isEnded && !isCancelled

  const lastUpdate = event.lastPointsUpdate
    ? new Date(event.lastPointsUpdate).toLocaleString()
    : 'Never'

  return (
    <div className="bg-[var(--bg-card)] rounded-[18px] p-6 mt-4 border-t-2 border-[#DE0308] shadow-[0px_4px_24.2px_0px_var(--shadow-color)]">
      <h3 className="text-[var(--text-heading)] font-apex font-bold text-lg uppercase mb-4 flex items-center gap-2">
        <Icon icon="mdi:shield-crown" width={20} color="#DE0308" />
        Admin Panel
      </h3>

      {/* Section 1: Lifecycle */}
      <div className="mb-6">
        <h4 className="text-text_clr text-sm font-apex uppercase mb-3">Lifecycle</h4>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <button
              onClick={() => onEditEvent(event)}
              className="px-4 py-1.5 rounded-[8px] bg-[var(--bg-secondary)] text-[var(--text-heading)] text-sm font-medium flex items-center gap-1.5 hover:opacity-80 transition-opacity"
            >
              <Icon icon="mdi:pencil" width={16} /> Edit
            </button>
          )}

          {(isDraft || isScheduled) && (
            <Popconfirm
              title="Activate this event?"
              description="The event will go live immediately."
              onConfirm={() => runAction('activate', () => activateEvent(event._id).then(() => {}), 'Event activated')}
              okText="Activate"
              okButtonProps={{ danger: false }}
            >
              <button
                disabled={loadingAction === 'activate'}
                className="px-4 py-1.5 rounded-[8px] bg-green/20 text-green text-sm font-medium flex items-center gap-1.5 hover:opacity-80 transition-opacity disabled:opacity-50"
              >
                {loadingAction === 'activate'
                  ? <Icon icon="eos-icons:loading" width={16} />
                  : <Icon icon="mdi:play" width={16} />}
                Activate
              </button>
            </Popconfirm>
          )}

          {isActive && (
            <>
              <Popconfirm
                title="End this event?"
                description="This will trigger final point calculation and airdrop distribution."
                onConfirm={() => runAction('end', () => endEvent(event._id).then(() => {}), 'Event ended, airdrop triggered')}
                okText="End Event"
                okButtonProps={{ danger: true }}
              >
                <button
                  disabled={loadingAction === 'end'}
                  className="px-4 py-1.5 rounded-[8px] bg-orange-500/20 text-orange-400 text-sm font-medium flex items-center gap-1.5 hover:opacity-80 transition-opacity disabled:opacity-50"
                >
                  {loadingAction === 'end'
                    ? <Icon icon="eos-icons:loading" width={16} />
                    : <Icon icon="mdi:stop" width={16} />}
                  End Event
                </button>
              </Popconfirm>

              <Popconfirm
                title="Cancel this event?"
                description="No airdrop will be distributed."
                onConfirm={() => runAction('cancel', () => cancelEvent(event._id).then(() => {}), 'Event cancelled')}
                okText="Cancel Event"
                okButtonProps={{ danger: true }}
              >
                <button
                  disabled={loadingAction === 'cancel'}
                  className="px-4 py-1.5 rounded-[8px] bg-red-500/20 text-red-400 text-sm font-medium flex items-center gap-1.5 hover:opacity-80 transition-opacity disabled:opacity-50"
                >
                  {loadingAction === 'cancel'
                    ? <Icon icon="eos-icons:loading" width={16} />
                    : <Icon icon="mdi:cancel" width={16} />}
                  Cancel
                </button>
              </Popconfirm>
            </>
          )}
        </div>
      </div>

      {/* Section 2: Challenge Management */}
      <div className="mb-6">
        <h4 className="text-text_clr text-sm font-apex uppercase mb-3">Challenges</h4>
        {event.challenges && event.challenges.length > 0 ? (
          <div className="space-y-2">
            {event.challenges.map(c => {
              const cfg = getChallengeConfig(c.type)
              return (
                <div
                  key={c._id}
                  className="flex items-center justify-between bg-[var(--bg-secondary)] rounded-[12px] px-4 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <Icon icon={cfg.icon} width={18} className="text-text_clr" />
                    <span className="text-[var(--text-heading)] text-sm font-medium">{c.name}</span>
                    <span className="text-text_clr text-xs">({c.type})</span>
                    {c.pointsMultiplier !== 1 && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[#DE0308]/20 text-[#DE0308] font-medium">
                        {c.pointsMultiplier}x
                      </span>
                    )}
                    {!c.enabled && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400 font-medium">
                        Disabled
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onEditChallenge(c)}
                      className="p-1.5 rounded hover:bg-[var(--bg-card)] text-text_clr hover:text-[var(--text-heading)] transition-colors"
                    >
                      <Icon icon="mdi:pencil" width={16} />
                    </button>
                    {isActive ? (
                      <Tooltip title="Cannot remove challenges from active events">
                        <button className="p-1.5 rounded text-gray-600 cursor-not-allowed" disabled>
                          <Icon icon="mdi:delete" width={16} />
                        </button>
                      </Tooltip>
                    ) : (
                      <Popconfirm
                        title="Remove this challenge?"
                        onConfirm={() => runAction(`rm-${c._id}`, () => removeChallenge(c._id), 'Challenge removed')}
                        okText="Remove"
                        okButtonProps={{ danger: true }}
                      >
                        <button className="p-1.5 rounded hover:bg-[var(--bg-card)] text-text_clr hover:text-red-400 transition-colors">
                          <Icon icon="mdi:delete" width={16} />
                        </button>
                      </Popconfirm>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-text_clr text-sm">No challenges added yet.</p>
        )}
        <button
          onClick={onAddChallenge}
          className="mt-3 text-sm text-[#DE0308] hover:underline flex items-center gap-1"
        >
          <Icon icon="mdi:plus" width={16} /> Add Challenge
        </button>
      </div>

      {/* Section 3: Operations */}
      <div className="mb-6">
        <h4 className="text-text_clr text-sm font-apex uppercase mb-3">Operations</h4>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => runAction('calc', () => triggerPointCalculation(event._id), 'Points calculated')}
            disabled={loadingAction === 'calc'}
            className="px-4 py-1.5 rounded-[8px] bg-[var(--bg-secondary)] text-[var(--text-heading)] text-sm font-medium flex items-center gap-1.5 hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            {loadingAction === 'calc'
              ? <Icon icon="eos-icons:loading" width={16} />
              : <Icon icon="mdi:calculator" width={16} />}
            Calculate Points
          </button>
          <span className="text-text_clr text-xs">Last updated: {lastUpdate}</span>
        </div>

        {isEnded && (
          <div className="mt-3">
            <Popconfirm
              title="Trigger airdrop distribution?"
              description="FRY tokens will be sent to qualifying participants."
              onConfirm={() => runAction('airdrop', () => triggerAirdrop(event._id), 'Airdrop triggered')}
              okText="Distribute"
              okButtonProps={{ danger: true }}
            >
              <button
                disabled={loadingAction === 'airdrop'}
                className="px-4 py-1.5 rounded-[8px] bg-[#DE0308]/20 text-[#DE0308] text-sm font-medium flex items-center gap-1.5 hover:opacity-80 transition-opacity disabled:opacity-50"
              >
                {loadingAction === 'airdrop'
                  ? <Icon icon="eos-icons:loading" width={16} />
                  : <Icon icon="mdi:parachute" width={16} />}
                Trigger Airdrop
              </button>
            </Popconfirm>
          </div>
        )}
      </div>

      {/* Section 4: Danger Zone */}
      {canDelete && (
        <details className="bg-red-500/5 rounded-[12px] p-4">
          <summary className="text-red-400 text-sm font-apex uppercase cursor-pointer">
            Danger Zone
          </summary>
          <div className="mt-3">
            <Popconfirm
              title="Delete this event permanently?"
              description="This cannot be undone. All challenges and point data will be removed."
              onConfirm={() => runAction('delete', () => deleteEvent(event._id), 'Event deleted')}
              okText="Delete"
              okButtonProps={{ danger: true }}
            >
              <button
                disabled={loadingAction === 'delete'}
                className="px-4 py-1.5 rounded-[8px] bg-red-500/20 text-red-400 text-sm font-medium flex items-center gap-1.5 hover:opacity-80 transition-opacity disabled:opacity-50"
              >
                {loadingAction === 'delete'
                  ? <Icon icon="eos-icons:loading" width={16} />
                  : <Icon icon="mdi:delete-forever" width={16} />}
                Delete Event
              </button>
            </Popconfirm>
          </div>
        </details>
      )}
    </div>
  )
}

export default EventAdminPanel
