import React, { useEffect, useState } from 'react'
import { useNavigate } from "react-router-dom"
import DappFilter from "../../shared/DappFilter"
import CreateTokenModal from "./CreateTokenModal"
import { Icon } from '@iconify/react'
import { Spin } from 'antd'
import { getLaunchesStats, getTokens } from '../../../services/launchesApi'
import type { LaunchesStats, LaunchedToken } from '../../../services/launchesApi'
import TokenImage from '../../shared/TokenImage'

const LaunchesPage: React.FC = () => {
  const [stats, setStats] = useState<LaunchesStats | null>(null)
  const [tokens, setTokens] = useState<LaunchedToken[]>([])
  const [totalTokens, setTotalTokens] = useState(0)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [dappFilter, setDappFilter] = useState<string | null>(null)
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [statsData, tokensData] = await Promise.all([
          getLaunchesStats().catch(() => null),
          getTokens(50).catch(() => ({ tokens: [], total: 0 })),
        ])
        if (statsData) setStats(statsData)
        setTokens(tokensData.tokens)
        setTotalTokens(tokensData.total)
      } catch (e) {
        console.error('Failed to fetch launches data:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const filteredTokens = dappFilter === 'haystack' || !dappFilter
    ? tokens
    : tokens.filter(t => true)

  return (
    <div className="w-full mt-[40px] mb-[47px] flex-1">
      <div className="max-xxxl:w-[95%] w-[80%] m-auto flex flex-col gap-[24px]">
        <div className="flex items-center gap-3">
          <Icon icon="mdi:rocket-launch-outline" width={32} className="text-secondary" />
          <h2 className="text-[var(--text-heading)] font-bold text-2xl">Token Launches</h2>
        </div>

        <div className="flex sm-s:flex-col justify-between gap-[10px] sm-s:gap-[20px] bg-[var(--bg-card)] rounded-[18px] py-[32px] px-[60px] max-sm:!px-[30px] shadow-[0px_4px_24.2px_0px_var(--shadow-color)]">
          <div className="flex flex-col items-center gap-[6px]">
            <p className="text-text_clr tracking-[0.54px] large">Tokens Launched</p>
            <h3 className="small text-[var(--text-heading)] font-medium tracking-[1.08px]">
              {loading ? '...' : stats?.totalTokens ?? 0}
            </h3>
          </div>
          <div className="flex flex-col items-center gap-[6px]">
            <p className="text-text_clr tracking-[0.54px] large">Bonding Curve</p>
            <h3 className="small text-[var(--text-heading)] font-medium tracking-[1.08px]">
              {loading ? '...' : `$${(stats?.bondingUsd ?? 0).toLocaleString()}`}
            </h3>
          </div>
          <div className="flex flex-col items-center gap-[6px]">
            <p className="text-text_clr tracking-[0.54px] large">Platform Fee</p>
            <h3 className="small text-[var(--text-heading)] font-medium tracking-[1.08px]">
              {loading ? '...' : `${((stats?.feeBpsPlatform ?? 0) / 100).toFixed(1)}%`}
            </h3>
          </div>
          <div className="flex flex-col items-center gap-[6px]">
            <p className="text-text_clr tracking-[0.54px] large">Creator Fee</p>
            <h3 className="small text-[var(--text-heading)] font-medium tracking-[1.08px]">
              {loading ? '...' : `${((stats?.feeBpsCreator ?? 0) / 100).toFixed(1)}%`}
            </h3>
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex-1">
            <DappFilter onFilterChange={setDappFilter} />
          </div>
          <a
            href="https://haystack.network"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-4 py-2 rounded-lg bg-secondary text-white font-medium hover:opacity-90 transition-opacity text-sm"
          >
            Create Token
            <Icon icon="mdi:open-in-new" width={14} />
          </a>
        </div>

        <p className="text-[var(--text-secondary)] text-sm">
          Showing {filteredTokens.length} of {totalTokens} tokens
        </p>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Spin size="large" />
          </div>
        ) : filteredTokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 bg-[var(--bg-card)] rounded-lg shadow-sm">
            <Icon icon="mdi:rocket-launch-outline" className="w-16 h-16 text-gray-400 mb-4" />
            <h3 className="text-xl font-semibold text-[var(--text-heading)] mb-2">No Tokens Found</h3>
            <p className="text-gray-500 text-center">Be the first to launch a token through Haystack!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredTokens.map((token) => (
              <div
                key={token.asaId}
                onClick={() => navigate(`/launches/token/${token.asaId}`)}
                className="bg-[var(--bg-card)] rounded-[16px] p-5 shadow-[0px_4px_24.2px_0px_var(--shadow-color)] hover:shadow-lg transition-shadow cursor-pointer hover:scale-105 transition-transform"
              >
                <div className="flex items-center gap-3 mb-3">
                  <TokenImage tokenId={token.asaId} src={token.imageUrl || ''} symbol={token.unitName} size={40} className="" />
                  <div className="min-w-0">
                    <h4 className="text-[var(--text-heading)] font-bold text-sm truncate">{token.name}</h4>
                    <p className="text-text_clr text-xs">{token.unitName}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
                  <div className="flex justify-between">
                    <span>ASA ID</span>
                    <span className="font-mono">{token.asaId.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Supply</span>
                    <span>{token.decimals > 0 ? (token.total / Math.pow(10, token.decimals)).toLocaleString() : token.total.toLocaleString()}</span>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <a
                    href={`https://allo.info/asset/${token.asaId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 text-center text-xs py-1.5 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:opacity-80"
                  >
                    Explorer
                  </a>
                  <a
                    href={`https://app.tinyman.org/#/swap?asset_in=0&asset_out=${token.asaId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 text-center text-xs py-1.5 rounded-lg bg-secondary text-white hover:opacity-80"
                  >
                    Trade
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default LaunchesPage
