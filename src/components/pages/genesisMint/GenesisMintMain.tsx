import { useEffect, useState, useCallback } from 'react'
import { NavLink } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { Spin } from 'antd'
import { toast } from 'react-toastify'
import { useMultiChainWallet } from '../../../hooks/useMultiChainWallet'
import { useChain } from '../../../context/ChainContext'
import {
  getGenesisNftState,
  getUserUsdcBalance,
  mintGenesisNft,
  fetchNftMetadata,
  type GenesisNftState,
  type NftMetadata,
} from '../../../genesis_mint_func'

type MintStatus = 'idle' | 'signing' | 'confirming' | 'success' | 'error'

const USDC_DECIMALS = 6
const EXPLORER_BASE = 'https://explorer.perawallet.app'

function formatUsdc(microAmount: number): string {
  return (microAmount / 10 ** USDC_DECIMALS).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const GenesisMintMain = () => {
  const { activeAddress, signer } = useMultiChainWallet()
  const { chainId, switchChain } = useChain()
  const isAlgorand = chainId === 'algorand-mainnet'

  // Contract state
  const [loading, setLoading] = useState(true)
  const [contractState, setContractState] = useState<GenesisNftState | null>(null)
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null)

  // Mint flow
  const [mintStatus, setMintStatus] = useState<MintStatus>('idle')
  const [mintedTokenId, setMintedTokenId] = useState<number | null>(null)
  const [mintedMeta, setMintedMeta] = useState<NftMetadata | null>(null)
  const [txId, setTxId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Fetch contract state
  const refreshState = useCallback(async () => {
    try {
      const state = await getGenesisNftState()
      setContractState(state)
    } catch (err) {
      console.error('Failed to fetch Genesis NFT state:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshState()
  }, [refreshState])

  // Fetch USDC balance when wallet connects
  useEffect(() => {
    if (!activeAddress) {
      setUsdcBalance(null)
      return
    }
    getUserUsdcBalance(activeAddress)
      .then(setUsdcBalance)
      .catch(() => setUsdcBalance(0))
  }, [activeAddress])

  // Mint handler
  const handleMint = async () => {
    if (!activeAddress || !signer || !contractState) return

    setMintStatus('signing')
    setErrorMessage(null)

    try {
      setMintStatus('confirming')
      const result = await mintGenesisNft(signer, activeAddress)
      setMintedTokenId(result.tokenId)
      setTxId(result.txId)
      setMintStatus('success')
      toast.success(`Genesis NFT #${result.tokenId} minted!`)

      // Refresh state + balance
      refreshState()
      getUserUsdcBalance(activeAddress).then(setUsdcBalance).catch(() => {})

      // Fetch metadata for the minted NFT
      fetchNftMetadata(result.tokenId).then(setMintedMeta).catch(() => {})
    } catch (err: any) {
      setMintStatus('error')
      const msg = err?.message || 'Mint failed'
      setErrorMessage(msg)
      toast.error(msg)
    }
  }

  const handleConnectWallet = () => {
    window.dispatchEvent(new Event('openConnectWallet'))
  }

  const resetMint = () => {
    setMintStatus('idle')
    setMintedTokenId(null)
    setMintedMeta(null)
    setTxId(null)
    setErrorMessage(null)
  }

  // Derived state
  const isSoldOut = contractState ? contractState.totalMinted >= contractState.maxSupply : false
  const isPaused = contractState?.paused ?? false
  const mintPrice = contractState?.mintPrice ?? 175_000_000
  const hasEnoughUsdc = usdcBalance !== null && usdcBalance >= mintPrice
  const progress = contractState ? (contractState.totalMinted / contractState.maxSupply) * 100 : 0
  const isMinting = mintStatus === 'signing' || mintStatus === 'confirming'

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spin size="large" />
      </div>
    )
  }

  // ── Success view ───────────────────────────────────────────────────────────
  if (mintStatus === 'success' && mintedTokenId) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div
          className="max-w-lg w-full rounded-2xl p-8 text-center"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
        >
          <div className="text-5xl mb-4">
            <Icon icon="mdi:check-circle" className="text-green inline-block" width={56} />
          </div>
          <h2 className="text-2xl font-bold font-apex mb-2" style={{ color: 'var(--text-heading)' }}>
            Genesis NFT #{mintedTokenId}
          </h2>
          <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
            Welcome to the fry.farm Genesis collection.
          </p>

          {mintedMeta ? (
            <div className="mb-6">
              <img
                src={mintedMeta.image}
                alt={mintedMeta.name}
                className="w-64 h-64 mx-auto rounded-xl object-cover shadow-lg"
              />
              <p className="mt-3 font-semibold" style={{ color: 'var(--text-primary)' }}>
                {mintedMeta.name}
              </p>
              {mintedMeta.attributes.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2 mt-3">
                  {mintedMeta.attributes.map((attr, i) => (
                    <span
                      key={i}
                      className="text-xs px-2 py-1 rounded-full"
                      style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                    >
                      {attr.trait_type}: {attr.value}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="mb-6">
              <Spin />
            </div>
          )}

          {txId && (
            <a
              href={`${EXPLORER_BASE}/tx/${txId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm mb-4 hover:underline"
              style={{ color: 'var(--text-secondary)' }}
            >
              View transaction
              <Icon icon="mdi:open-in-new" width={14} />
            </a>
          )}

          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              onClick={resetMint}
              className="px-6 py-2.5 rounded-lg font-medium transition-colors btn-primary"
            >
              Mint Another
            </button>
            <NavLink
              to="/profile?tab=genesis"
              className="px-6 py-2.5 rounded-lg font-medium transition-colors border-2 border-[#DE0308] text-[#DE0308] hover:bg-[#DE0308] hover:text-white"
            >
              View in Profile
            </NavLink>
          </div>
        </div>
      </div>
    )
  }

  // ── Main mint view ─────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
      {!isAlgorand && (
        <div
          className="max-w-4xl w-full mb-4 p-4 rounded-xl text-center text-sm"
          style={{ backgroundColor: 'rgba(222, 3, 8, 0.1)', border: '1px solid rgba(222, 3, 8, 0.3)', color: 'var(--text-primary)' }}
        >
          <p className="font-semibold mb-1">Genesis NFTs are Algorand assets</p>
          <p style={{ color: 'var(--text-secondary)' }}>
            Switch to Algorand and connect a wallet (Pera, Defly, or Lute) to mint.
          </p>
        </div>
      )}
      <div className="max-w-4xl w-full flex flex-col md:flex-row gap-8 items-center">
        {/* Preview image */}
        <div className="flex-shrink-0">
          <img
            src="https://fry.farm/genesis/images/1.png"
            alt="Genesis NFT Preview"
            className="w-72 h-72 rounded-2xl object-cover shadow-xl"
          />
        </div>

        {/* Mint card */}
        <div
          className="flex-1 w-full max-w-md rounded-2xl p-8"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
        >
          <h1 className="text-3xl font-bold font-apex mb-1" style={{ color: 'var(--text-heading)' }}>
            Genesis NFT
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            1,000 unique cyberpunk french fry characters. Holders receive 10% of all fry.farm platform fees distributed monthly in FRY.
          </p>

          {/* Progress */}
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-1.5">
              <span style={{ color: 'var(--text-secondary)' }}>Minted</span>
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {contractState?.totalMinted ?? 0} / {contractState?.maxSupply ?? 1000}
              </span>
            </div>
            <div
              className="w-full h-3 rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, backgroundColor: '#DE0308' }}
              />
            </div>
          </div>

          {/* Price + balance */}
          <div
            className="flex justify-between items-center p-4 rounded-xl mb-6"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            <div>
              <div className="text-xs uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                Mint Price
              </div>
              <div className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {formatUsdc(mintPrice)} USDC
              </div>
            </div>
            {activeAddress && usdcBalance !== null && (
              <div className="text-right">
                <div className="text-xs uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                  Your Balance
                </div>
                <div
                  className="text-lg font-semibold"
                  style={{ color: hasEnoughUsdc ? 'var(--text-primary)' : '#FD0000' }}
                >
                  {formatUsdc(usdcBalance)} USDC
                </div>
              </div>
            )}
          </div>

          {/* Status messages */}
          {isPaused && (
            <div className="text-center py-3 px-4 rounded-lg mb-4 text-sm" style={{ backgroundColor: 'rgba(253, 0, 0, 0.1)', color: '#FD0000' }}>
              Minting is currently paused
            </div>
          )}
          {isSoldOut && (
            <div className="text-center py-3 px-4 rounded-lg mb-4 text-sm font-semibold" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
              Sold Out
            </div>
          )}
          {mintStatus === 'error' && errorMessage && (
            <div className="text-center py-3 px-4 rounded-lg mb-4 text-sm" style={{ backgroundColor: 'rgba(253, 0, 0, 0.1)', color: '#FD0000' }}>
              {errorMessage}
            </div>
          )}

          {/* Action button */}
          {!isAlgorand ? (
            <button
              onClick={() => switchChain('algorand-mainnet')}
              className="w-full py-3.5 rounded-lg font-bold font-apex text-lg uppercase tracking-wide transition-colors btn-primary"
            >
              Switch to Algorand
            </button>
          ) : !activeAddress ? (
            <button
              onClick={handleConnectWallet}
              className="w-full py-3.5 rounded-lg font-bold font-apex text-lg uppercase tracking-wide transition-colors btn-primary"
            >
              Connect Wallet
            </button>
          ) : (
            <button
              onClick={handleMint}
              disabled={isMinting || isPaused || isSoldOut || !hasEnoughUsdc}
              className="w-full py-3.5 rounded-lg font-bold font-apex text-lg uppercase tracking-wide transition-colors btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isMinting ? (
                <span className="inline-flex items-center gap-2">
                  <Spin size="small" />
                  {mintStatus === 'signing' ? 'Awaiting signature...' : 'Confirming...'}
                </span>
              ) : !hasEnoughUsdc ? (
                'Insufficient USDC'
              ) : (
                'Mint Genesis NFT'
              )}
            </button>
          )}

          {/* Helpful note */}
          {isAlgorand && activeAddress && !isSoldOut && !isPaused && (
            <p className="text-xs text-center mt-4" style={{ color: 'var(--text-secondary)' }}>
              Transaction requires USDC approval via your wallet
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default GenesisMintMain
