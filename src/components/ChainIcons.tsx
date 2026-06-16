import React from 'react';
import { ChainId } from '../config/chains';

const CHAIN_COLORS: Record<ChainId, string> = {
  'algorand-mainnet': '#00C2FF',
  'voi-mainnet': '#8B5CF6',
};

export const AlgorandIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <img
    src="/assets/icons/algo.png"
    alt="Algorand"
    width={size}
    height={size}
    className="rounded-full"
  />
);

export const VoiIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <img
    src="/assets/icons/voi.png"
    alt="Voi"
    width={size}
    height={size}
    className="rounded-full"
  />
);

export function getChainIcon(chainId: ChainId, size = 16): React.ReactNode {
  switch (chainId) {
    case 'algorand-mainnet': return <AlgorandIcon size={size} />;
    case 'voi-mainnet': return <VoiIcon size={size} />;
    default: return <AlgorandIcon size={size} />;
  }
}

export function getChainColor(chainId: ChainId): string {
  return CHAIN_COLORS[chainId] || '#00C2FF';
}
