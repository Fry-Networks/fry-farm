import React from 'react'
import { Icon } from '@iconify/react'

const TINYMAN_BUY_URL = 'https://app.tinyman.org/swap?asset_in=31566704&asset_out=2485314946'

const FryFeeBanner: React.FC = () => {
  return (
    <div className="flex items-center flex-wrap gap-2 px-4 py-2 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-secondary)] text-[13px] mb-3">
      <Icon icon="mdi:information-outline" width={16} className="shrink-0" />
      <span>All platform fees are paid in FRY.</span>
      <span
        className="text-green cursor-pointer hover:underline"
        onClick={() => window.dispatchEvent(new Event('openDailyRewards'))}
      >
        Claim free FRY daily
      </span>
      <span>|</span>
      <a
        href={TINYMAN_BUY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-green hover:underline"
      >
        Buy FRY on Tinyman
      </a>
    </div>
  )
}

export default FryFeeBanner
