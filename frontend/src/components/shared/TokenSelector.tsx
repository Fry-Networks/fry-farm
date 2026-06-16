import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { useDebounce } from '../../hooks/useDebounce';
import { lookupAsa, searchTokens, getDefaultTokens } from '../../services/TokenDiscoveryService';
import type { DiscoveredToken } from '../../services/TokenDiscoveryService';
import TokenImage from './TokenImage';

interface TokenSelectorProps {
  label: string;
  selected: DiscoveredToken | null;
  onSelect: (token: DiscoveredToken) => void;
  excludeIds?: number[];
}

const TokenSelector: React.FC<TokenSelectorProps> = ({ label, selected, onSelect, excludeIds = [] }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DiscoveredToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [defaultTokens, setDefaultTokens] = useState<DiscoveredToken[]>([]);

  const debouncedQuery = useDebounce(query, 400);

  // Keep excludeIds in a ref so it doesn't trigger the search effect
  const excludeIdsRef = useRef(excludeIds);
  excludeIdsRef.current = excludeIds;

  // Load default tokens on mount
  useEffect(() => {
    getDefaultTokens().then(setDefaultTokens).catch(() => {});
  }, []);

  // Single search effect — depends only on stable values
  useEffect(() => {
    const controller = new AbortController();
    const q = debouncedQuery.trim();
    const isNumeric = /^\d+$/.test(q);
    const currentExcludeIds = excludeIdsRef.current;

    if (!q) {
      setResults(defaultTokens.filter((t) => !currentExcludeIds.includes(t.id)));
      setError('');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    (async () => {
      try {
        if (isNumeric) {
          const token = await lookupAsa(Number(q));
          if (!cancelled) setResults([token]);
        } else if (q.length >= 2) {
          const tokens = await searchTokens(q);
          if (!cancelled) setResults(tokens.filter((t) => !currentExcludeIds.includes(t.id)));
        }
      } catch {
        if (!cancelled) {
          setError(isNumeric ? 'ASA not found' : 'Search failed');
          setResults([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [debouncedQuery, defaultTokens]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.token-selector-dropdown')) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="flex flex-col gap-[10px] relative token-selector-dropdown">
      <p className="large text-[var(--text-primary)]">{label}</p>
      <div
        className="flex items-center justify-between gap-[13px] cursor-pointer bg-[var(--input-bg)] w-full h-[54px] rounded-[6px] py-[9px] px-[12px]"
        onClick={() => setOpen(!open)}
      >
        {selected ? (
          <div className="flex items-center gap-[8px]">
            <TokenImage tokenId={selected.id} src={selected.image} symbol={selected.symbol} size={28} />
            <div className="flex flex-col">
              <p className="text-text_clr medium">{selected.name}</p>
              <p className="text-text_clr e-small">{selected.symbol} (ID: {selected.id})</p>
            </div>
          </div>
        ) : (
          <p className="text-gray-500">Select Token</p>
        )}
        <Icon icon={open ? 'mdi:chevron-up' : 'mdi:chevron-down'} width={24} />
      </div>

      {open && (
        <div className="absolute top-[80px] left-0 right-0 z-50 bg-[var(--bg-card)] rounded-[10px] shadow-lg p-3 max-h-[280px] overflow-y-auto custom-scrollbar">
          <div className="py-[7px] px-[9px] mb-[10px] flex items-center gap-[8px] rounded-[10px] bg-[var(--input-bg)] shadow-sm">
            <Icon icon="si:search-line" color="#A8A8A8" width={22} height={22} />
            <input
              type="text"
              placeholder="Search by name or paste ASA ID"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent focus:outline-none text-sm text-[var(--input-text)]"
              autoFocus
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600">
                <Icon icon="mdi:close" width={18} />
              </button>
            )}
          </div>

          {loading && (
            <div className="flex items-center justify-center py-3 text-blue-500 text-sm">
              <Icon icon="eos-icons:loading" width={20} className="mr-2" />
              Searching...
            </div>
          )}

          {error && !loading && (
            <div className="px-4 py-2 text-center text-red-500 text-sm">{error}</div>
          )}

          {!loading && !error && results.length === 0 && debouncedQuery.trim().length >= 2 && (
            <div className="px-4 py-3 text-center text-sm">
              <p className="text-gray-500">No tokens found for &ldquo;{debouncedQuery.trim()}&rdquo;</p>
              <p className="text-gray-400 mt-1">Try searching by ASA ID instead (e.g. 31566704)</p>
            </div>
          )}

          {!loading && !debouncedQuery.trim() && results.length > 0 && (
            <p className="px-2 pb-1 text-xs font-medium text-gray-400 uppercase tracking-wide">Popular Tokens</p>
          )}

          {!loading && results.map((token) => (
            <div
              key={token.id}
              className="flex items-center gap-2 p-2 hover:bg-gray-100 cursor-pointer rounded-md"
              onClick={() => {
                onSelect(token);
                setOpen(false);
                setQuery('');
                setResults([]);
              }}
            >
              <TokenImage tokenId={token.id} src={token.image} symbol={token.symbol} size={32} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{token.name}</p>
                <p className="text-xs text-gray-500">{token.symbol} &middot; ID: {token.id}</p>
              </div>
              {token.verified && (
                <Icon icon="mdi:check-circle" className="text-green-500" width={16} />
              )}
            </div>
          ))}

          {!debouncedQuery.trim() && results.length === 0 && (
            <div className="px-4 py-2 text-center text-gray-400 text-sm">
              Type a token name or paste an ASA ID
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TokenSelector;
