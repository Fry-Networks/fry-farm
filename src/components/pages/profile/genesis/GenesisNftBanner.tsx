interface GenesisNftBannerProps {
  ownedCount: number
  totalMinted: number
  maxSupply: number
  isLoading: boolean
}

const GenesisNftBanner: React.FC<GenesisNftBannerProps> = ({ ownedCount, totalMinted, maxSupply, isLoading }) => {
  const share = maxSupply > 0 ? ((ownedCount / maxSupply) * 100).toFixed(1) : '0'

  return (
    <div className="m-auto flex max-sm:flex-col w-full justify-between gap-[10px] bg-[var(--bg-card)] rounded-[18px] py-[32px] max-sm:gap-[30px] px-[40px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
      <div className="flex flex-col items-center gap-[24px] max-sm:gap-[6px]">
        <p className="text-[var(--text-secondary)] tracking-[0.54px] large">You Own</p>
        <h3 className="small text-[var(--text-primary)] font-medium tracking-[1.08px]">
          {isLoading ? '...' : ownedCount}
        </h3>
      </div>
      <div className="flex flex-col items-center gap-[24px] max-sm:gap-[6px]">
        <p className="text-[var(--text-secondary)] tracking-[0.54px] large">Total Minted</p>
        <h3 className="small text-[var(--text-primary)] font-medium tracking-[1.08px]">
          {isLoading ? '...' : `${totalMinted} / ${maxSupply}`}
        </h3>
      </div>
      <div className="flex flex-col items-center gap-[24px] max-sm:gap-[6px]">
        <p className="text-[var(--text-secondary)] tracking-[0.54px] large">Your Share</p>
        <h3 className="small text-[var(--text-primary)] font-medium tracking-[1.08px]">
          {isLoading ? '...' : `${share}%`}
        </h3>
      </div>
    </div>
  )
}

export default GenesisNftBanner
