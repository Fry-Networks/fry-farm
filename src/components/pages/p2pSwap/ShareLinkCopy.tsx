import { useState } from 'react'
import { Icon } from '@iconify/react'

interface ShareLinkCopyProps {
  chainId: string;
  marketAppId: number;
  offerId: number;
}

const ShareLinkCopy: React.FC<ShareLinkCopyProps> = ({ chainId, marketAppId, offerId }) => {
  const [copied, setCopied] = useState(false)

  const url = `${window.location.origin}/p2p?offer=${chainId}/${marketAppId}/${offerId}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
      const textarea = document.createElement('textarea')
      textarea.value = url
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
      title="Copy share link"
    >
      <Icon icon={copied ? 'mdi:check' : 'mdi:share-variant'} width={14} />
      {copied ? 'Copied!' : 'Share'}
    </button>
  )
}

export default ShareLinkCopy
