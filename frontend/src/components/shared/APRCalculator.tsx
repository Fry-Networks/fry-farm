import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '@iconify/react';

interface APRCalculatorProps {
  rewardTokenId?: number;
  rewardTokenSymbol?: string;
  rewardAmount?: number;
  durationDays?: number;
  mode?: 'full' | 'compact';
  onAprCalculated?: (apr: number) => void;
  className?: string;
}

const APRCalculator: React.FC<APRCalculatorProps> = ({
  rewardTokenId,
  rewardTokenSymbol,
  rewardAmount,
  durationDays,
  mode = 'full',
  onAprCalculated,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<'calcApr' | 'calcRewards'>('calcApr');
  const [expectedTVL, setExpectedTVL] = useState('');
  const [desiredApr, setDesiredApr] = useState('');
  const [rewardsTVL, setRewardsTVL] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [tokenPrice, setTokenPrice] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Fetch token price from Vestige API
  useEffect(() => {
    if (!rewardTokenId || rewardTokenId === 0) {
      setTokenPrice(null);
      return;
    }
    let cancelled = false;
    fetch(`${import.meta.env.VITE_API_BASE_URL}/tokens/price/${rewardTokenId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.price) {
          setTokenPrice(data.price);
        }
      })
      .catch(() => {
        if (!cancelled) setTokenPrice(null);
      });
    return () => { cancelled = true; };
  }, [rewardTokenId]);

  const calculateApr = useCallback((): number | null => {
    const tvl = Number(expectedTVL);
    if (!rewardAmount || !durationDays || !tvl || tvl <= 0 || durationDays <= 0) return null;
    return (rewardAmount / tvl) * 100 * (360 / durationDays);
  }, [expectedTVL, rewardAmount, durationDays]);

  const calculateRequiredRewards = useCallback((): number | null => {
    const apr = Number(desiredApr);
    const tvl = Number(rewardsTVL);
    if (!apr || !tvl || !durationDays || apr <= 0 || tvl <= 0 || durationDays <= 0) return null;
    return (apr / 100) * tvl * (durationDays / 360);
  }, [desiredApr, rewardsTVL, durationDays]);

  // Debounced APR callback
  useEffect(() => {
    if (activeTab !== 'calcApr' || !onAprCalculated) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const apr = calculateApr();
      if (apr !== null && apr > 0) {
        onAprCalculated(Math.floor(apr * 100));
      } else {
        onAprCalculated(0);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [expectedTVL, calculateApr, activeTab, onAprCalculated]);

  const apr = calculateApr();
  const requiredRewards = calculateRequiredRewards();

  const getAprWarning = (aprValue: number | null) => {
    if (aprValue === null) return null;
    if (aprValue > 10000) return { level: 'red', text: 'Extremely high APR — likely unsustainable' };
    if (aprValue > 1000) return { level: 'yellow', text: 'Very high APR' };
    if (aprValue < 1 && aprValue > 0) return { level: 'info', text: 'Low APR may not attract stakers' };
    return null;
  };

  const warning = activeTab === 'calcApr' ? getAprWarning(apr) : getAprWarning(Number(desiredApr) || null);

  const warningColors: Record<string, string> = {
    red: 'bg-red-100 text-red-700 border-red-300',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-300',
    info: 'bg-blue-50 text-blue-700 border-blue-300',
  };

  return (
    <div className={`rounded-xl border border-[var(--border-color)] overflow-hidden ${className}`}>
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon icon="mdi:calculator-variant" width={20} className="text-[var(--text-secondary)]" />
          <span className="font-medium text-sm text-[var(--text-primary)]">APR Calculator</span>
        </div>
        <Icon
          icon={isCollapsed ? 'mdi:chevron-down' : 'mdi:chevron-up'}
          width={20}
          className="text-[var(--text-secondary)]"
        />
      </button>

      {!isCollapsed && (
        <div className="p-4 flex flex-col gap-3">
          {/* Info */}
          {rewardAmount && durationDays ? (
            <p className="text-xs text-[var(--text-secondary)]">
              {Number(rewardAmount).toLocaleString()} {rewardTokenSymbol || 'tokens'} over {durationDays} days
              {tokenPrice ? ` (~$${(rewardAmount * tokenPrice).toFixed(2)} USD)` : ''}
            </p>
          ) : (
            <p className="text-xs text-[var(--text-secondary)]">
              Set reward token, amount, and duration in previous steps to use the calculator.
            </p>
          )}

          {/* Tabs */}
          {mode === 'full' && (
            <div className="flex rounded-lg overflow-hidden border border-[var(--border-color)]">
              <button
                onClick={() => setActiveTab('calcApr')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'calcApr'
                    ? 'bg-red text-white'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
                }`}
              >
                Calculate APR
              </button>
              <button
                onClick={() => setActiveTab('calcRewards')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'calcRewards'
                    ? 'bg-red text-white'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
                }`}
              >
                Calculate Rewards
              </button>
            </div>
          )}

          {/* Calculate APR tab */}
          {activeTab === 'calcApr' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                  Expected Total Staked {rewardTokenSymbol ? `(in ${rewardTokenSymbol})` : '(in tokens)'}
                </label>
                <input
                  type="number"
                  placeholder="e.g. 50000"
                  value={expectedTVL}
                  onChange={(e) => setExpectedTVL(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] text-[var(--input-text)] border border-[var(--border-color)] focus:outline-none text-sm"
                  min={0}
                />
                {expectedTVL && tokenPrice ? (
                  <p className="text-xs text-[var(--text-secondary)]">
                    ~${(Number(expectedTVL) * tokenPrice).toFixed(2)} USD
                  </p>
                ) : null}
              </div>

              {apr !== null && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--bg-secondary)]">
                  <Icon icon="mdi:percent" width={18} className="text-green" />
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    Estimated APR: <span className="text-green font-bold">{apr.toFixed(2)}%</span>
                  </span>
                  {onAprCalculated && (
                    <span className="text-xs text-[var(--text-secondary)] ml-auto">
                      Contract value: {Math.floor(apr * 100)}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Calculate Rewards tab */}
          {activeTab === 'calcRewards' && mode === 'full' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--text-secondary)]">Desired APR (%)</label>
                <input
                  type="number"
                  placeholder="e.g. 100"
                  value={desiredApr}
                  onChange={(e) => setDesiredApr(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] text-[var(--input-text)] border border-[var(--border-color)] focus:outline-none text-sm"
                  min={0}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                  Expected Total Staked {rewardTokenSymbol ? `(in ${rewardTokenSymbol})` : '(in tokens)'}
                </label>
                <input
                  type="number"
                  placeholder="e.g. 50000"
                  value={rewardsTVL}
                  onChange={(e) => setRewardsTVL(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] text-[var(--input-text)] border border-[var(--border-color)] focus:outline-none text-sm"
                  min={0}
                />
              </div>

              {requiredRewards !== null && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--bg-secondary)]">
                  <Icon icon="mdi:gift-outline" width={18} className="text-green" />
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    Required Rewards:{' '}
                    <span className="text-green font-bold">
                      {requiredRewards.toLocaleString(undefined, { maximumFractionDigits: 2 })}{' '}
                      {rewardTokenSymbol || 'tokens'}
                    </span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Warning */}
          {warning && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${warningColors[warning.level]}`}>
              <Icon
                icon={warning.level === 'red' ? 'mdi:alert-circle' : warning.level === 'yellow' ? 'mdi:alert' : 'mdi:information'}
                width={16}
              />
              {warning.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default APRCalculator;
