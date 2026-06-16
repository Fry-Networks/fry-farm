import { ChainId } from './chains/types';

export interface P2PMarketConfig {
  appId: number;
  appAddress: string;
  offerAssetId: number;
  offerAssetName: string;
  offerAssetSymbol: string;
  offerAssetDecimals: number;
  requestAssetId: number;
  requestAssetName: string;
  requestAssetSymbol: string;
  requestAssetDecimals: number;
  feeBps: number;
  feeRecipient: string;
}

export const P2P_MARKETS: Record<ChainId, P2PMarketConfig> = {
  'algorand-mainnet': {
    appId: 3495625484,
    appAddress: 'Z3U6LMNRONCOSBRB2JWF5RXDW7AP4J75YARQ2XOIHYERHPJNEFDUIOPSMQ',
    offerAssetId: 2485314946,
    offerAssetName: 'Fry',
    offerAssetSymbol: 'FRY',
    offerAssetDecimals: 6,
    requestAssetId: 0,
    requestAssetName: 'Algo',
    requestAssetSymbol: 'ALGO',
    requestAssetDecimals: 6,
    feeBps: 50,
    feeRecipient: 'E2F2LT2INE75DBOYHQXTCTOP2PAP5MHAXQRXTTCCXFKHQTVG36DJONBQZE',
  },
  'voi-mainnet': {
    appId: 49001043,
    appAddress: 'IS3U77ZF3WZIRP7KXRU6WLR5F7ZITR6CPDYLLNW2AYMT5BGLJLXXURLOJU',
    offerAssetId: 48968653,
    offerAssetName: 'vFry',
    offerAssetSymbol: 'vFRY',
    offerAssetDecimals: 6,
    requestAssetId: 0,
    requestAssetName: 'Voi',
    requestAssetSymbol: 'VOI',
    requestAssetDecimals: 6,
    feeBps: 50,
    feeRecipient: 'NQA76E235VCMZB4KZQSV6IU64IWF2GGCXK4Y3QA7N7ZMI7MVHUQVV5BUD4',
  },
};

/** Box MBR per offer in microALGO/microVOI (recoverable on cancel/fill) */
export const P2P_BOX_MBR = 47_300;

/** Minimum fee budgets in microALGO/microVOI */
export const P2P_FEE_CREATE = 2_000;
export const P2P_FEE_ACCEPT = 5_000;
export const P2P_FEE_CANCEL = 2_000;
export const P2P_FEE_UPDATE = 1_000;

/** Deploy constants */
export const P2P_DEFAULT_FEE_BPS = 50;
export const P2P_GLOBAL_INTS = 8;
export const P2P_GLOBAL_BYTES = 2;
export const P2P_APP_MBR = 200_000;
export const P2P_ASA_OPT_IN_MBR = 100_000;

/** Expiry presets in seconds */
export const EXPIRY_OPTIONS = [
  { label: 'No expiry', value: 0 },
  { label: '1 hour', value: 3600 },
  { label: '6 hours', value: 21600 },
  { label: '24 hours', value: 86400 },
  { label: '7 days', value: 604800 },
];
