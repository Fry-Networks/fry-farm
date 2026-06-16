import axios from 'axios'
import type { NftAsset, NftMetadata, NftStakingPool } from '../types/nftStaking'
import { getChainConfig } from '../config/chains'
import type { ChainId } from '../config/chains/types'

const INDEXER_URL = 'https://mainnet-idx.4160.nodely.dev'
const PERA_API = 'https://mainnet.api.perawallet.app'
const VOI_NFT_NAVIGATOR = 'https://arc72-idx.nftnavigator.xyz/nft-indexer/v1'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// In-memory cache
const nftCache = new Map<string, { data: any; timestamp: number }>()
const metadataCache = new Map<number, { data: NftMetadata; timestamp: number }>()

function getCached<T>(cache: Map<any, { data: T; timestamp: number }>, key: any): T | null {
  const entry = cache.get(key)
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) return entry.data
  return null
}

/**
 * Fetch all NFTs (pure collectibles: decimals=0, total=1) owned by a wallet.
 * For Voi: fetches ARC-72 tokens from NFT Navigator indexer.
 */
export async function getUserNfts(wallet: string, chainId: ChainId = 'algorand-mainnet'): Promise<NftAsset[]> {
  const cacheKey = `user-nfts-${chainId}-${wallet}`
  const cached = getCached(nftCache, cacheKey)
  if (cached) return cached as NftAsset[]

  if (chainId === 'voi-mainnet') {
    return getUserNftsVoi(wallet, cacheKey)
  }

  const nfts: NftAsset[] = []
  let nextToken: string | undefined

  do {
    const params: any = { limit: 100 }
    if (nextToken) params.next = nextToken

    const res = await axios.get(`${INDEXER_URL}/v2/accounts/${wallet}/assets`, {
      params,
      timeout: 15000,
    })

    const assets = res.data?.assets ?? []
    for (const a of assets) {
      if (a.amount > 0 && a['asset-id']) {
        // Fetch asset params to check if it's an NFT (total=1, decimals=0)
        try {
          const assetRes = await axios.get(`${INDEXER_URL}/v2/assets/${a['asset-id']}`, { timeout: 10000 })
          const params = assetRes.data?.asset?.params
          if (params && params.total === 1 && params.decimals === 0) {
            nfts.push({
              asaId: a['asset-id'],
              name: params.name || `Asset #${a['asset-id']}`,
              unitName: params['unit-name'] || '',
              creator: params.creator || '',
              total: params.total,
              decimals: params.decimals,
              url: params.url || '',
              imageUrl: '',
            })
          }
        } catch {
          // Skip assets we can't fetch
        }
      }
    }

    nextToken = res.data?.['next-token']
  } while (nextToken)

  nftCache.set(cacheKey, { data: nfts, timestamp: Date.now() })
  return nfts
}

/** Fetch ARC-72 NFTs from Voi NFT Navigator indexer */
async function getUserNftsVoi(wallet: string, cacheKey: string): Promise<NftAsset[]> {
  const nfts: NftAsset[] = []
  try {
    const res = await axios.get(`${VOI_NFT_NAVIGATOR}/tokens`, {
      params: { owner: wallet },
      timeout: 15000,
    })
    const tokens = res.data?.tokens ?? []
    for (const t of tokens) {
      let metadata: any = {}
      try {
        metadata = typeof t.metadata === 'string' ? JSON.parse(t.metadata) : (t.metadata || {})
      } catch { /* ignore */ }
      nfts.push({
        asaId: Number(t.tokenId || t['token-id'] || 0),
        name: metadata.name || `ARC-72 #${t.tokenId}`,
        unitName: '',
        creator: String(t.contractId || t['contract-id'] || ''),
        total: 1,
        decimals: 0,
        url: '',
        imageUrl: metadata.image || '',
      })
    }
  } catch {
    // NFT Navigator unavailable
  }
  nftCache.set(cacheKey, { data: nfts, timestamp: Date.now() })
  return nfts
}

/**
 * Filter NFTs eligible for a given pool based on collection mode.
 * collectionMode: 0 = creator_address, 1 = whitelist, 2 = both (either condition)
 */
export function filterEligibleNfts(nfts: NftAsset[], pool: NftStakingPool): NftAsset[] {
  return nfts.filter((nft) => {
    const matchesCreator = pool.collectionCreator && nft.creator === pool.collectionCreator
    const matchesWhitelist = pool.whitelistedAsaIds?.includes(nft.asaId)

    switch (pool.collectionMode) {
      case 0: // creator_address
        return matchesCreator
      case 1: // whitelist
        return matchesWhitelist
      case 2: // both (either condition)
        return matchesCreator || matchesWhitelist
      default:
        return false
    }
  })
}

