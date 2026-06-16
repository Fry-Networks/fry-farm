import { useState } from 'react'
import { Icon } from '@iconify/react'

const BetaBanner: React.FC = () => {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  return (
    <div className="w-full bg-[var(--bg-secondary)] py-2 px-4 flex items-center justify-center relative">
      <p className="text-text_clr text-xs text-center">
        Beta Release — This platform is in beta. If you encounter any bugs, please report them in our{' '}
        <a
          href="https://discord.com/invite/frynetworks"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#DE0308] hover:underline"
        >
          Discord
        </a>
        .
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-3 text-text_clr hover:text-[var(--text-heading)] transition-colors"
        aria-label="Dismiss"
      >
        <Icon icon="mdi:close" width={16} />
      </button>
    </div>
  )
}

export default BetaBanner
