import { Icon } from '@iconify/react'
import type { EventChallenge } from '../../../services/eventService'
import { getChallengeConfig } from '../../../utils/challengeUtils'

interface ChallengeListProps {
  challenges: EventChallenge[]
}

const ChallengeList: React.FC<ChallengeListProps> = ({ challenges }) => {
  const enabled = challenges.filter(c => c.enabled)

  if (!enabled.length) {
    return <p className="text-text_clr text-sm">No challenges configured for this event.</p>
  }

  return (
    <div className="mb-6">
      <h4 className="text-[var(--text-heading)] font-apex font-bold uppercase mb-4">Challenges</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {enabled.map(challenge => {
          const config = getChallengeConfig(challenge.type)
          return (
            <div
              key={challenge._id}
              className="flex items-start gap-3 bg-[var(--bg-secondary)] rounded-[12px] p-4"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#DE0308]/10 flex items-center justify-center">
                <Icon icon={config.icon} width={20} color="#DE0308" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[var(--text-heading)] font-medium text-sm">{challenge.name}</p>
                  {challenge.pointsMultiplier > 1 && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[#DE0308]/10 text-darkRed font-medium">
                      {challenge.pointsMultiplier}x
                    </span>
                  )}
                </div>
                <p className="text-text_clr text-xs mt-0.5">
                  {challenge.description || config.description}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ChallengeList
