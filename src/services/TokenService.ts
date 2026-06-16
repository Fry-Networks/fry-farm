import axios from 'axios';

// Backend API service for fetching tokens
class TokenService {
  private baseUrl: string;
  private tokenCache: Token[] | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private searchCache: Map<string, { tokens: Token[], timestamp: number }> = new Map();
  private readonly SEARCH_CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

  constructor() {
    this.baseUrl = import.meta.env.VITE_API_BASE_URL || 'https://frynodebackend.octalooptechnologies.com';
  }


  /**
   * Resolve the best available image for a token.
   * Priority: DB image (if valid) → Backend on-demand resolution (server-side Pera/Tinyman probe)
   */
  async resolveTokenImage(tokenId: number, dbImage?: string, chainId?: string): Promise<string> {
    const isValid = dbImage &&
      (dbImage.startsWith('http://') || dbImage.startsWith('https://') || dbImage.startsWith('ipfs://') ||
       dbImage.includes('.png') || dbImage.includes('.jpg') || dbImage.includes('.jpeg') || dbImage.includes('.svg'));
    if (isValid) return dbImage;

    // Call backend endpoint — server-side probe avoids CORS/ORB issues
    try {
      const resp = await axios.get(`${this.baseUrl}/token/${tokenId}/image`, { timeout: 8000 });
      const imageUrl = resp.data?.imageUrl;
      if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
        return imageUrl;
      }
    } catch { /* Backend probe failed, return empty for component fallback */ }

