import React, { useEffect, useRef, useState } from 'react';
import { useChain } from '../../context/ChainContext';

const PLACEHOLDER_COLORS = [
  '#6366F1', '#EC4899', '#F59E0B', '#10B981',
  '#3B82F6', '#8B5CF6', '#EF4444', '#14B8A6',
];

function colorFromId(tokenId: number): string {
  return PLACEHOLDER_COLORS[Math.abs(tokenId) % PLACEHOLDER_COLORS.length];
}

interface TokenImageProps {
  tokenId: number;
  src?: string;
  symbol?: string;
  size?: number;
  className?: string;
}

const TokenImage: React.FC<TokenImageProps> = ({ tokenId, src, symbol, size = 40, className = '' }) => {
  const { chainId } = useChain();
  const [fallbackStage, setFallbackStage] = useState(0);
  const imgRef = useRef<HTMLImageElement | null>(null);
  // 0 = original src, 1 = Tinyman CDN, 2 = colored circle

  const tinymanUrl = `https://asa-list.tinyman.org/assets/${tokenId}/icon.png`;
  const nautilusUrl = `https://asset-verification.nautilus.sh/icons/${tokenId}.png`;

  const sources: string[] = [];
  if (src) sources.push(src);
  if (chainId === 'voi-mainnet') {
    sources.push(nautilusUrl);
  } else {
    sources.push(tinymanUrl);
  }
  const currentSrc = fallbackStage < sources.length ? sources[fallbackStage] : null;

  // Reset fallback when props change (prevents stale state when reused for different tokens)
  useEffect(() => {
    setFallbackStage(0);
  }, [src, tokenId]);

  // Force fallback if image hangs for more than 5s
  useEffect(() => {
    if (!currentSrc) return;
    const timer = setTimeout(() => {
      if (imgRef.current && !imgRef.current.complete) {
        setFallbackStage((prev) => prev + 1);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [currentSrc]);

  const handleError = () => {
    setFallbackStage((prev) => prev + 1);
  };

  if (!currentSrc) {
    const letter = (symbol || '?')[0].toUpperCase();
    const bg = colorFromId(tokenId);
    return (
      <div
        className={`rounded-full flex items-center justify-center text-white font-bold ${className}`}
        style={{ width: size, height: size, backgroundColor: bg, fontSize: size * 0.4 }}
      >
        {letter}
      </div>
    );
  }

  return (
    <img
      ref={imgRef}
      src={currentSrc}
      alt={symbol || `Token ${tokenId}`}
      className={`rounded-full ${className}`}
      style={{ width: size, height: size, objectFit: 'cover' }}
      loading="lazy"
      decoding="async"
      onError={handleError}
    />
  );
};

export default TokenImage;
