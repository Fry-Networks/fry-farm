// @ts-nocheck
import { useEffect, useMemo, useState } from 'react'
import { Spin } from 'antd'
import algosdk, { ABIMethod, AtomicTransactionComposer } from 'algosdk'
import { useMultiChainWallet } from '../../../../hooks/useMultiChainWallet'
import { useChain } from '../../../../context/ChainContext'
import { fetchChainPriceMap } from '../../../../services/PriceService'
import { tokenServiceInstance as tokenService } from '../../../../services/TokenService'
import {
  getTokens as getNomadexTokens,
  loadMarketData as loadNomadexData,
} from '../../../../contracts/nomadex/api'
import {
  getHumbleTokens,
  loadHumbleMarketData,
} from '../../../../contracts/humble/api'
import { NomadexTokenType } from '../../../../contracts/nomadex/types'

export interface PortfolioToken {
  id: number
  name: string
  symbol: string
  decimals: number
  image: string
  balance: number
  price: number | null
  value: number | null
  isArc200?: boolean
}

async function batchSettled<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = []
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency)
    const batchResults = await Promise.allSettled(batch.map(fn => fn()))
    results.push(...batchResults)
  }
  return results
}

const ARC200_BALANCE_OF = new ABIMethod({
  name: 'arc200_balanceOf',
  args: [{ name: 'owner', type: 'address' }],
  returns: { type: 'uint256' },
})

async function queryArc200Balance(
  algodClient: algosdk.Algodv2,
  contractId: number,
  ownerAddress: string
): Promise<bigint> {
  const atc = new AtomicTransactionComposer()
  const params = await algodClient.getTransactionParams().do()

  const pubkey = algosdk.decodeAddress(ownerAddress).publicKey
  atc.addMethodCall({
    sender: ownerAddress,
    signer: algosdk.makeEmptyTransactionSigner(),
    appID: contractId,
    method: ARC200_BALANCE_OF,
    methodArgs: [ownerAddress],
    suggestedParams: params,
    boxes: [
      { appIndex: contractId, name: new Uint8Array([0x00, ...pubkey]) },
    ],
  })

  const result = await atc.simulate(algodClient, new algosdk.modelsv2.SimulateRequest({
    txnGroups: [],
    allowUnnamedResources: true,
    allowEmptySignatures: true,
  }))
  const returnValue = result.methodResults[0]?.returnValue
  return returnValue ? BigInt(returnValue.toString()) : 0n
}

interface PortfolioTableProps {
  onTokensLoaded?: (tokens: PortfolioToken[]) => void
}

