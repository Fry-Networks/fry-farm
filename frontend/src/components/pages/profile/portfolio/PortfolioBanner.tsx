import type { PortfolioToken } from './PortfolioTable'

interface PortfolioBannerProps {
  tokens: PortfolioToken[]
  isLoading: boolean
}

const PortfolioBanner: React.FC<PortfolioBannerProps> = ({ tokens, isLoading }) => {
  const totalValue = tokens.reduce((sum, t) => sum + (t.value ?? 0), 0)
  const tokenCount = tokens.length
  const pricedCount = tokens.filter((t) => t.price != null && t.price > 0).length

  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })

  return (
    <div className="m-auto flex max-sm:flex-col w-full justify-between gap-[10px] bg-[var(--bg-card)] rounded-[18px] py-[32px] max-sm:gap-[30px] px-[40px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
      <div className="flex flex-col items-center gap-[24px] max-sm:gap-[6px]">
        <p className="text-[var(--text-secondary)] tracking-[0.54px] large">Total Value</p>
        <h3 className="small text-[var(--text-primary)] font-medium tracking-[1.08px]">
          {isLoading ? '...' : `$${fmt(totalValue)}`}
        </h3>
      </div>
      <div className="flex flex-col items-center gap-[24px] max-sm:gap-[6px]">
        <p className="text-[var(--text-secondary)] tracking-[0.54px] large">Tokens Held</p>
        <h3 className="small text-[var(--text-primary)] font-medium tracking-[1.08px]">
          {isLoading ? '...' : tokenCount}
        </h3>
      </div>
      <div className="flex flex-col items-center gap-[24px] max-sm:gap-[6px]">
        <p className="text-[var(--text-secondary)] tracking-[0.54px] large">Priced Tokens</p>
        <h3 className="small text-[var(--text-primary)] font-medium tracking-[1.08px]">
          {isLoading ? '...' : `${pricedCount} / ${tokenCount}`}
        </h3>
      </div>
    </div>
  )
}

export default PortfolioBanner
