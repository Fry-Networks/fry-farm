import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Icon } from '@iconify/react';
import axios from 'axios';
import type { ChainId } from '../../config/chains/types';

const NFT_NAVIGATOR_API = 'https://arc72-idx.nftnavigator.xyz/nft-indexer/v1';
const API_BASE = import.meta.env.VITE_API_BASE_URL as string;

export interface NftCollection {
  contractId: number;
  name: string;
  totalSupply: number;
  image: string;
  creator: string;
}

interface CollectionSelectorProps {
  label?: string;
  selected: NftCollection | null;
  onSelect: (collection: NftCollection) => void;
  chainId?: ChainId;
}

function parseVoiCollection(raw: any): NftCollection {
  let name = '(unknown)';
  let image = '';
  try {
    const meta = typeof raw.firstToken?.metadata === 'string'
      ? JSON.parse(raw.firstToken.metadata)
      : raw.firstToken?.metadata || {};
    name = (meta.name || '').replace(/\s*#?\d+$/, '').trim() || '(unknown)';
    image = meta.image || '';
  } catch { /* ignore */ }
  return {
    contractId: raw.contractId,
    name,
    totalSupply: raw.totalSupply || 0,
    image,
    creator: raw.creator || '',
  };
}

function parseAlgorandCollection(raw: any): NftCollection {
  return {
    contractId: 0, // Algorand collections don't have a contract ID
    name: raw.name || '(unknown)',
    totalSupply: raw.totalSupply || 0,
    image: raw.imageUrl || '',
    creator: raw.creatorAddress || '',
  };
}

const CollectionSelector: React.FC<CollectionSelectorProps> = ({ label = 'Collection', selected, onSelect, chainId = 'algorand-mainnet' }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [allCollections, setAllCollections] = useState<NftCollection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const mountedRef = useRef(true);

  // Fetch collections — Voi from NFT Navigator, Algorand from our backend
  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    setError('');
    setAllCollections([]);

    if (chainId === 'voi-mainnet') {
      axios.get(`${NFT_NAVIGATOR_API}/collections?limit=200`, { timeout: 15000 })
        .then((res) => {
          if (!mountedRef.current) return;
          const colls = (res.data.collections || [])
            .map(parseVoiCollection)
            .filter((c: NftCollection) => c.totalSupply > 0 && c.name !== '(unknown)');
          setAllCollections(colls);
          setLoading(false);
        })
        .catch(() => {
          if (!mountedRef.current) return;
          setError('Failed to load collections');
          setLoading(false);
        });
    } else {
      // Algorand — fetch from our backend API
      const chainHeader = localStorage.getItem('fry-farm-chain-id') || 'algorand-mainnet';
      axios.get(`${API_BASE}/nftcollections/all`, {
        headers: { 'X-Chain-Id': chainHeader },
        timeout: 15000,
      })
        .then((res) => {
          if (!mountedRef.current) return;
          const colls = (res.data.data || [])
            .map(parseAlgorandCollection)
            .filter((c: NftCollection) => c.totalSupply > 0 && c.name !== '(unknown)');
          setAllCollections(colls);
          setLoading(false);
        })
        .catch(() => {
          if (!mountedRef.current) return;
          setError('Failed to load collections');
          setLoading(false);
        });
    }

    return () => { mountedRef.current = false; };
  }, [chainId]);

  // Client-side filter
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allCollections;
    if (/^\d+$/.test(q)) {
      // Search by contract ID (Voi) or in creator address (Algorand)
      return allCollections.filter((c) =>
        String(c.contractId).includes(q) || c.creator.includes(q)
      );
    }
    return allCollections.filter((c) => c.name.toLowerCase().includes(q));
  }, [query, allCollections]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.collection-selector-dropdown')) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Display ID — contract ID for Voi, creator address for Algorand
  const getDisplayId = (coll: NftCollection) => {
    if (chainId === 'voi-mainnet') return `ID: ${coll.contractId}`;
    return coll.creator ? `${coll.creator.slice(0, 8)}...${coll.creator.slice(-4)}` : '';
  };

  return (
    <div className="flex flex-col gap-[10px] relative collection-selector-dropdown">
      <p className="large text-[var(--text-primary)]">{label}</p>
      <div
        className="flex items-center justify-between gap-[13px] cursor-pointer bg-[var(--input-bg)] w-full h-[54px] rounded-[6px] py-[9px] px-[12px]"
        onClick={() => setOpen(!open)}
      >
        {selected ? (
          <div className="flex items-center gap-[8px]">
            {selected.image && (
              <img src={selected.image} alt="" className="w-7 h-7 rounded-md object-cover" />
            )}
            <div className="flex flex-col">
              <p className="text-text_clr medium">{selected.name}</p>
              <p className="text-text_clr e-small">{getDisplayId(selected)} &middot; {selected.totalSupply} NFTs</p>
            </div>
          </div>
        ) : (
          <p className="text-gray-500">Select Collection</p>
        )}
        <Icon icon={open ? 'mdi:chevron-up' : 'mdi:chevron-down'} width={24} />
      </div>

      {open && (
        <div className="absolute top-[80px] left-0 right-0 z-50 bg-[var(--bg-card)] rounded-[10px] shadow-lg p-3 max-h-[280px] overflow-y-auto custom-scrollbar">
          <div className="py-[7px] px-[9px] mb-[10px] flex items-center gap-[8px] rounded-[10px] bg-[var(--input-bg)] shadow-sm">
            <Icon icon="si:search-line" color="#A8A8A8" width={22} height={22} />
            <input
              type="text"
              placeholder={chainId === 'voi-mainnet' ? 'Search by name or contract ID' : 'Search by name or creator address'}
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
              Loading collections...
            </div>
          )}

          {error && !loading && (
            <div className="px-4 py-2 text-center text-red-500 text-sm">{error}</div>
          )}

          {!loading && !error && filtered.length === 0 && query.trim() && (
            <div className="px-4 py-3 text-center text-sm">
              <p className="text-gray-500">No collections found for &ldquo;{query.trim()}&rdquo;</p>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && !query.trim() && (
            <div className="px-4 py-3 text-center text-sm">
              <p className="text-gray-500">No collections indexed yet</p>
            </div>
          )}

          {!loading && filtered.map((coll, idx) => (
            <div
              key={coll.contractId || coll.creator || idx}
              className="flex items-center gap-2 p-2 hover:bg-[var(--bg-card-hover)] cursor-pointer rounded-md"
              onClick={() => {
                onSelect(coll);
                setOpen(false);
                setQuery('');
              }}
            >
              {coll.image ? (
                <img src={coll.image} alt="" className="w-8 h-8 rounded-md object-cover flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-md bg-gray-200 flex items-center justify-center flex-shrink-0">
                  <Icon icon="mdi:image-off-outline" width={16} className="text-gray-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{coll.name}</p>
                <p className="text-xs text-gray-500">{getDisplayId(coll)} &middot; {coll.totalSupply} NFTs</p>
              </div>
              {coll.contractId === 0 && coll.creator && (
                <span className="text-xs text-gray-400 flex-shrink-0">ASA</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CollectionSelector;