const PortfolioTable: React.FC<PortfolioTableProps> = ({ onTokensLoaded }) => {
  const { activeAddress } = useMultiChainWallet()
  const { chainId, getAlgodClient } = useChain()
  const [tokens, setTokens] = useState<PortfolioToken[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [arc200Loading, setArc200Loading] = useState(false)
  const [sortKey, setSortKey] = useState<'symbol' | 'balance' | 'price' | 'value'>('value')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    if (!activeAddress) {
      setTokens([])
      setIsLoading(false)
      onTokensLoaded?.([])
      return
    }

    const fetchPortfolio = async () => {
      setIsLoading(true)
      try {
        const algodClient = getAlgodClient()
        const accountInfo = await algodClient.accountInformation(activeAddress).do()

        // Build token list from account info
        const held: { id: number; rawAmount: number }[] = []

        // Native token (ALGO or VOI)
        const nativeAmount = Number(accountInfo.amount)
        if (nativeAmount > 0) {
          held.push({ id: 0, rawAmount: nativeAmount })
        }

        // Opted-in ASAs
        const assets = accountInfo.assets || []
        for (const a of assets) {
          if (a.amount > 0) {
            held.push({ id: a['asset-id'], rawAmount: Number(a.amount) })
          }
        }

        // Get metadata and prices
        const tokenIds = held.map((h) => h.id)
        let metadataMap: Record<number, { name: string; symbol: string; decimals: number; image: string }> = {}

        if (chainId === 'voi-mainnet') {
          await Promise.allSettled([loadNomadexData(), loadHumbleMarketData()])
          const nomTokens = getNomadexTokens()
          const humTokens = getHumbleTokens()
          const nautilusIcon = (id: number) => `https://asset-verification.nautilus.sh/icons/${id}.png`
          // Native VOI
          metadataMap[0] = { name: 'Voi', symbol: 'VOI', decimals: 6, image: nautilusIcon(0) }
          for (const t of nomTokens) {
            metadataMap[t.id] = { name: t.name, symbol: t.symbol, decimals: t.decimals, image: nautilusIcon(t.id) }
          }
          for (const t of humTokens) {
            if (!metadataMap[t.id]) {
              metadataMap[t.id] = { name: t.name, symbol: t.symbol, decimals: t.decimals, image: nautilusIcon(t.id) }
            }
          }
          // Fallback: fetch metadata from algod for any held ASA not in registries
          for (const h of held) {
            if (h.id !== 0 && !metadataMap[h.id]) {
              try {
                const assetInfo = await algodClient.getAssetByID(h.id).do()
                const p = assetInfo.params
                metadataMap[h.id] = {
                  name: p.name || `Asset ${h.id}`,
                  symbol: p['unit-name'] || 'UNKNOWN',
                  decimals: p.decimals ?? 6,
                  image: nautilusIcon(h.id),
                }
              } catch { /* will fall back to "UNKNOWN" */ }
            }
          }
        } else {
          // Algorand — use TokenService
          const allTokens = await tokenService.fetchAllTokens()
          metadataMap[0] = { name: 'Algorand', symbol: 'ALGO', decimals: 6, image: 'https://asa-list.tinyman.org/assets/0/icon.png' }
          for (const t of allTokens) {
            metadataMap[t.id] = { name: t.name, symbol: t.symbol, decimals: t.decimals, image: t.image }
          }
        }

        // Fetch USD prices
        let priceMap: Record<string, number> = {}
        try {
          priceMap = await fetchChainPriceMap(tokenIds, chainId)
        } catch {
          // Prices unavailable — continue without
        }

        // Build portfolio tokens
        const portfolio: PortfolioToken[] = held.map((h) => {
          const meta = metadataMap[h.id]
          const decimals = meta?.decimals ?? 6
          const balance = h.rawAmount / Math.pow(10, decimals)
          const price = priceMap[String(h.id)] ?? null
          return {
            id: h.id,
            name: meta?.name || `Asset ${h.id}`,
            symbol: meta?.symbol || 'UNKNOWN',
            decimals,
            image: meta?.image || '',
            balance,
            price,
            value: price != null ? balance * price : null,
          }
        })

        // Sort by value descending, null values at end
        portfolio.sort((a, b) => {
          if (a.value != null && b.value != null) return b.value - a.value
          if (a.value != null) return -1
          if (b.value != null) return 1
          return b.balance - a.balance
        })

        setTokens(portfolio)
        onTokensLoaded?.(portfolio)
        setIsLoading(false)

        // For Voi: also fetch ARC-200 token balances
        if (chainId === 'voi-mainnet') {
          setArc200Loading(true)
          try {
            const nomTokens = getNomadexTokens()
            const humTokens = getHumbleTokens()

            // Collect ARC-200 tokens (type SMART in Nomadex, or any non-ASA from Humble)
            const arc200Set = new Map<number, { name: string; symbol: string; decimals: number }>()
            for (const t of nomTokens) {
              if (t.type === NomadexTokenType.SMART) {
                arc200Set.set(t.id, { name: t.name, symbol: t.symbol, decimals: t.decimals })
              }
            }
            // Humble tokens with IDs not in standard ASA range could be ARC-200
            // But safer: just add all Humble tokens and dedupe with what we already have
            for (const t of humTokens) {
              if (!arc200Set.has(t.id) && t.id !== 0) {
                // Check if it's already in our standard ASA list
                const alreadyHeld = portfolio.find((p) => p.id === t.id)
                if (!alreadyHeld) {
                  arc200Set.set(t.id, { name: t.name, symbol: t.symbol, decimals: t.decimals })
                }
              }
            }

            // Remove tokens already in portfolio (from standard ASA query)
            for (const p of portfolio) {
              arc200Set.delete(p.id)
            }

            if (arc200Set.size > 0) {
              const arc200Entries = Array.from(arc200Set.entries())

              // Query ARC-200 balances in batches to avoid overwhelming algod
              const results = await batchSettled(
                arc200Entries.map(([contractId]) =>
                  () => queryArc200Balance(algodClient, contractId, activeAddress)
                ),
                5
              )

              const arc200Tokens: PortfolioToken[] = []
              const arc200Ids: number[] = []
              for (let i = 0; i < results.length; i++) {
                const result = results[i]
                if (result.status === 'rejected') {
                  console.warn(`ARC-200 balance query failed for ${arc200Entries[i][0]} (${arc200Entries[i][1].symbol}):`, result.reason)
                  continue
                }
                if (result.value === 0n) continue

                const [contractId, meta] = arc200Entries[i]
                const balance = Number(result.value) / Math.pow(10, meta.decimals)
                if (balance <= 0) continue

                arc200Ids.push(contractId)
                arc200Tokens.push({
                  id: contractId,
                  name: meta.name,
                  symbol: meta.symbol,
                  decimals: meta.decimals,
                  image: `https://asset-verification.nautilus.sh/icons/${contractId}.png`,
                  balance,
                  price: null,
                  value: null,
                  isArc200: true,
                })
              }

              // Get prices for ARC-200 tokens
              if (arc200Ids.length > 0) {
                try {
                  const arc200Prices = await fetchChainPriceMap(arc200Ids, chainId)
                  for (const t of arc200Tokens) {
                    const p = arc200Prices[String(t.id)]
                    if (p != null) {
                      t.price = p
                      t.value = t.balance * p
                    }
                  }
                } catch {
                  // Prices unavailable
                }
              }

              const combined = [...portfolio, ...arc200Tokens]
              combined.sort((a, b) => {
                if (a.value != null && b.value != null) return b.value - a.value
                if (a.value != null) return -1
                if (b.value != null) return 1
                return b.balance - a.balance
              })
              setTokens(combined)
              onTokensLoaded?.(combined)
            }
          } catch (error) {
            console.error('Error fetching ARC-200 balances:', error)
          } finally {
            setArc200Loading(false)
          }
        }
      } catch (error) {
        console.error('Error fetching portfolio:', error)
        setTokens([])
        onTokensLoaded?.([])
        setIsLoading(false)
      }
    }

    fetchPortfolio()
  }, [activeAddress, chainId])

  const fmt = (n: number, decimals = 2) =>
    n.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: 2 })

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'symbol' ? 'asc' : 'desc')
    }
  }

  const sortedTokens = useMemo(() => {
    const sorted = [...tokens].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'symbol':
          cmp = a.symbol.localeCompare(b.symbol)
          break
        case 'balance':
          cmp = a.balance - b.balance
          break
        case 'price': {
          if (a.price == null && b.price == null) cmp = 0
          else if (a.price == null) return 1
          else if (b.price == null) return -1
          else cmp = a.price - b.price
          break
        }
        case 'value': {
          if (a.value == null && b.value == null) cmp = 0
          else if (a.value == null) return 1
          else if (b.value == null) return -1
          else cmp = a.value - b.value
          break
        }
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [tokens, sortKey, sortDir])

  const sortArrow = (key: typeof sortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : ''

  if (!activeAddress) {
    return (
      <div className="flex justify-center items-center py-20 text-[var(--text-secondary)]">
        Connect your wallet to view your portfolio
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Spin size="large" />
      </div>
    )
  }

  if (tokens.length === 0) {
    return (
      <div className="flex justify-center items-center py-20 text-[var(--text-secondary)]">
        No tokens found in this wallet
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="overflow-x-auto rounded-[18px] bg-[var(--bg-card)] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border-color)]">
              <th onClick={() => handleSort('symbol')} className="text-left py-[16px] px-[24px] text-[var(--text-secondary)] text-sm font-medium tracking-[0.54px] cursor-pointer select-none hover:text-[var(--text-primary)]">
                Token{sortArrow('symbol')}
              </th>
              <th onClick={() => handleSort('balance')} className="text-right py-[16px] px-[24px] text-[var(--text-secondary)] text-sm font-medium tracking-[0.54px] cursor-pointer select-none hover:text-[var(--text-primary)]">
                Balance{sortArrow('balance')}
              </th>
              <th onClick={() => handleSort('price')} className="text-right py-[16px] px-[24px] text-[var(--text-secondary)] text-sm font-medium tracking-[0.54px] cursor-pointer select-none hover:text-[var(--text-primary)]">
                Price{sortArrow('price')}
              </th>
              <th onClick={() => handleSort('value')} className="text-right py-[16px] px-[24px] text-[var(--text-secondary)] text-sm font-medium tracking-[0.54px] cursor-pointer select-none hover:text-[var(--text-primary)]">
                Value{sortArrow('value')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedTokens.map((token) => (
              <tr key={`${token.id}-${token.isArc200 ? 'arc200' : 'asa'}`} className="border-b border-[var(--border-color)] last:border-b-0">
                <td className="py-[14px] px-[24px]">
                  <div className="flex items-center gap-[12px]">
                    {token.image ? (
                      <img
                        src={token.image}
                        alt={token.symbol}
                        width={32}
                        height={32}
                        className="rounded-full"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className="w-[32px] h-[32px] rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500">
                        {token.symbol.slice(0, 2)}
                      </div>
                    )}
                    <div>
                      <p className="text-[var(--text-primary)] font-medium text-sm">{token.symbol}</p>
                      <p className="text-[var(--text-secondary)] text-xs">
                        {token.name}
                        {token.isArc200 && (
                          <span className="ml-1 text-[10px] bg-blue-100 text-blue-600 px-1 rounded">ARC-200</span>
                        )}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="py-[14px] px-[24px] text-right">
                  <p className="text-[var(--text-primary)] text-sm">{fmt(token.balance, 4)}</p>
                </td>
                <td className="py-[14px] px-[24px] text-right">
                  <p className="text-[var(--text-primary)] text-sm">
                    {token.price != null ? `$${fmt(token.price, 6)}` : '--'}
                  </p>
                </td>
                <td className="py-[14px] px-[24px] text-right">
                  <p className="text-[var(--text-primary)] text-sm font-medium">
                    {token.value != null ? `$${fmt(token.value)}` : '--'}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {arc200Loading && (
        <div className="flex items-center justify-center gap-2 mt-4 text-[var(--text-secondary)] text-sm">
          <Spin size="small" />
          Loading ARC-200 token balances...
        </div>
      )}
    </div>
  )
}

export default PortfolioTable
