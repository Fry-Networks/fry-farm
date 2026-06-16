import { useEffect, useState } from 'react'
import { useWallet } from '@txnlab/use-wallet'
import { getPositionsByWallet } from '../../../../services/alphaArcadeApi'
import type { AlphaArcadePosition } from '../../../../types/alphaArcade'

const PPredictbanner = () => {
  const { activeAddress } = useWallet()
  const [stats, setStats] = useState({ tvl: 0, activePositions: 0, feesPaid: 0 })

  useEffect(() => {
    if (activeAddress) fetchStats()
  }, [activeAddress])

  const fetchStats = async () => {
    try {
      const positions: AlphaArcadePosition[] = await getPositionsByWallet(activeAddress!)
      const active = positions.filter((p) => p.status === 'active' || p.status === 'pending_withdrawal')
      const tvl = active.reduce((sum, p) => sum + (p.usdcDeposited || 0), 0) / 1_000_000
      const fees = positions.reduce((sum, p) => {
        const dep = (p as any).feesPaid?.depositFee || 0
        const wth = (p as any).feesPaid?.withdrawFee || 0
        return sum + dep + wth
      }, 0) / 1_000_000
      setStats({ tvl, activePositions: active.length, feesPaid: fees })
    } catch (error) {
      console.error('Error fetching predict stats:', error)
    }
  }

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="m-auto flex max-sm:flex-col w-full justify-between gap-[10px] bg-[var(--bg-card)] rounded-[18px] py-[32px] max-sm:gap-[30px] px-[40px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
      <div className="flex flex-col items-center gap-[24px] max-sm:gap-[6px]">
        <p className="text-[var(--text-secondary)] tracking-[0.54px] large">Prediction TVL</p>
        <h3 className="small text-[var(--text-primary)] font-medium tracking-[1.08px]">
          ${fmt(stats.tvl)}
        </h3>
      </div>
      <div className="flex flex-col items-center gap-[24px] max-sm:gap-[6px]">
        <p className="text-[var(--text-secondary)] tracking-[0.54px] large">Active Positions</p>
        <h3 className="small text-[var(--text-primary)] font-medium tracking-[1.08px]">
          {stats.activePositions}
        </h3>
      </div>
      <div className="flex flex-col items-center gap-[24px] max-sm:gap-[6px]">
        <p className="text-[var(--text-secondary)] tracking-[0.54px] large">Fees Paid</p>
        <h3 className="small text-[var(--text-primary)] font-medium tracking-[1.08px]">
          ${fmt(stats.feesPaid)}
        </h3>
      </div>
    </div>
  )
}

export default PPredictbanner
