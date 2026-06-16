import React, { useMemo, useState } from 'react';
import { Icon } from '@iconify/react';
import TokenSelector from './TokenSelector';
import TokenImage from './TokenImage';
import { lookupAsa, discoverLpTokens, searchTokens } from '../../services/TokenDiscoveryService';
import type { DiscoveredToken, LpPool } from '../../services/TokenDiscoveryService';

interface LPTokenSelectorProps {
  onSelect: (data: {
    lpTokenA: number;
    lpTokenB: number;
    lpAsaId?: number;
    dex?: string;
    pairName: string;
  } | null) => void;
}

type Mode = 'pair' | 'paste';

const LPTokenSelector: React.FC<LPTokenSelectorProps> = ({ onSelect }) => {
  const [mode, setMode] = useState<Mode>('pair');

  // Paste LP ASA ID mode
  const [pasteId, setPasteId] = useState('');
  const [pasteLoading, setPasteLoading] = useState(false);
  const [pasteToken, setPasteToken] = useState<DiscoveredToken | null>(null);
  const [pasteError, setPasteError] = useState('');
  const [pasteSelected, setPasteSelected] = useState(false);

  // Pair search mode
  const [tokenA, setTokenA] = useState<DiscoveredToken | null>(null);
  const [tokenB, setTokenB] = useState<DiscoveredToken | null>(null);
  const [pools, setPools] = useState<LpPool[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState('');
  const [selectedLpAsaId, setSelectedLpAsaId] = useState<number | null>(null);

  // Memoize excludeIds to prevent referential inequality triggering re-renders
  const excludeIdsA = useMemo(() => tokenB ? [tokenB.id] : [], [tokenB?.id]);
  const excludeIdsB = useMemo(() => tokenA ? [tokenA.id] : [], [tokenA?.id]);

  const handlePasteLookup = async () => {
    const id = Number(pasteId.trim());
    if (isNaN(id) || id < 0) {
      setPasteError('Enter a valid ASA ID');
      return;
    }
    setPasteLoading(true);
    setPasteError('');
    setPasteSelected(false);
    try {
      const token = await lookupAsa(id);
      setPasteToken(token);
    } catch {
      setPasteError('ASA not found');
      setPasteToken(null);
    } finally {
      setPasteLoading(false);
    }
  };

  const handlePasteSelect = async () => {
    if (!pasteToken) return;
    const id = pasteToken.id;
    setPasteSelected(true);

    // Try to resolve underlying pair from LP token name
    // Tinyman format: "TinymanPool2.0 FRY-USDC"
    let tokenAId = id;
    let tokenBId = id;
    let pairName = `${pasteToken.symbol} (LP)`;

    const match = pasteToken.name.match(/^TinymanPool[\d.]+\s+(.+)-(.+)$/);
    if (match) {
      const [, symbolA, symbolB] = match;
      try {
        const [tokensA, tokensB] = await Promise.all([
          searchTokens(symbolA),
          searchTokens(symbolB),
        ]);
        const foundA = tokensA.find(t => t.symbol.toUpperCase() === symbolA.toUpperCase());
        const foundB = tokensB.find(t => t.symbol.toUpperCase() === symbolB.toUpperCase());
        if (foundA && foundB) {
          tokenAId = foundA.id;
          tokenBId = foundB.id;
          pairName = `${foundA.symbol}/${foundB.symbol}`;
        }
      } catch (e) {
        console.warn('Failed to resolve LP pair tokens:', e);
      }
    }

    onSelect({
      lpTokenA: tokenAId,
      lpTokenB: tokenBId,
      lpAsaId: id,
      dex: pasteToken.name.includes('Tinyman') ? 'Tinyman' : undefined,
      pairName,
    });
  };

  const handleDiscover = async () => {
    if (!tokenA || !tokenB) return;
    setDiscovering(true);
    setDiscoverError('');
    setPools([]);
    setSelectedLpAsaId(null);
    try {
      const found = await discoverLpTokens(tokenA.id, tokenB.id);
      setPools(found);
      if (found.length === 0) {
        setDiscoverError('No LP pools found for this pair. You can enter an LP ASA ID manually.');
      }
    } catch {
      setDiscoverError('Discovery failed. Try pasting the LP ASA ID directly.');
    } finally {
      setDiscovering(false);
    }
  };

  const handlePoolSelect = (pool: LpPool) => {
    if (selectedLpAsaId === pool.lpAsaId) {
      setSelectedLpAsaId(null);
      onSelect(null);
      return;
    }
    setSelectedLpAsaId(pool.lpAsaId);
    onSelect({
      lpTokenA: pool.tokenA.id,
      lpTokenB: pool.tokenB.id,
      lpAsaId: pool.lpAsaId,
      dex: pool.dex,
      pairName: `${pool.tokenA.symbol}/${pool.tokenB.symbol}`,
    });
  };

  const handleSetTokenA = (token: DiscoveredToken) => {
    setTokenA(token);
    setSelectedLpAsaId(null);
  };

  const handleSetTokenB = (token: DiscoveredToken) => {
    setTokenB(token);
    setSelectedLpAsaId(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="large text-[var(--text-primary)]">Stake Token (LP Token)</p>

      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => {
            setMode('pair');
            setPasteId(''); setPasteToken(null); setPasteError(''); setPasteSelected(false);
          }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'pair' ? 'bg-blue-500 text-white' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
          }`}
        >
          Search by Pair
        </button>
        <button
          onClick={() => {
            setMode('paste');
            setTokenA(null); setTokenB(null); setPools([]); setDiscoverError('');
            setSelectedLpAsaId(null);
          }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'paste' ? 'bg-blue-500 text-white' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
          }`}
        >
          Paste LP ASA ID
        </button>
      </div>

      {mode === 'paste' && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="flex-1 bg-[var(--input-bg)] rounded-[6px] py-[9px] px-[12px]">
              <input
                type="number"
                placeholder="Enter LP Token ASA ID"
                value={pasteId}
                onChange={(e) => { setPasteId(e.target.value); setPasteSelected(false); setPasteToken(null); }}
                className="w-full bg-transparent focus:outline-none"
              />
            </div>
            <button
              onClick={handlePasteLookup}
              disabled={pasteLoading || !pasteId.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {pasteLoading ? 'Looking up...' : 'Look Up'}
            </button>
          </div>
          {pasteError && <p className="text-red-500 text-sm">{pasteError}</p>}
          {pasteToken && !pasteSelected && (
            <div className="flex items-center gap-3 p-3 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
              <TokenImage tokenId={pasteToken.id} src={pasteToken.image} symbol={pasteToken.symbol} size={36} />
              <div>
                <p className="font-medium text-[var(--text-primary)]">{pasteToken.name}</p>
                <p className="text-sm text-[var(--text-secondary)]">{pasteToken.symbol} &middot; ID: {pasteToken.id}</p>
              </div>
              <button
                onClick={handlePasteSelect}
                className="ml-auto px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"
              >
                Select This Token
              </button>
            </div>
          )}
          {pasteToken && pasteSelected && (
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
              <TokenImage tokenId={pasteToken.id} src={pasteToken.image} symbol={pasteToken.symbol} size={36} />
              <div>
                <p className="font-medium">{pasteToken.name}</p>
                <p className="text-sm text-gray-500">{pasteToken.symbol} &middot; ID: {pasteToken.id}</p>
              </div>
              <Icon icon="mdi:check-circle" className="text-green-500 ml-auto" width={20} />
            </div>
          )}
        </div>
      )}

      {mode === 'pair' && (
        <div className="flex flex-col gap-3">
          <TokenSelector
            label="Token A"
            selected={tokenA}
            onSelect={handleSetTokenA}
            excludeIds={excludeIdsA}
          />
          <TokenSelector
            label="Token B"
            selected={tokenB}
            onSelect={handleSetTokenB}
            excludeIds={excludeIdsB}
          />

          {tokenA && tokenB && (
            <button
              onClick={handleDiscover}
              disabled={discovering}
              className="w-full py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {discovering ? (
                <>
                  <Icon icon="eos-icons:loading" width={18} />
                  Discovering LP Pools...
                </>
              ) : (
                <>
                  <Icon icon="mdi:magnify" width={18} />
                  Discover LP Tokens
                </>
              )}
            </button>
          )}

          {discoverError && <p className="text-orange-500 text-sm">{discoverError}</p>}

          {pools.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-[var(--text-secondary)]">Found {pools.length} LP pool(s):</p>
              {pools.map((pool) => {
                const isSelected = selectedLpAsaId === pool.lpAsaId;
                return (
                  <div
                    key={pool.lpAsaId}
                    onClick={() => handlePoolSelect(pool)}
                    className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${
                      isSelected
                        ? 'border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md'
                        : 'border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-blue-400 hover:bg-[var(--bg-card-hover)]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-2">
                        <TokenImage tokenId={pool.tokenA.id} symbol={pool.tokenA.symbol} size={28} />
                        <TokenImage tokenId={pool.tokenB.id} symbol={pool.tokenB.symbol} size={28} />
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {pool.tokenA.symbol}/{pool.tokenB.symbol}
                        </p>
                        <p className="text-xs text-gray-500">LP ASA: {pool.lpAsaId}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        pool.dex === 'Tinyman' ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700'
                      }`}>
                        {pool.dex}
                      </span>
                      {isSelected && (
                        <Icon icon="mdi:check-circle" className="text-blue-500" width={20} />
                      )}
                    </div>
                  </div>
                );
              })}
              {selectedLpAsaId && pools.find(p => p.lpAsaId === selectedLpAsaId) && (() => {
                const pool = pools.find(p => p.lpAsaId === selectedLpAsaId)!;
                return (
                  <p className="text-sm text-green-600 dark:text-green-400 font-medium mt-1">
                    Selected: {pool.dex} {pool.tokenA.symbol}/{pool.tokenB.symbol} LP Token (ASA {pool.lpAsaId})
                  </p>
                );
              })()}
            </div>
          )}

          {/* Manual fallback when tokenA and tokenB are selected but no pools found */}
          {tokenA && tokenB && !discovering && pools.length === 0 && discoverError && (
            <div className="flex flex-col gap-2 mt-2">
              <p className="text-sm text-gray-600">Or use these tokens directly as the stake pair:</p>
              <button
                onClick={() => onSelect({
                  lpTokenA: tokenA.id,
                  lpTokenB: tokenB.id,
                  pairName: `${tokenA.symbol}/${tokenB.symbol}`,
                })}
                className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors"
              >
                Use {tokenA.symbol}/{tokenB.symbol} as stake pair
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LPTokenSelector;
