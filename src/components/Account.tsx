import { useMemo } from 'react'
import { useMultiChainWallet } from '../hooks/useMultiChainWallet'
import { useChain } from '../context/ChainContext'
import { ellipseAddress } from '../utils/ellipseAddress'

const Account = () => {
  const { activeAddress } = useMultiChainWallet()
  const { activeChain } = useChain()

  const networkName = useMemo(() => {
    return activeChain?.displayName || 'Algorand'
  }, [activeChain])

  const explorerUrl = useMemo(() => {
    const base = activeChain?.explorerBaseUrl || 'https://explorer.perawallet.app'
    return `${base}/account/${activeAddress}/`
  }, [activeChain, activeAddress])

  return (
    <div className='text-center'>
      <a className="text-xl" target="_blank" href={explorerUrl}>
        Address: {ellipseAddress(activeAddress ?? undefined)}
      </a>
      <div className="text-xl">Network: {networkName}</div>
    </div>
  )
}

export default Account
