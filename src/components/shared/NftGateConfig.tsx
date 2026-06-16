import React, { useState } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'react-toastify';
import axios from 'axios';
import Input from './input';

export interface GateConfig {
  nftAsaId: number;
  nftCreatorAddress: string;
  collectionName: string;
  minNftCount: number;
  gateMessage: string;
}

interface NftGateConfigProps {
  isGated: boolean;
  setIsGated: (v: boolean) => void;
  gateConfig: GateConfig;
  setGateConfig: (v: GateConfig) => void;
}

interface CollectionInfo {
  creator: string;
  collectionName: string;
  totalCount: number;
  sampleAssets: { id: number; name: string; unitName: string }[];
}

const NftGateConfig: React.FC<NftGateConfigProps> = ({
  isGated,
  setIsGated,
  gateConfig,
  setGateConfig,
}) => {
  const [isLooking, setIsLooking] = useState(false);
  const [collectionInfo, setCollectionInfo] = useState<CollectionInfo | null>(null);
  const [asaInput, setAsaInput] = useState(gateConfig.nftAsaId > 0 ? String(gateConfig.nftAsaId) : '');

  const lookupCollection = async () => {
    const asaId = Number(asaInput);
    if (!asaId || asaId <= 0) {
      toast.error('Please enter a valid ASA ID.');
      return;
    }

    setIsLooking(true);
    setCollectionInfo(null);
    try {
      const resp = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/tokens/nft-collection`, {
        params: { asaId },
        timeout: 10000,
      });
      const data = resp.data?.data;
      if (data) {
        setCollectionInfo(data);
        setGateConfig({
          ...gateConfig,
          nftAsaId: asaId,
          nftCreatorAddress: data.creator,
          collectionName: data.collectionName,
          gateMessage: `This pool requires a ${data.collectionName} NFT to participate.`,
        });
        toast.success(`Collection found: ${data.collectionName}`);
      } else {
        toast.warning('No collection data found for this ASA.');
      }
    } catch (err) {
      toast.error('Failed to look up collection. Check the ASA ID.');
    } finally {
      setIsLooking(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-xl p-4 mt-4" onKeyDown={(e) => e.stopPropagation()}>
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsGated(!isGated)}
      >
        <div className="flex items-center gap-2">
          <Icon icon="mdi:shield-lock-outline" width={20} height={20} className="text-purple-500" />
          <span className="text-sm font-medium text-[var(--text-primary)]">
            NFT Gating
          </span>
        </div>
        <div
          className={`w-10 h-5 rounded-full transition-colors duration-200 relative ${
            isGated ? 'bg-purple-500' : 'bg-gray-300'
          }`}
        >
          <div
            className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform duration-200 ${
              isGated ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </div>
      </div>

      {isGated && (
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">NFT ASA ID</label>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="e.g. 123456789"
                value={asaInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  setAsaInput(val);
                  setGateConfig({ ...gateConfig, nftAsaId: Number(val) || 0 });
                }}
                className="flex-1"
              />
              <button
                onClick={lookupCollection}
                disabled={isLooking}
                className="px-3 py-2 text-xs font-medium text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-50"
              >
                {isLooking ? 'Looking...' : 'Look Up'}
              </button>
            </div>
          </div>

          {collectionInfo && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-sm font-medium text-purple-700">{collectionInfo.collectionName}</p>
              <p className="text-xs text-purple-600 mt-1">
                Creator: {collectionInfo.creator.slice(0, 8)}...{collectionInfo.creator.slice(-6)}
              </p>
              <p className="text-xs text-purple-600">
                {collectionInfo.totalCount}+ ASAs found from this creator
              </p>
            </div>
          )}

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Minimum NFTs Required</label>
            <Input
              type="number"
              min={1}
              value={gateConfig.minNftCount}
              onChange={(e) =>
                setGateConfig({ ...gateConfig, minNftCount: Math.max(1, Number(e.target.value)) })
              }
              className="w-24"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default NftGateConfig;
