import * as algokit from '@algorandfoundation/algokit-utils'
import algosdk, { TransactionSigner } from 'algosdk'
import { getAlgodConfigFromViteEnvironment } from './utils/network/getAlgoClientConfigs'

// ── Constants ────────────────────────────────────────────────────────────────

const GENESIS_NFT_APP_ID = 3509410324
const GENESIS_NFT_APP_ADDRESS = 'NXIUXEVF5Z4SNME5HMZH2NVCXBERJTBEN25G53MH72CRQHTDFMU7GWM7MU'
const USDC_ASA_ID = 31566704
const MINT_PRICE = 175_000_000 // 175 USDC (6 decimals)
const TREASURY_ADDRESS = 'E2F2LT2INE75DBOYHQXTCTOP2PAP5MHAXQRXTTCCXFKHQTVG36DJONBQZE'

// ── Helpers ──────────────────────────────────────────────────────────────────

function getAlgodClient(): algosdk.Algodv2 {
  const cfg = getAlgodConfigFromViteEnvironment()
  return algokit.getAlgoClient({ server: cfg.server, port: cfg.port, token: cfg.token })
}

function uint64ToBytes(n: number): Uint8Array {
  const buf = new Uint8Array(8)
  new DataView(buf.buffer).setBigUint64(0, BigInt(n))
  return buf
}

function b64Decode(b64: string): string {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

// ── State reading ────────────────────────────────────────────────────────────

export interface GenesisNftState {
  totalMinted: number
  maxSupply: number
  paused: boolean
  mintPrice: number
}

export async function getGenesisNftState(): Promise<GenesisNftState> {
  const algod = getAlgodClient()
  const appInfo = await algod.getApplicationByID(GENESIS_NFT_APP_ID).do()
  const gs: Record<string, number> = {}

  for (const item of appInfo.params['global-state'] || []) {
    const key = b64Decode(item.key)
    if (item.value.type === 2) {
      gs[key] = item.value.uint ?? 0
    }
  }

  return {
    totalMinted: gs['total_minted'] ?? 0,
    maxSupply: gs['max_supply'] ?? 1000,
    paused: (gs['paused'] ?? 0) !== 0,
    mintPrice: gs['mint_price'] ?? MINT_PRICE,
  }
}

export async function getUserUsdcBalance(address: string): Promise<number> {
  const algod = getAlgodClient()
  const info = await algod.accountInformation(address).do()
  const holding = info.assets?.find((a: { 'asset-id': number }) => a['asset-id'] === USDC_ASA_ID)
  return holding ? holding.amount : 0
}

// ── Minting ──────────────────────────────────────────────────────────────────

export interface MintResult {
  tokenId: number
  txId: string
}

export async function mintGenesisNft(
  signer: TransactionSigner,
  activeAddress: string,
): Promise<MintResult> {
  const algod = getAlgodClient()
  const sp = await algod.getTransactionParams().do()

  // Read current total_minted to predict the next token ID for box refs
  const state = await getGenesisNftState()
  if (state.paused) throw new Error('Minting is currently paused')
  if (state.totalMinted >= state.maxSupply) throw new Error('Sold out — all 1,000 Genesis NFTs have been minted')

  const nextTokenId = state.totalMinted + 1

  // USDC payment → app address
  const paymentTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    from: activeAddress,
    to: GENESIS_NFT_APP_ADDRESS,
    amount: state.mintPrice,
    assetIndex: USDC_ASA_ID,
    suggestedParams: sp,
  })

  // ABI method for mint(axfer)uint64
  const mintMethod = new algosdk.ABIMethod({
    name: 'mint',
    args: [{ type: 'axfer', name: 'payment' }],
    returns: { type: 'uint64' },
  })

  // Box references
  const ownersBox = {
    appIndex: 0,
    name: new Uint8Array([0x6f, ...uint64ToBytes(nextTokenId)]),  // "o" + token_id
  }
  const balancesBox = {
    appIndex: 0,
    name: new Uint8Array([0x62, ...algosdk.decodeAddress(activeAddress).publicKey]),  // "b" + address
  }

  // App call fee covers 1 inner txn (USDC forward to treasury)
  const baseFee = Math.max(sp.fee, 1000)
  const spMint = { ...sp, fee: baseFee * 2, flatFee: true }

  const atc = new algosdk.AtomicTransactionComposer()
  atc.addMethodCall({
    appID: GENESIS_NFT_APP_ID,
    method: mintMethod,
    sender: activeAddress,
    signer,
    suggestedParams: spMint,
    methodArgs: [{ txn: paymentTxn, signer }],
    appForeignAssets: [USDC_ASA_ID],
    appAccounts: [TREASURY_ADDRESS],
    boxes: [ownersBox, balancesBox],
  })

  const result = await atc.execute(algod, 4)
  const tokenId = Number(result.methodResults[0].returnValue)
  const txId = result.txIDs[result.txIDs.length - 1]

  return { tokenId, txId }
}

// ── Metadata ─────────────────────────────────────────────────────────────────

export interface NftMetadata {
  name: string
  description: string
  image: string
  attributes: Array<{ trait_type: string; value: string }>
}

export async function fetchNftMetadata(tokenId: number): Promise<NftMetadata> {
  const res = await fetch(`https://fry.farm/genesis/metadata/${tokenId}.json`)
  if (!res.ok) throw new Error(`Failed to fetch metadata for token #${tokenId}`)
  return res.json()
}

// ── Ownership queries ────────────────────────────────────────────────────────

export async function getUserGenesisNfts(address: string): Promise<number[]> {
  const algod = getAlgodClient()

  // Quick check: read the user's balance box ("b" + address)
  const balanceBoxName = new Uint8Array([0x62, ...algosdk.decodeAddress(address).publicKey])
  let balance = 0
  try {
    const box = await algod.getApplicationBoxByName(GENESIS_NFT_APP_ID, balanceBoxName).do()
    balance = Number(new DataView(new Uint8Array(box.value).buffer).getBigUint64(0))
  } catch (err: any) {
    if (err?.status === 404 || err?.message?.includes('box not found')) {
      return [] // box not found → user owns 0
    }
    console.error('[GenesisNFT] balance box read failed for', address, err)
    return []
  }
  if (balance === 0) return []

  try {
  // Scan owners boxes in parallel batches to find which token IDs belong to this user
  const state = await getGenesisNftState()
  const owned: number[] = []
  const BATCH = 20

  for (let start = 1; start <= state.totalMinted && owned.length < balance; start += BATCH) {
    const end = Math.min(start + BATCH - 1, state.totalMinted)
    let attempt = 0
    while (true) {
      try {
        await Promise.all(
          Array.from({ length: end - start + 1 }, (_, i) => {
            const id = start + i
            const boxName = new Uint8Array([0x6f, ...uint64ToBytes(id)]) // "o" + tokenId
            return algod.getApplicationBoxByName(GENESIS_NFT_APP_ID, boxName).do()
              .then((box) => {
                if (algosdk.encodeAddress(new Uint8Array(box.value)) === address) {
                  owned.push(id)
                }
              })
              .catch(() => {}) // individual box may not exist
          })
        )
        break
      } catch (e) {
        attempt++
        if (attempt >= 2) {
          console.error('[GenesisNFT] batch failed after retry', { start, end, err: e })
          throw e // outer catch will handle
        }
        await new Promise(r => setTimeout(r, 400 * attempt))
      }
    }
  }

  return owned.sort((a, b) => a - b)
  } catch (err) {
    console.error('[GenesisNFT] getUserGenesisNfts scan failed for', address, err)
    return []
  }
}
