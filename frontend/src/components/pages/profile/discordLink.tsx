import { Icon } from '@iconify/react'
import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { authAxios } from '../../../services/apiClient'
import { useAuth } from '../../../hooks/useAuth'

const DISCORD_ERROR_MESSAGES: Record<string, string> = {
  already_linked: 'This Discord account is already linked to another wallet.',
  invalid_state: 'Link expired. Please try again.',
  token_exchange: 'Discord authorization failed. Please try again.',
  user_fetch: 'Could not fetch Discord profile. Please try again.',
  missing_params: 'Invalid callback. Please try again.',
  no_profile: 'Please set up your profile first, then try linking Discord again.',
  server_error: 'Something went wrong. Please try again.',
}

interface DiscordLinkProps {
  userData: any
  onUpdate: () => void
  walletId: string | undefined
}

const DiscordLink: React.FC<DiscordLinkProps> = ({ userData, onUpdate, walletId }) => {
  const { ensureAuth } = useAuth()
  const [loading, setLoading] = useState(false)
  const [pendingPopup, setPendingPopup] = useState<Window | null>(null)

  useEffect(() => {
    if (!pendingPopup) return
    const controller = new AbortController()

    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== 'discord-oauth-result') return

      if (event.data.status === 'linked') {
        toast.success('Discord account linked successfully!')
        onUpdate()
      } else if (event.data.status === 'error') {
        toast.error(DISCORD_ERROR_MESSAGES[event.data.reason] || 'Failed to link Discord. Please try again.')
      }

      setPendingPopup(null)
      setLoading(false)
    }, { signal: controller.signal })

    return () => controller.abort()
  }, [pendingPopup, onUpdate])

  const handleLink = async () => {
    if (!walletId) {
      toast.error('Please connect your wallet first')
      return
    }
    setLoading(true)
    // Open popup synchronously to preserve user gesture (async gaps block popups)
    const popup = window.open('about:blank', 'discord-oauth', 'width=500,height=700')
    if (!popup) {
      toast.error('Please allow popups for this site')
      setLoading(false)
      return
    }
    try {
      await ensureAuth()
      const res = await authAxios.get('/discord/link')
      if (res.data.success && res.data.url) {
        popup.location.href = res.data.url
        setPendingPopup(popup)
      } else {
        popup.close()
        toast.error('Failed to generate Discord link')
        setLoading(false)
      }
    } catch (err: any) {
      popup.close()
      if (err.response?.status === 429) {
        toast.error('Too many requests. Please wait a moment and try again.')
      } else {
        toast.error(err.response?.data?.message || 'Failed to link Discord')
      }
      setLoading(false)
    }
  }

  const handleUnlink = async () => {
    try {
      setLoading(true)
      await ensureAuth()
      await authAxios.post('/discord/unlink', null, { timeout: 15000 })
      toast.success('Discord account unlinked')
      onUpdate()
    } catch (err: any) {
      if (err.response?.status === 429) {
        toast.error('Too many requests. Please wait a moment and try again.')
      } else {
        toast.error(err.response?.data?.message || 'Failed to unlink Discord')
      }
    } finally {
      setLoading(false)
    }
  }

  if (userData?.discordUsername) {
    return (
      <div className="flex items-center gap-3 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[15px] py-[10px] px-[16px]">
        {userData.discordAvatar ? (
          <img
            src={userData.discordAvatar}
            alt="Discord"
            className="w-[24px] h-[24px] rounded-full"
          />
        ) : (
          <Icon icon="ic:baseline-discord" width={24} height={24} color="#5865F2" />
        )}
        <p className="text-[var(--text-primary)] text-sm">{userData.discordUsername}</p>
        <button
          onClick={handleUnlink}
          disabled={loading}
          className="text-xs text-[#999] hover:text-[#DE0308] cursor-pointer ml-auto transition-colors"
        >
          {loading ? '...' : 'Unlink'}
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={handleLink}
      disabled={loading || !walletId}
      className="flex items-center gap-2 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-[15px] py-[10px] px-[16px] cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Icon icon="ic:baseline-discord" width={20} height={20} />
      <span className="text-sm font-medium">{loading ? 'Linking...' : 'Link Discord'}</span>
    </button>
  )
}

export default DiscordLink
