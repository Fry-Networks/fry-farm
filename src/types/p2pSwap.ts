/** P2P Swap types — matches backend schemas */

export interface P2PMarket {
  _id: string;
  chainId: string;
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
  creator: string;
  feeRecipient: string;
  feeBps: number;
  isActive: boolean;
  isPrivate?: boolean;
  gatedWallet?: string;
  deployTxId?: string;
  createdAt: string;
  updatedAt: string;
  openOfferCount?: number;
}

export interface P2PMarketStats {
  appId: number;
  openOffers: number;
  totalOffers: number;
  totalTrades: number;
  totalOfferVolume: string;
  totalRequestVolume: string;
  totalFees: string;
  firstTrade: string | null;
  lastTrade: string | null;
}

export interface P2POffer {
  _id: string;
  chainId: string;
  marketAppId: number;
  offerId: number;
  makerWallet: string;
  offerAmount: string;
  requestAmount: string;
  offerType: 'public' | 'private';
  counterparty: string;
  status: 'open' | 'filled' | 'cancelled' | 'expired';
  expiresAt: string | null;
  escrowTxId: string;
  takerWallet: string;
  settlementTxId: string;
  settledAt: string | null;
  cancelTxId: string;
  cancelledAt: string | null;
  feeTxId: string;
  platformFeeAmount: string;
  createdAt: string;
  updatedAt: string;
}

export interface P2PTrade {
  _id: string;
  chainId: string;
  marketAppId: number;
  offerId: number;
  makerWallet: string;
  takerWallet: string;
  offerAssetId: number;
  offerAmount: string;
  requestAssetId: number;
  requestAmount: string;
  feeAmount: string;
  feeRecipient: string;
  settlementTxId: string;
  settledAt: string;
  createdAt: string;
}

export interface P2PReputation {
  walletAddress: string;
  totalTrades: number;
  asMaker: number;
  asTaker: number;
  totalVolume: string;
  memberSince: string | null;
}

export interface P2POfferPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface CreateOfferPayload {
  marketAppId: number;
  offerId: number;
  escrowTxId: string;
  offerAmount: string;
  requestAmount: string;
  offerType: 'public' | 'private';
  counterparty: string;
  expiresAt: string | null;
  feeTxId?: string;
  feeAssetId?: number;
}

export interface AcceptOfferPayload {
  marketAppId: number;
  settlementTxId: string;
  requestAmount: number;
  feeTxId?: string;
  feeAssetId?: number;
}

export interface CancelOfferPayload {
  marketAppId: number;
  cancelTxId: string;
}

export interface RegisterMarketPayload {
  appId: number;
  deployTxId: string;
  offerAssetId: number;
  requestAssetId: number;
  feeBps: number;
  offerAssetName?: string;
  offerAssetSymbol?: string;
  requestAssetName?: string;
  requestAssetSymbol?: string;
  isPrivate?: boolean;
  gatedWallet?: string;
}