/**
 * Fetch NFT metadata from Pera API (Algorand) or NFT Navigator (Voi).
 */
export async function getNftMetadata(asaId: number, chainId: ChainId = 'algorand-mainnet'): Promise<NftMetadata> {
  const cacheKey = chainId === 'voi-mainnet' ? asaId + 1_000_000_000 : asaId
  const cached = getCached(metadataCache, cacheKey)
  if (cached) return cached

  if (chainId === 'voi-mainnet') {
    return getNftMetadataVoi(asaId, cacheKey)
  }

  try {
    const res = await axios.get(`${PERA_API}/v1/public/assets/${asaId}/?include_collectible=true`, {
      timeout: 10000,
    })

    const asset = res.data
    const collectible = asset?.collectible

    const metadata: NftMetadata = {
      asaId,
      name: asset?.name || `Asset #${asaId}`,
      imageUrl:
        collectible?.primary_image ||
        collectible?.media?.[0]?.url ||
        asset?.logo ||
        `https://asa-list.tinyman.org/assets/${asaId}/icon.png`,
      traits: collectible?.traits || [],
    }

    metadataCache.set(cacheKey, { data: metadata, timestamp: Date.now() })
    return metadata
  } catch {
    return {
      asaId,
      name: `Asset #${asaId}`,
      imageUrl: `https://asa-list.tinyman.org/assets/${asaId}/icon.png`,
      traits: [],
    }
  }
}

/** Fetch ARC-72 NFT metadata from Voi NFT Navigator */
async function getNftMetadataVoi(tokenId: number, cacheKey: number): Promise<NftMetadata> {
  try {
    const res = await axios.get(`${VOI_NFT_NAVIGATOR}/tokens`, {
      params: { tokenId },
      timeout: 10000,
    })
    const token = res.data?.tokens?.[0]
    if (token) {
      let meta: any = {}
      try {
        meta = typeof token.metadata === 'string' ? JSON.parse(token.metadata) : (token.metadata || {})
      } catch { /* ignore */ }
      const metadata: NftMetadata = {
        asaId: tokenId,
        name: meta.name || `ARC-72 #${tokenId}`,
        imageUrl: meta.image || '',
        traits: meta.properties ? Object.entries(meta.properties).map(([k, v]) => ({ label: k, value: String(v) })) : [],
      }
      metadataCache.set(cacheKey, { data: metadata, timestamp: Date.now() })
      return metadata
    }
  } catch { /* fallback */ }
  return { asaId: tokenId, name: `ARC-72 #${tokenId}`, imageUrl: '', traits: [] }
}

/**
 * Fetch collection-level metadata for an ARC-72 collection on Voi by contract ID.
 * Returns the name and image from the first token in the collection.
 */
export async function getArc72CollectionMeta(contractId: number): Promise<{ name: string; imageUrl: string } | null> {
  const cacheKey = `arc72-coll-${contractId}`
  const cached = getCached(nftCache, cacheKey)
  if (cached) return cached as { name: string; imageUrl: string }

  try {
    const res = await axios.get(`${VOI_NFT_NAVIGATOR}/tokens`, {
      params: { contractId, limit: 1 },
      timeout: 10000,
    })
    const token = res.data?.tokens?.[0]
    if (!token) return null
    const meta = typeof token.metadata === 'string' ? JSON.parse(token.metadata) : (token.metadata || {})
    const name = (meta.name || '').replace(/\s*#\d+$/, '').trim()
    const result = { name, imageUrl: meta.image || '' }
    nftCache.set(cacheKey, { data: result, timestamp: Date.now() })
    return result
  } catch {
    return null
  }
}

/**
 * Batch fetch NFT metadata with concurrency limit.
 */
export async function batchGetNftMetadata(asaIds: number[], concurrency = 5, chainId: ChainId = 'algorand-mainnet'): Promise<NftMetadata[]> {
  const results: NftMetadata[] = []
  const queue = [...asaIds]

  const worker = async () => {
    while (queue.length > 0) {
      const id = queue.shift()
      if (id !== undefined) {
        const meta = await getNftMetadata(id, chainId)
        results.push(meta)
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker())
  await Promise.all(workers)

  return results
}
