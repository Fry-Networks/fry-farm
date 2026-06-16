import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { Spin, message } from 'antd'
import { getTokens } from '../../../services/launchesApi'
import type { LaunchedToken } from '../../../services/launchesApi'
import TokenImage from '../../shared/TokenImage'

const TokenDetail: React.FC = () => {
  const { asaId } = useParams<{ asaId: string }>()
  const navigate = useNavigate()
  const [token, setToken] = useState<LaunchedToken | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!asaId) {
      setNotFound(true)
      setLoading(false)
      return
    }

    const fetchToken = async () => {
      setLoading(true)
      try {
        const { tokens } = await getTokens(1000)
        const found = tokens.find(t => t.asaId === parseInt(asaId, 10))
        if (found) {
          setToken(found)
          setNotFound(false)
        } else {
          setNotFound(true)
        }
      } catch (e) {
        console.error('Failed to fetch token:', e)
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }

    fetchToken()
  }, [asaId])

  if (loading) {
    return (
      <div className="w-full mt-[40px] mb-[47px] flex-1">
        <div className="max-xxxl:w-[95%] w-[80%] m-auto flex justify-center items-center py-20">
          <Spin size="large" />
        </div>
      </div>
    )
  }

  if (notFound || !token) {
    return (
      <div className="w-full mt-[40px] mb-[47px] flex-1">
        <div className="max-xxxl:w-[95%] w-[80%] m-auto flex flex-col items-center justify-center p-8">
          <Icon icon="mdi:alert-circle" className="w-16 h-16 text-gray-400 mb-4" />
          <h3 className="text-xl font-semibold text-[var(--text-heading)] mb-2">Token Not Found</h3>
          <p className="text-gray-500 text-center mb-6">Could not find token ASA {asaId}</p>
          <button
            onClick={() => navigate('/launches')}
            className="px-6 py-2 rounded-lg bg-secondary text-white font-medium hover:opacity-90"
          >
            Back to Launches
          </button>
        </div>
      </div>
    )
  }

  const displaySupply = token.decimals > 0 
    ? (token.total / Math.pow(10, token.decimals)).toLocaleString()
    : token.total.toLocaleString()

  const truncateAddress = (addr: string) => {
    return addr.slice(0, 8) + '...' + addr.slice(-8)
  }

  return (
    <div className="w-full mt-[40px] mb-[47px] flex-1">
      <div className="max-xxxl:w-[95%] w-[80%] m-auto flex flex-col gap-[24px]">
        <button
          onClick={() => navigate('/launches')}
          className="flex items-center gap-2 text-secondary hover:opacity-80 transition-opacity w-fit"
        >
          <Icon icon="mdi:chevron-left" width={20} />
          <span className="text-sm font-medium">Back to Launches</span>
        </button>

        <div className="bg-[var(--bg-card)] rounded-[16px] p-8 shadow-[0px_4px_24.2px_0px_var(--shadow-color)]">
          <div className="flex items-start gap-6">
            <div>
              <TokenImage tokenId={token.asaId} src={token.imageUrl || ''} symbol={token.unitName} size={80} className="" />
            </div>

            <div className="flex-1">
              <div className="flex items-baseline gap-3 mb-4">
                <h1 className="text-[var(--text-heading)] font-bold text-4xl">{token.name}</h1>
                <p className="text-[var(--text-secondary)] text-lg">{token.unitName}</p>
              </div>

              <div className="grid grid-cols-2 gap-6 mt-6">
                <div>
                  <p className="text-[var(--text-secondary)] text-sm mb-1">ASA ID</p>
                  <p className="text-[var(--text-primary)] font-mono font-semibold">{token.asaId.toLocaleString()}</p>
                </div>

                <div>
                  <p className="text-[var(--text-secondary)] text-sm mb-1">Decimals</p>
                  <p className="text-[var(--text-primary)] font-semibold">{token.decimals}</p>
                </div>

                <div>
                  <p className="text-[var(--text-secondary)] text-sm mb-1">Total Supply</p>
                  <p className="text-[var(--text-primary)] font-semibold">{displaySupply}</p>
                </div>

                <div>
                  <p className="text-[var(--text-secondary)] text-sm mb-1">Creator</p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(token.creator)
                      message.success('Address copied!')
                    }}
                    className="flex items-center gap-2 text-secondary hover:opacity-80 transition-opacity font-mono text-sm"
                  >
                    {truncateAddress(token.creator)}
                    <Icon icon="mdi:content-copy" width={14} />
                  </button>
                </div>
              </div>

              {token.url && (
                <div className="mt-6">
                  <p className="text-[var(--text-secondary)] text-sm mb-2">Token URL</p>
                  <a
                    href={token.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-secondary hover:opacity-80 transition-opacity text-sm flex items-center gap-1 break-all"
                  >
                    {token.url}
                    <Icon icon="mdi:open-in-new" width={14} />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-4 flex-wrap">
          <a
            href={`https://allo.info/asset/${token.asaId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--bg-secondary)] text-[var(--text-primary)] font-medium hover:opacity-80 transition-opacity"
          >
            <Icon icon="mdi:magnify" width={18} />
            View on allo.info
          </a>
          <a
            href={`https://app.tinyman.org/#/swap?asset_in=0&asset_out=${token.asaId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-secondary text-white font-medium hover:opacity-90 transition-opacity"
          >
            <Icon icon="mdi:swap-horizontal" width={18} />
            Trade on Tinyman
          </a>
        </div>
      </div>
    </div>
  )
}

export default TokenDetail