    return '';
  }

  /**
   * Fetch all tokens from backend API with caching
   */
  async fetchAllTokens(): Promise<Token[]> {
    // Check cache first
    const now = Date.now();
    if (this.tokenCache && (now - this.cacheTimestamp) < this.CACHE_DURATION) {
      return this.tokenCache;
    }

    try {
      
      // Fetch from your backend API with timeout
      const response = await axios.get(`${this.baseUrl}/token/all`, {
        timeout: 10000, // 10 second timeout
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      const dbTokens = response.data.data || response.data;

      // Convert database tokens to Token format, resolving images via Pera API for invalid URLs
      const results = await Promise.allSettled(dbTokens.map(async (token: any) => {
        const currentChain = typeof localStorage !== 'undefined' ? localStorage.getItem('fry-farm-chain-id') || 'algorand-mainnet' : 'algorand-mainnet';
        const image = await this.resolveTokenImage(token.tokenId, token.tokenImage, currentChain);

        return {
          id: token.tokenId,
          name: token.tokenName || `Asset ${token.tokenId}`,
          symbol: token.tokenSymbol || token.tokenName || 'UNKNOWN',
          decimals: token.decimals || 6,
          verified: token.verified || false,
          image,
          price: token.price,
          marketCap: token.marketCap,
          volume24h: token.volume1d,
          totalSupply: token.totalSupply,
          circulatingSupply: token.circulatingSupply,
          tvl: token.tvl,
          rank: token.rank,
          source: token.source || 'Backend API'
        };
      }));
      const tokens = results
        .filter((r): r is PromiseFulfilledResult<Token> => r.status === 'fulfilled')
        .map(r => r.value);

      // Add some essential tokens that might not be in database
      const essentialTokens = this.getEssentialTokens();
      const combinedTokens = [...tokens, ...essentialTokens];

      // Remove duplicates by ID
      const uniqueTokens = combinedTokens.filter((token, index, self) => 
        index === self.findIndex(t => t.id === token.id)
      );

      // Cache the results
      this.tokenCache = uniqueTokens;
      this.cacheTimestamp = Date.now();
      
      return uniqueTokens;

    } catch (error) {
      console.error('Failed to fetch tokens from backend API:', error);
      
      // If we have cached tokens, use them even if expired
      if (this.tokenCache) {
        return this.tokenCache;
      }

      return this.getComprehensiveTokenList();
    }
  }

  /**
   * Default tokens that should always be shown in dropdowns
   */
  getDefaultTokens(): Token[] {
    return [
      { id: 0, name: 'Algorand', symbol: 'ALGO', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/0/icon.png' },
      { id: 31566704, name: 'USD Coin', symbol: 'USDC', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/31566704/icon.png' },
      { id: 2485314946, name: 'Fry', symbol: 'FRY', decimals: 6, verified: true, image: '/assets/images/fry-token.png' },
      { id: 312769, name: 'Tether', symbol: 'USDT', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/312769/icon.png' },
      { id: 27165954, name: 'PlanetWatch', symbol: 'PLANETS', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/27165954/icon.png' },
      { id: 287867876, name: 'Opulous', symbol: 'OPUL', decimals: 10, verified: true, image: 'https://asa-list.tinyman.org/assets/287867876/icon.png' },
      // Note: FOLKS, RIO, BUY, PGOLD, ALGX IDs need to be updated with correct asset IDs
      // These are placeholder IDs - update when actual IDs are known
      // Note: Token IDs below are placeholders - update with correct asset IDs when available
      { id: 700965019, name: 'Folks Finance', symbol: 'FOLKS', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/700965019/icon.png' },
      { id: 163650, name: 'Realio Network', symbol: 'RIO', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/163650/icon.png' },
      { id: 230946361, name: 'Buying.com', symbol: 'BUY', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/230946361/icon.png' },
      { id: 137594422, name: 'PolkaGold', symbol: 'PGOLD', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/137594422/icon.png' },
      { id: 137594423, name: 'Algodex Token', symbol: 'ALGX', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/137594423/icon.png' },
    ];
  }

  /**
   * Essential tokens that should always be available
   */
  private getEssentialTokens(): Token[] {
    return [
      { id: 0, name: 'Algorand', symbol: 'ALGO', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/0/icon.png' },
      { id: 31566704, name: 'USD Coin', symbol: 'USDC', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/31566704/icon.png' },
      { id: 312769, name: 'Tether USD', symbol: 'USDT', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/312769/icon.png' },
      { id: 2485314946, name: 'Fry', symbol: 'FRY', decimals: 6, verified: true, image: '/assets/images/fry-token.png' }
    ];
  }

  /**
   * Comprehensive token list with all popular Algorand tokens
   */
  private getComprehensiveTokenList(): Token[] {
    return [
      // Major tokens
      { id: 0, name: 'Algorand', symbol: 'ALGO', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/0/icon.png' },
      { id: 31566704, name: 'USD Coin', symbol: 'USDC', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/31566704/icon.png' },
      { id: 312769, name: 'Tether USD', symbol: 'USDT', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/312769/icon.png' },
      { id: 2485314946, name: 'Fry', symbol: 'FRY', decimals: 6, verified: true, image: '/assets/images/fry-token.png' },
      
      // Wrapped tokens
      { id: 386192725, name: 'Wrapped BTC', symbol: 'goBTC', decimals: 8, verified: true, image: 'https://asa-list.tinyman.org/assets/386192725/icon.png' },
      { id: 386195940, name: 'Wrapped ETH', symbol: 'goETH', decimals: 8, verified: true, image: 'https://asa-list.tinyman.org/assets/386195940/icon.png' },
      
      // DeFi tokens
      { id: 27165954, name: 'Planet', symbol: 'PLANET', decimals: 5, verified: true, image: 'https://asa-list.tinyman.org/assets/27165954/icon.png' },
      { id: 287867876, name: 'Opulous', symbol: 'OPUL', decimals: 10, verified: true, image: 'https://asa-list.tinyman.org/assets/287867876/icon.png' },
      { id: 684649988, name: 'GARD', symbol: 'GARD', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/684649988/icon.png' },
      { id: 465865291, name: 'STBL', symbol: 'STBL', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/465865291/icon.png' },
      { id: 244275365, name: 'Akita Inu', symbol: 'AKITA', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/244275365/icon.png' },
      { id: 77801156, name: 'Chip', symbol: 'CHIP', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/77801156/icon.png' },
      { id: 470842789, name: 'Defly', symbol: 'DEFLY', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/470842789/icon.png' },
      { id: 81288225, name: 'Algofi Token', symbol: 'ALGOFI', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/81288225/icon.png' },
      
      // Gaming tokens
      { id: 230946361, name: 'Smile Coin', symbol: 'SMILE', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/230946361/icon.png' },
      { id: 300208676, name: 'Headline', symbol: 'HDL', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/300208676/icon.png' },
      
      // Other popular tokens
      { id: 226701642, name: 'Yieldly', symbol: 'YLDY', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/226701642/icon.png' },
      { id: 137594422, name: 'Choice Coin', symbol: 'CHOICE', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/137594422/icon.png' },
      { id: 163650, name: 'Asia Reserve Currency Coin', symbol: 'ARCC', decimals: 6, verified: true, image: 'https://asa-list.tinyman.org/assets/163650/icon.png' },
      
      // Additional tokens from Vestige Labs example
      { id: 2160577481, name: 'Vestige Asset 1', symbol: 'VEST1', decimals: 6, verified: false, image: 'https://algorand-wallet-mainnet.b-cdn.net/media/asset_verification_requests_logo_png/2024/07/11/78e2639579994d42a81693041ee5ba2d.png?format=png&height=256&width=256' },
      { id: 2485202024, name: 'Vestige Asset 2', symbol: 'VEST2', decimals: 6, verified: false, image: 'https://algorand-wallet-mainnet.b-cdn.net/media/asset_verification_requests_logo_png/2024/11/13/52332bc56f244f59978fc93c39087713.png?format=png&height=256&width=256' }
    ];
  }

  /**
   * Convert Token to Currency format for the swap component
   */
  convertToCurrency(token: Token): Currency {
    return {
      id: token.id,
      code: token.symbol,
      label: token.name,
      img: token.image,
      decimals: token.decimals
    };
  }

  /**
   * Search for tokens by name using the backend API with caching
   */
  async searchTokens(tokenName: string): Promise<Token[]> {
    if (!tokenName || tokenName.trim().length === 0) {
      return [];
    }

    const normalizedQuery = tokenName.trim().toLowerCase();
    const now = Date.now();
    
    // Check search cache
    const cached = this.searchCache.get(normalizedQuery);
    if (cached && (now - cached.timestamp) < this.SEARCH_CACHE_DURATION) {
      return cached.tokens;
    }

    try {
      // Use the search API endpoint with timeout
      const response = await axios.get(`${this.baseUrl}/token/search/${encodeURIComponent(tokenName.trim())}`, {
        timeout: 8000, // 8 second timeout
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      const searchResults = response.data.data || response.data;

      // Convert search results to Token format, resolving images via Pera API
      const searchSettled = await Promise.allSettled(searchResults.map(async (token: any) => {
        const currentChain = typeof localStorage !== 'undefined' ? localStorage.getItem('fry-farm-chain-id') || 'algorand-mainnet' : 'algorand-mainnet';
        const image = await this.resolveTokenImage(token.tokenId, token.tokenImage, currentChain);

        return {
          id: token.tokenId,
          name: token.tokenName || `Asset ${token.tokenId}`,
          symbol: token.tokenSymbol || token.tokenName || 'UNKNOWN',
          decimals: token.decimals || 6,
          verified: token.verified || false,
          image,
          price: token.price,
          marketCap: token.marketCap,
          volume24h: token.volume1d,
          totalSupply: token.totalSupply,
          circulatingSupply: token.circulatingSupply,
          tvl: token.tvl,
          rank: token.rank,
          source: token.source || 'Search API'
        };
      }));
      const tokens = searchSettled
        .filter((r): r is PromiseFulfilledResult<Token> => r.status === 'fulfilled')
        .map(r => r.value);

      // Cache search results
      this.searchCache.set(normalizedQuery, {
        tokens,
        timestamp: now
      });
      
      // Limit cache size to prevent memory issues
      if (this.searchCache.size > 50) {
        const firstKey = this.searchCache.keys().next().value;
        if (firstKey !== undefined) {
          this.searchCache.delete(firstKey);
        }
      }

      return tokens;

    } catch (error) {
      console.error(`Failed to search tokens for "${tokenName}":`, error);

      // Try to search in cached tokens if available
      if (this.tokenCache) {
        const query = normalizedQuery;
        const localResults = this.tokenCache.filter(token =>
          token.name.toLowerCase().includes(query) ||
          token.symbol.toLowerCase().includes(query)
        );
        if (localResults.length > 0) {
          return localResults;
        }
      }

      // Fallback: search comprehensive and default token lists
      const allFallbackTokens = [
        ...this.getDefaultTokens(),
        ...this.getComprehensiveTokenList(),
      ];
      // Deduplicate by id
      const uniqueFallback = allFallbackTokens.filter((token, index, self) =>
        index === self.findIndex(t => t.id === token.id)
      );
      const fallbackResults = uniqueFallback.filter(token =>
        token.name.toLowerCase().includes(normalizedQuery) ||
        token.symbol.toLowerCase().includes(normalizedQuery)
      );
      if (fallbackResults.length > 0) {
        return fallbackResults;
      }

      return [];
    }
  }

  /**
   * Get tokens sorted by popularity/verification
   */
  async getTokensSorted(): Promise<{ all: Currency[], top: Currency[] }> {
    const tokens = await this.fetchAllTokens();
    
    // Convert to Currency format
    const currencies = tokens.map(token => this.convertToCurrency(token));
    
    // Remove duplicates by ID
    const uniqueCurrencies = currencies.filter((currency, index, self) => 
      index === self.findIndex(c => c.id === currency.id)
    );
    
    // Sort by verification status and popularity
    const sortedCurrencies = uniqueCurrencies.sort((a, b) => {
      // Get token data for sorting
      const aToken = tokens.find(t => t.id === a.id);
      const bToken = tokens.find(t => t.id === b.id);
      
      // Prioritize verified tokens
      const aVerified = aToken?.verified || false;
      const bVerified = bToken?.verified || false;
      
      if (aVerified && !bVerified) return -1;
      if (!aVerified && bVerified) return 1;
      
      // Then by rank (lower rank = higher priority)
      const aRank = aToken?.rank || 999999;
      const bRank = bToken?.rank || 999999;
      if (aRank !== bRank) return aRank - bRank;
      
      // Then by market cap (higher market cap = higher priority)
      const aMarketCap = aToken?.marketCap || 0;
      const bMarketCap = bToken?.marketCap || 0;
      if (aMarketCap !== bMarketCap) return bMarketCap - aMarketCap;
      
      // Finally by symbol (alphabetical)
      return a.code.localeCompare(b.code);
    });

    // Top tokens (first 20)
    const topTokens = sortedCurrencies.slice(0, 20);

    return {
      all: sortedCurrencies,
      top: topTokens
    };
  }
}

// Token interface matching Vestige Labs API response
interface Token {
  id: number;
  name: string;
  symbol: string;
  decimals: number;
  verified: boolean;
  image: string;
  price?: number;
  marketCap?: number;
  volume24h?: number;
  totalSupply?: number;
  circulatingSupply?: number;
  tvl?: number;
  rank?: number;
  source?: string;
}

// Currency interface (existing)
interface Currency {
  code: string;
  label: string;
  img: string;
  id: number;
  decimals: number;
}

const tokenServiceInstance = new TokenService();

export { TokenService, tokenServiceInstance };
export type { Token, Currency };
