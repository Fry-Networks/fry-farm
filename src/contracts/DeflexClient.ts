import axios, { AxiosInstance } from 'axios';

export interface DeflexQuote {
  quote?: number;
  [key: string]: any;
}

export interface DeflexSerializedTxn {
  data: string;         // base64-encoded unsigned transaction
  hasLogicSig: boolean;
  logicSigBlob: string | null; // base64 lsig blob if present
}

export interface DeflexTransactionGroup {
  txns: DeflexSerializedTxn[];
}

export class DeflexClient {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({ baseURL: '/api/swap/deflex', timeout: 15000 });
  }

  async fetchSwapQuote(fromASAId: number, toASAId: number, amount: number): Promise<DeflexQuote> {
    try {
      const { data } = await this.api.post('/quote', { fromASAId, toASAId, amount });
      if (!data.success) throw new Error(data.message || 'Deflex quote failed');
      return data.quote;
    } catch (error) {
      console.error('Deflex quote error:', error);
      throw new Error(`Failed to fetch Deflex quote: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async prepareSwapTransactions(
    address: string,
    quote: DeflexQuote,
    slippageBps: number
  ): Promise<DeflexTransactionGroup> {
    try {
      const { data } = await this.api.post('/transactions', { address, quote, slippageBps });
      if (!data.success) throw new Error(data.message || 'Deflex transactions failed');
      return { txns: data.txns };
    } catch (error) {
      console.error('Deflex transaction preparation error:', error);
      throw new Error(`Failed to prepare Deflex transactions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export default DeflexClient;
