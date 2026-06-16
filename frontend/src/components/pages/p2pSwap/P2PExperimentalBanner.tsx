import { useState } from 'react'
import { Icon } from '@iconify/react'

const P2PExperimentalBanner: React.FC = () => {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  return (
    <div className="flex items-start gap-3 p-4 mb-4 rounded-lg border border-[#d4a017] bg-[#d4a01715] text-[var(--text-primary)]">
      <Icon icon="mdi:alert" width={24} className="text-[#d4a017] flex-shrink-0 mt-0.5" />
      <div className="flex-1 text-sm">
        <span className="font-bold">Experimental Feature</span> — P2P trading is in early beta.
        Smart contracts are immutable and audited, but this feature is new.
        Use at your own risk. Start with small amounts.
      </div>
      <button
        aria-label="Dismiss warning" onClick={() => setDismissed(true)}
        className="flex-shrink-0 p-1 rounded hover:bg-[var(--bg-secondary)] transition-colors"
      >
        <Icon icon="mdi:close" width={18} className="text-[var(--text-secondary)]" />
      </button>
    </div>
  )
}

export default P2PExperimentalBanner
