import { useEffect, useState } from 'react'
import { Spin } from 'antd'
import { NavLink } from 'react-router-dom'
import { fetchNftMetadata, type NftMetadata } from '../../../../genesis_mint_func'
import { useMultiChainWallet } from '../../../../hooks/useMultiChainWallet'

interface GenesisNftGridProps {
  tokenIds: number[]
  isLoading: boolean
}

const GenesisNftGrid: React.FC<GenesisNftGridProps> = ({ tokenIds, isLoading }) => {
  const { activeAddress } = useMultiChainWallet()
  const [metaMap, setMetaMap] = useState<Record<number, NftMetadata>>({})

  // Fetch metadata for each owned token
  useEffect(() => {
    if (tokenIds.length === 0) return
    setMetaMap({})
    tokenIds.forEach((id) => {
      fetchNftMetadata(id)
        .then((meta) => setMetaMap((prev) => ({ ...prev, [id]: meta })))
        .catch(() => {})
    })
  }, [tokenIds])

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spin size="large" />
      </div>
    )
  }

  if (!activeAddress) {
    return (
      <div
        className="rounded-xl p-8 text-center"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
      >
        <p className="text-lg mb-2" style={{ color: 'var(--text-primary)' }}>
          Connect your wallet to view your Genesis NFTs
        </p>
      </div>
    )
  }

  if (tokenIds.length === 0) {
    return (
      <div
        className="rounded-xl p-8 text-center"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
      >
        <p className="text-lg mb-2" style={{ color: 'var(--text-primary)' }}>
          You don't own any Genesis NFTs yet
        </p>
        <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
          Mint a unique cyberpunk french fry and earn 10% of all fry.farm platform fees.
        </p>
        <NavLink
          to="/genesis-mint"
          className="inline-block px-6 py-2.5 rounded-lg font-medium transition-colors btn-primary"
        >
          Mint Genesis NFT
        </NavLink>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {tokenIds.map((id) => {
        const meta = metaMap[id]
        return (
          <div
            key={id}
            className="rounded-xl overflow-hidden transition-transform hover:scale-[1.02]"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
          >
            <img
              src={`https://fry.farm/genesis/images/${id}.png`}
              alt={meta?.name ?? `Genesis #${id}`}
              className="w-full aspect-square object-cover"
              loading="lazy"
            />
            <div className="p-3">
              <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                {meta?.name ?? `fry.farm Genesis #${id}`}
              </p>
              {meta?.attributes && meta.attributes.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {meta.attributes
                    .filter((a) => a.trait_type === 'Rarity')
                    .map((attr, i) => (
                      <span
                        key={i}
                        className="text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                      >
                        {attr.value}
                      </span>
                    ))}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default GenesisNftGrid
