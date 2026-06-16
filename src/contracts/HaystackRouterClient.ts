import axios, { AxiosInstance } from 'axios';

export interface HaystackQuote {
  success: boolean;
  quote?: number;
  [key: string]: any;
}

export interface HaystackSerializedTxn {
  data: string;
  hasLogicSig: boolean;
  logicSigBlob: string | null;
}

export interface HaystackTransactionGroup {
  txns: HaystackSerializedTxn[];
}

export class HaystackRouterClient {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({ baseURL: '/api/swap/haystack', timeout: 15000 });
  }

  async fetchSwapQuote(
    fromASAId: number,
    toASAId: number,
    amount: number,
    type: string = 'fixed-input'
  ): Promise<HaystackQuote> {
    try {
      const { data } = await this.api.get('/quote', {
        params: { fromASAID: fromASAId, toASAID: toASAId, amount, type },
      });
      if (!data.success) throw new Error(data.message || 'Haystack quote failed');
      return data;
    } catch (error) {
      console.error('Haystack quote error:', error);
      throw new Error(`Failed to fetch Haystack quote: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async prepareSwapTransactions(
    address: string,
    txnPayload: any,
    slippage: number = 0.01
  ): Promise<HaystackTransactionGroup> {
    try {
      const { data } = await this.api.post('/prepare', {
        address,
        txnPayloadJSON: txnPayload,
        slippage,
      });
      if (!data.success) throw new Error(data.message || 'Haystack prepare failed');
      return { txns: data.txns };
    } catch (error) {
      console.error('Haystack transaction preparation error:', error);
      throw new Error(`Failed to prepare Haystack transactions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export default HaystackRouterClient;
