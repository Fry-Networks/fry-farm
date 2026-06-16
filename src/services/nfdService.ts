import axios from 'axios'

const NFD_CACHE = new Map<string, string | null>()

export async function lookupNfd(address: string): Promise<string | null> {
  if (!address || address.length < 58) return null
  if (NFD_CACHE.has(address)) return NFD_CACHE.get(address) ?? null
  try {
    const res = await axios.get('https://api.nf.domains/nfd/lookup', {
      params: { address, view: 'tiny' },
      timeout: 3000,
    })
    const name = res.data?.[address]?.name || null
    NFD_CACHE.set(address, name)
    return name
  } catch {
    NFD_CACHE.set(address, null)
    return null
  }
}
