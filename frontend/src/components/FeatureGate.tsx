import React from 'react';
import { useChain } from '../context/ChainContext';
import { ChainFeatures } from '../config/chains';

interface FeatureGateProps {
  feature: keyof ChainFeatures;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  hideWhenUnavailable?: boolean;
}

export const FeatureGate: React.FC<FeatureGateProps> = ({
  feature,
  children,
  fallback,
  hideWhenUnavailable,
}) => {
  const { hasFeature, activeChain, switchChain } = useChain();

  if (hasFeature(feature)) {
    return <>{children}</>;
  }

  if (hideWhenUnavailable) {
    return null;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  const featureLabel = feature
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div
        className="max-w-md w-full rounded-xl p-8 text-center"
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
        }}
      >
        <div className="text-4xl mb-4">🔗</div>
        <h3
          className="text-xl font-semibold mb-2"
          style={{ color: 'var(--text-heading)' }}
        >
          {featureLabel} is not yet available on {activeChain.displayName}
        </h3>
        <p
          className="mb-6"
          style={{ color: 'var(--text-secondary)' }}
        >
          This feature is coming soon. Switch to Algorand to use {featureLabel.toLowerCase()}.
        </p>
        <div className="flex justify-center">
          <button
            onClick={() => switchChain('algorand-mainnet')}
            className="px-6 py-2.5 rounded-lg font-medium transition-colors"
            style={{
              backgroundColor: '#00C2FF',
              color: 'white',
            }}
          >
            Switch to Algorand
          </button>
        </div>
      </div>
    </div>
  );
};
