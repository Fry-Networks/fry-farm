import { Table } from 'antd'
import { useEffect, useState } from 'react'
import { fetchLeaderboard } from '../../../services/eventService'
import type { LeaderboardEntry } from '../../../services/eventService'

interface LeaderboardProps {
  eventId: string
  activeWallet?: string
}

const PAGE_SIZE = 50

function truncateWallet(wallet: string) {
  return wallet.slice(0, 4) + '...' + wallet.slice(-4)
}

const Leaderboard: React.FC<LeaderboardProps> = ({ eventId, activeWallet }) => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setEntries([])
    fetchLeaderboard(eventId, PAGE_SIZE, 0)
      .then(result => {
        setEntries(result.entries)
        setTotal(result.total)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [eventId])

  const loadMore = async () => {
    setLoading(true)
    try {
      const result = await fetchLeaderboard(eventId, PAGE_SIZE, entries.length)
      setEntries(prev => [...prev, ...result.entries])
      setTotal(result.total)
    } catch {
      // ignore
    }
    setLoading(false)
  }

  const columns = [
    {
      title: 'Rank',
      dataIndex: 'rank',
      key: 'rank',
      width: 80,
      render: (rank: number) => (
        <span className={`font-bold ${rank <= 3 ? 'text-darkRed' : 'text-[var(--text-heading)]'}`}>
          {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : `#${rank}`}
        </span>
      ),
    },
    {
      title: 'Wallet',
      dataIndex: 'wallet',
      key: 'wallet',
      render: (wallet: string) => (
        <span className={`font-mono text-sm ${wallet === activeWallet ? 'text-darkRed font-bold' : 'text-[var(--text-heading)]'}`}>
          {truncateWallet(wallet)}
          {wallet === activeWallet && <span className="ml-1 text-xs">(you)</span>}
        </span>
      ),
    },
    {
      title: 'Points',
      dataIndex: 'totalPoints',
      key: 'totalPoints',
      align: 'right' as const,
      render: (points: number) => (
        <span className="text-[var(--text-heading)] font-medium">
          {points >= 1 ? points.toLocaleString(undefined, { maximumFractionDigits: 2 }) : points.toFixed(4)}
        </span>
      ),
    },
  ]

  return (
    <div className="mb-6">
      <h4 className="text-[var(--text-heading)] font-apex font-bold uppercase mb-4">Leaderboard</h4>

      {!loading && entries.length === 0 ? (
        <div className="bg-[var(--bg-secondary)] rounded-[12px] p-8 text-center">
          <p className="text-text_clr">No participants yet. Start staking, farming, or trading to earn points!</p>
        </div>
      ) : (
        <>
          <Table
            dataSource={entries}
            columns={columns}
            rowKey="_id"
            pagination={false}
            loading={loading && entries.length === 0}
            size="small"
            rowClassName={(record) =>
              record.wallet === activeWallet ? '!bg-[rgba(222,3,8,0.08)]' : ''
            }
          />
          {entries.length < total && (
            <div className="flex justify-center mt-4">
              <button
                onClick={loadMore}
                disabled={loading}
                className="px-6 py-2 rounded-[8px] border-solid border-2 border-[#DE0308] text-darkRed font-medium hover:bg-[#DE0308]/10 transition-colors disabled:opacity-50"
              >
                {loading ? 'Loading...' : `Load more (${entries.length}/${total})`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default Leaderboard
