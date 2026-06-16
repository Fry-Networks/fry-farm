import { Provider, useWallet } from '@txnlab/use-wallet'
import { useState } from 'react'
import { Modal } from 'antd'
import Account from './Account'
import { useAuth } from '../hooks/useAuth'
import { useChain } from '../context/ChainContext'
import { useMultiChainWallet } from '../hooks/useMultiChainWallet'

interface ConnectWalletInterface {
  openModal: boolean
  closeModal: () => void
}

const ConnectWallet = ({ openModal, closeModal }: ConnectWalletInterface) => {
  const { providers } = useWallet()
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const { activeAddress, isKibisisAvailable, connectVoi, connectLute, disconnectVoi } = useMultiChainWallet()
  const { clearAuth } = useAuth()
  const { chainId, activeChain } = useChain()
  const isAlgorand = chainId === 'algorand-mainnet'

  const isKmd = (provider: Provider) => provider.metadata.name.toLowerCase() === 'kmd'

  const handleOk = () => {
    closeModal()
  }

  const withTimeout = (promise: Promise<any>, ms: number, label: string): Promise<any> => {
    return Promise.race([
      promise,
      new Promise<any>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      )
    ])
  }

  const handleProviderConnect = async (provider: Provider) => {
    setConnectingId(provider.metadata.id)
    try {
      await withTimeout(provider.connect(), 30000, `Wallet connection (${provider.metadata.name})`)
    } catch (err: any) {
      console.error(`Wallet connection failed (${provider.metadata.name}):`, err.message || err)
    } finally {
      setConnectingId(null)
    }
  }

  const handleKibisisConnect = async () => {
    try {
      await connectVoi()
    } catch (err: any) {
      console.error('Kibisis connection failed:', err.message)
    }
  }

  const handleVoiDisconnect = () => {
    clearAuth()
    disconnectVoi()
  }

  const handleAlgorandLogout = () => {
    clearAuth()
    if (providers) {
      const activeProvider = providers.find((p) => p.isActive)
      if (activeProvider) {
        activeProvider.disconnect()
        Object.keys(localStorage)
          .filter(k => k.startsWith('wc@') || k === 'walletconnect' || k === 'WALLETCONNECT_DEEPLINK_CHOICE')
          .forEach(k => localStorage.removeItem(k))
      } else {
        localStorage.removeItem('txnlab-use-wallet')
        window.location.reload()
      }
    }
  }

  return (
    <Modal open={openModal} onOk={handleOk} onCancel={closeModal} centered={true} width={415} footer={null} zIndex={10000}>
      <form method="dialog" className="relative modal-box bg-[var(--modal-bg)] max-w-md px-6 py-5 rounded-3xl">
        <div className="w-full flex flex-col items-center justify-center gap-6 mt-5">
          <h3 className="text-[var(--text-heading)] uppercase text-2xl text-center font-apex walletText">
            {activeAddress ? 'Wallet Is Connected' : `Connect ${activeChain.displayName} Wallet`}
          </h3>
          <img className="max-w-[106px] max-h-[80px] w-full h-full object-cover" src="/assets/logo.png" alt="fry-logo" />
          <img src="/assets/redLine.png" alt="redline" />
          <div className="grid mb-2 w-full">
            {activeAddress && (
              <Account />
            )}
            <div className="innerContent flex flex-col items-center gap-4 mt-4">
              {/* Algorand wallets */}
              {isAlgorand && !activeAddress && (
                <>
                  {providers?.map((provider) => (
                    <button
                      data-test-id={`${provider.metadata.id}-connect`}
                      className="wltbtn py-3.5 px-6 bg-[var(--bg-secondary)] font-Roboto ex-small font-normal w-full flex justify-start items-center gap-5 border-solid border-2 border-transparent"
                      key={`provider-${provider.metadata.id}`}
                      disabled={connectingId === provider.metadata.id}
                      onClick={() => handleProviderConnect(provider)}
                    >
                      {connectingId === provider.metadata.id && (
                        <span className="loading loading-spinner w-[30px] h-[30px]" />
                      )}
                      {!isKmd(provider) && (
                        <img
                          alt={`wallet_icon_${provider.metadata.id}`}
                          src={provider.metadata.icon}
                          style={{ objectFit: 'contain', width: '30px', height: 'auto' }}
                        />
                      )}
                      <span className="text-[var(--text-secondary)] font-Roboto">{isKmd(provider) ? 'LocalNet Wallet' : provider.metadata.name}</span>
                    </button>
                  ))}
                  {isKibisisAvailable && (
                    <button
                      className="wltbtn py-3.5 px-6 bg-[var(--bg-secondary)] font-Roboto ex-small font-normal w-full flex justify-start items-center gap-5 border-solid border-2 border-transparent"
                      disabled={connectingId === 'kibisis'}
                      onClick={async () => {
                        setConnectingId('kibisis')
                        try { await withTimeout(handleKibisisConnect(), 30000, 'Kibisis connection') } finally { setConnectingId(null) }
                      }}
                    >
                      <svg width="30" height="30" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect width="256" height="256" rx="48" fill="#6C3FC5"/>
                        <path d="M88 56L128 128L88 200H120L160 128L120 56H88Z" fill="white"/>
                        <path d="M136 56L176 128L136 200H168L208 128L168 56H136Z" fill="white" opacity="0.6"/>
                      </svg>
                      <span className="text-[var(--text-secondary)] font-Roboto">Kibisis</span>
                    </button>
                  )}
                </>
              )}

              {/* Voi wallets */}
              {!isAlgorand && !activeAddress && (
                <>
                  <button
                    className="wltbtn py-3.5 px-6 bg-[var(--bg-secondary)] font-Roboto ex-small font-normal w-full flex justify-start items-center gap-5 border-solid border-2 border-[#8B5CF6]"
                    onClick={handleKibisisConnect}
                  >
                    <svg width="30" height="30" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect width="256" height="256" rx="48" fill="#6C3FC5"/>
                      <path d="M88 56L128 128L88 200H120L160 128L120 56H88Z" fill="white"/>
                      <path d="M136 56L176 128L136 200H168L208 128L168 56H136Z" fill="white" opacity="0.6"/>
                    </svg>
                    <span className="text-[var(--text-secondary)] font-Roboto">Kibisis</span>
                  </button>
                  <button
                    className="wltbtn py-3.5 px-6 bg-[var(--bg-secondary)] font-Roboto ex-small font-normal w-full flex justify-start items-center gap-5 border-solid border-2 border-[#8B5CF6]"
                    onClick={() => connectLute().catch((err: any) => console.error('Lute connection failed:', err.message))}
                  >
                    <img
                      src="https://lute.app/favicon.ico"
                      alt="Lute"
                      style={{ objectFit: 'contain', width: '30px', height: '30px', borderRadius: '6px' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                    <span className="text-[var(--text-secondary)] font-Roboto">Lute</span>
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="modal-action !mt-0">
            {activeAddress && isAlgorand && (
              <button
                className="bg-gradient-to-r from-[#FF9292] to-[#FD0000] text-white p-3"
                data-test-id="logout"
                onClick={handleAlgorandLogout}
              >
                Logout
              </button>
            )}
            {activeAddress && !isAlgorand && (
              <button
                className="bg-gradient-to-r from-[#A78BFA] to-[#8B5CF6] text-white p-3"
                onClick={handleVoiDisconnect}
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      </form>
    </Modal>
  )
}
export default ConnectWallet
