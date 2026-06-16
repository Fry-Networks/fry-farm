import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@iconify/react';
import { useChain } from '../context/ChainContext';
import { getChainIcon, getChainColor } from './ChainIcons';
import { ChainId } from '../config/chains';

const ChainSelector: React.FC = () => {
  const { activeChain, chainId, availableChains, switchChain } = useChain();
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setIsOpen(false), []);

  // Close on click outside (check both button and portal dropdown)
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        (!dropdownRef.current || !dropdownRef.current.contains(target)) &&
        (!buttonRef.current || !buttonRef.current.contains(target))
      ) {
        close();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, close]);

  // Close on scroll or resize
  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [isOpen, close]);

  const handleToggle = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const DROPDOWN_W = 192; // w-48
      const MARGIN = 8;
      let left = rect.right - DROPDOWN_W; // right-align to button
      if (left < MARGIN) left = MARGIN;
      if (left + DROPDOWN_W > window.innerWidth - MARGIN) {
        left = window.innerWidth - DROPDOWN_W - MARGIN;
      }
      setDropdownPos({ top: rect.bottom + 8, left });
    }
    setIsOpen(!isOpen);
  };

  const handleSelect = (newChainId: ChainId) => {
    switchChain(newChainId);
    setIsOpen(false);
  };

  return (
    <div className="inline-block shrink-0">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors cursor-pointer shrink-0 whitespace-nowrap"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border-color)',
          color: 'var(--text-primary)',
        }}
      >
        {getChainIcon(chainId, 16)}
        <span className="text-sm font-medium hidden sm:inline">{activeChain.displayName}</span>
        <Icon
          icon={isOpen ? 'mdi:chevron-up' : 'mdi:chevron-down'}
          width={16}
          height={16}
          style={{ color: 'var(--text-secondary)' }}
        />
      </button>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="w-48 rounded-lg shadow-lg overflow-hidden"
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            left: dropdownPos.left,
            zIndex: 9999,
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
          }}
        >
          {availableChains.map((chain) => {
            const isActive = chain.chainId === chainId;
            return (
              <button
                key={chain.chainId}
                onClick={() => handleSelect(chain.chainId)}
                className="flex items-center gap-3 w-full px-4 py-3 text-left transition-colors"
                style={{
                  backgroundColor: isActive ? 'var(--bg-card-hover)' : 'transparent',
                  color: 'var(--text-primary)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {getChainIcon(chain.chainId, 18)}
                <div className="flex-1">
                  <div className="text-sm font-medium">{chain.displayName}</div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {chain.nativeAsset.symbol}
                  </div>
                </div>
                {isActive && (
                  <Icon icon="mdi:check" width={18} style={{ color: getChainColor(chain.chainId) }} />
                )}
                {!isActive && !Object.values(chain.features).some(Boolean) && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: getChainColor(chain.chainId) + '20',
                      color: getChainColor(chain.chainId),
                    }}
                  >
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
};

export default ChainSelector;
