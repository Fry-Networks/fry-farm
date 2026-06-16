import React, { useState, useMemo, useEffect } from 'react';
import { Modal, Steps, DatePicker } from 'antd';
import { Icon } from '@iconify/react';
import { toast } from 'react-toastify';
import dayjs from 'dayjs';
import { useMultiChainWallet } from '../../hooks/useMultiChainWallet';
import { useChain } from '../../context/ChainContext';
import { initStaking } from '../../staking_func';
import { authAxios } from '../../services/apiClient';
import { logFee } from '../../utils/logFee';
import { useAuth } from '../../hooks/useAuth';
import { fetchFeeConfig, calculateFeeSimple, routeFeeViaRouter } from '../../services/FeeService';
import * as algokit from '@algorandfoundation/algokit-utils';
import algosdk from 'algosdk';
import TokenSelector from '../../components/shared/TokenSelector';
import TokenImage from '../../components/shared/TokenImage';
import type { DiscoveredToken } from '../../services/TokenDiscoveryService';
import Input from '../../components/shared/input';
import Button from '../../components/shared/button';
import NftGateConfig from '../../components/shared/NftGateConfig';
import type { GateConfig } from '../../components/shared/NftGateConfig';

interface CreateStakeWizardProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  fetchData: () => void;
}

const DURATION_OPTIONS = [
  { label: '7 Days', value: 7 },
  { label: '14 Days', value: 14 },
  { label: '30 Days', value: 30 },
  { label: '60 Days', value: 60 },
  { label: '90 Days', value: 90 },
  { label: 'Custom', value: -1 },
];

const LOCK_OPTIONS = [
  { label: 'None', value: 0 },
  { label: '7 Days', value: 7 },
  { label: '14 Days', value: 14 },
  { label: '30 Days', value: 30 },
  { label: 'Custom', value: -1 },
];

const APR_PRESETS = [
  { label: '10%', value: 10 }, { label: '25%', value: 25 }, { label: '50%', value: 50 },
  { label: '100%', value: 100 }, { label: '200%', value: 200 }, { label: '500%', value: 500 },
];

const TVL_PRESETS = [
  { label: '$1K', value: 1000 }, { label: '$5K', value: 5000 }, { label: '$10K', value: 10000 },
  { label: '$50K', value: 50000 }, { label: '$100K', value: 100000 },
];

const CreateStakeWizard: React.FC<CreateStakeWizardProps> = ({
  isOpen,
  setIsOpen,
  fetchData,
}) => {
  const { signer: multiSigner, activeAddress } = useMultiChainWallet();
  const signer = multiSigner!;
  const { ensureAuth } = useAuth();
  const { activeChain } = useChain();

  // Build chain-aware algod config
  const chainAlgodConfig = 'algodServer' in (activeChain?.connection as any || {})
    ? { server: (activeChain.connection as any).algodServer, port: (activeChain.connection as any).algodPort, token: (activeChain.connection as any).algodToken }
    : undefined;
  const isWalletConnected = !!activeAddress && !!signer;

  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 0: Stake token
  const [stakeToken, setStakeToken] = useState<DiscoveredToken | null>(null);

  // Step 1: Reward token
  const [rewardToken, setRewardToken] = useState<DiscoveredToken | null>(null);

  // Step 2: Timing
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [durationOption, setDurationOption] = useState<number>(30);
  const [customDuration, setCustomDuration] = useState('');
  const [lockOption, setLockOption] = useState<number>(0);
  const [customLock, setCustomLock] = useState('');

  // Step 3: APR-driven
  const [desiredApr, setDesiredApr] = useState('');
  const [tvlEstimate, setTvlEstimate] = useState('');
  const [rewardTokenPrice, setRewardTokenPrice] = useState<number | null>(null);
  const [manualTokenPrice, setManualTokenPrice] = useState('');
  const [isPriceFetching, setIsPriceFetching] = useState(false);
  const [rewardAmount, setRewardAmount] = useState('');
  const [isRewardOverridden, setIsRewardOverridden] = useState(false);

  // NFT Gating
  const [isGated, setIsGated] = useState(false);
  const [gateConfig, setGateConfig] = useState<GateConfig>({
    nftAsaId: 0,
    nftCreatorAddress: '',
    collectionName: '',
    minNftCount: 1,
    gateMessage: 'This pool requires an NFT to participate.',
  });

  // Computed
  const actualDuration = durationOption === -1 ? Number(customDuration) : durationOption;
  const actualLock = lockOption === -1 ? Number(customLock) : lockOption;
  const effectivePrice = rewardTokenPrice ?? (Number(manualTokenPrice) || null);

  const computedRewardAmount = useMemo(() => {
    const apr = Number(desiredApr);
    const tvl = Number(tvlEstimate);
    const price = effectivePrice;
    if (!apr || !tvl || !price || !actualDuration || apr <= 0 || tvl <= 0 || price <= 0) return null;
    return (apr / 100) * (tvl / price) * (actualDuration / 360);
  }, [desiredApr, tvlEstimate, effectivePrice, actualDuration]);

  // Fetch reward token price via backend proxy
  useEffect(() => {
    if (!rewardToken?.id) {
      setRewardTokenPrice(null);
      return;
    }
    let cancelled = false;
    setIsPriceFetching(true);
    fetch(`${import.meta.env.VITE_API_BASE_URL}/tokens/price/${rewardToken.id}`)
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data?.price) {
          setRewardTokenPrice(data.price);
        }
      })
      .catch(() => {
        if (!cancelled) setRewardTokenPrice(null);
      })
      .finally(() => {
        if (!cancelled) setIsPriceFetching(false);
      });
    return () => { cancelled = true; };
  }, [rewardToken?.id]);

  // Sync computed reward amount when not overridden
  useEffect(() => {
    if (computedRewardAmount !== null && !isRewardOverridden) {
      setRewardAmount(String(Math.round(computedRewardAmount * 100) / 100));
    }
  }, [computedRewardAmount, isRewardOverridden]);

  const resetForm = () => {
    setCurrentStep(0);
    setStakeToken(null);
    setRewardToken(null);
    setStartDate(null);
    setDurationOption(30);
    setCustomDuration('');
    setLockOption(0);
    setCustomLock('');
    setDesiredApr('');
    setTvlEstimate('');
    setRewardTokenPrice(null);
    setManualTokenPrice('');
    setIsPriceFetching(false);
    setRewardAmount('');
    setIsRewardOverridden(false);
  };

  const canProceed = (step: number): boolean => {
    switch (step) {
      case 0:
        return stakeToken !== null;
      case 1:
        return rewardToken !== null;
      case 2:
        return startDate !== null && actualDuration > 0;
      case 3:
        return Number(desiredApr) > 0 && Number(rewardAmount) > 0;
      default:
        return true;
    }
  };

  const handleDeploy = async () => {
    if (!signer || !activeAddress) {
      toast.error('Wallet not connected.');
      return;
    }
    if (!stakeToken || !rewardToken || !startDate) {
      toast.error('Please complete all steps.');
      return;
    }

    setIsSubmitting(true);

    try {
      await ensureAuth();

      const start = Math.floor(startDate.getTime() / 1000);
      const durationSeconds = actualDuration * 86400;
      const lockPeriodSeconds = actualLock * 86400;

      const rewardAmountMicro = Number(rewardAmount) * 1_000_000;

      // Pool creation fee: 0.5% of reward tokens
      const feeConfig = await fetchFeeConfig();
      const feeCalc = calculateFeeSimple('poolCreation', rewardAmountMicro, feeConfig, activeChain?.feeRecipient);

      if (feeCalc.feeAmount > 0) {
        const algodConfig = chainAlgodConfig
          ? { ...chainAlgodConfig, network: '' }
          : { server: import.meta.env.VITE_ALGOD_SERVER, port: import.meta.env.VITE_ALGOD_PORT, token: import.meta.env.VITE_ALGOD_TOKEN, network: '' };
        const algorandClient = algokit.AlgorandClient.fromConfig({ algodConfig });
        algorandClient.setDefaultSigner(signer);
        const algodClient = new algosdk.Algodv2(algodConfig.token, algodConfig.server, algodConfig.port);

        await routeFeeViaRouter(activeAddress, signer, feeCalc.feeAmount, rewardToken.id, algodClient, activeChain?.feeRouterAppId, activeChain?.feeRouterAddr);

        await logFee({
          appId: 0,
          userId: activeAddress,
          gasAmount: feeCalc.feeAmount,
          gasType: 'poolCreationFee',
          feeType: 'percentage',
        });

        toast.info(`Pool creation fee: ${(feeCalc.feeAmount / 1_000_000).toFixed(2)} ${rewardToken.symbol || 'tokens'} (${feeCalc.feePercent}%)`);
      }

      const appId = await initStaking(
        stakeToken.id,
        rewardToken.id,
        feeCalc.netAmount,
        durationSeconds,
        start,
        lockPeriodSeconds,
        activeAddress,
        signer,
        chainAlgodConfig,
      );

      if (!appId) throw new Error('App ID not returned from contract.');

      const payload = {
        creatorId: activeAddress,
        stakeToken: { id: String(stakeToken.id), name: stakeToken.name },
        rewardToken: { id: String(rewardToken.id), name: rewardToken.name },
        stakingStartTime: start,
        stakingEndTime: start + durationSeconds,
        duration: durationSeconds,
        aprRate: Math.floor(Number(desiredApr) * 100) / 100,
        rewardTokenAmount: feeCalc.netAmount,
        stakingContractId: String(appId),
        lockPeriod: lockPeriodSeconds,
        isGated,
        gateConfig: isGated ? gateConfig : {},
        contractVersion: 3,
      };

      const response = await authAxios.post('/staking/add', payload);

      if (response.status >= 200 && response.status < 300) {
        toast.success('Staking pool created successfully!');
        resetForm();
        setIsOpen(false);
        fetchData();
      } else {
        toast.warning('Staking pool created on-chain but failed to save to DB.');
      }
    } catch (e) {
      console.error('Error creating staking pool:', e);
      handleDeployError(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeployError = (e: unknown) => {
    let errorMessage = 'Transaction failed or was rejected.';
    let errorDetails = '';

    if (e instanceof Error) {
      const msg = e.message;

      if (msg.includes('balance') && (msg.includes('below min') || msg.includes('below minimum'))) {
        const balanceMatch = msg.match(/balance\s+(\d+)\s+below\s+(?:min|minimum)\s+(\d+)/i);
        if (balanceMatch) {
          const current = (parseInt(balanceMatch[1]) / 1_000_000).toFixed(2);
          const min = (parseInt(balanceMatch[2]) / 1_000_000).toFixed(2);
          const needed = ((parseInt(balanceMatch[2]) - parseInt(balanceMatch[1])) / 1_000_000).toFixed(2);
          errorMessage = 'Insufficient ALGO Balance';
          errorDetails = `Current: ${current} ALGO, Required: ${min} ALGO. Need ${needed} more ALGO.`;
        }
      } else if (msg.includes('does not exist') || msg.includes('has been deleted')) {
        errorMessage = 'Invalid Token';
        errorDetails = 'One of the selected tokens does not exist on Algorand.';
      } else if (msg.includes('rejected') || msg.includes('User rejected')) {
        errorMessage = 'Transaction Rejected';
        errorDetails = 'The transaction was rejected. Please try again.';
      } else if (msg.includes('cancelled') || msg.includes('CANCELLED')) {
        return;
      } else {
        errorMessage = 'Transaction Error';
        errorDetails = msg;
      }
    }

    const fullMsg = errorDetails ? `${errorMessage}\n\n${errorDetails}` : errorMessage;
    toast.error(fullMsg, {
      autoClose: 8000,
      style: { whiteSpace: 'pre-line', maxWidth: '400px' },
    });
  };

  const steps = [
    { title: 'Stake Token' },
    { title: 'Reward Token' },
    { title: 'Timing' },
    { title: 'Set Your APR' },
    { title: 'Review' },
  ];

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="flex flex-col gap-4">
            <p className="text-[var(--text-secondary)] text-sm">Choose what token users will stake in your pool.</p>
            <TokenSelector label="Stake Token" selected={stakeToken} onSelect={setStakeToken} />
          </div>
        );

      case 1:
        return (
          <div className="flex flex-col gap-4">
            <p className="text-[var(--text-secondary)] text-sm">Choose the token that will be distributed as rewards.</p>
            <TokenSelector label="Reward Token" selected={rewardToken} onSelect={setRewardToken} />
          </div>
        );

      case 2:
        return (
          <div className="flex flex-col gap-4">
            <p className="text-[var(--text-secondary)] text-sm">Set when the pool starts, how long it runs, and the lock period.</p>

            <div className="flex flex-col gap-[10px]">
              <p className="large text-[var(--text-primary)]">Start Date</p>
              <DatePicker
                className="w-full"
                value={startDate ? dayjs(startDate) : null}
                onChange={(date) => setStartDate(date?.toDate() || null)}
                disabledDate={(current) => current && current < dayjs().startOf('day')}
                placeholder="Select start date"
              />
            </div>

            <div className="flex flex-col gap-[10px]">
              <p className="large text-[var(--text-primary)]">Duration</p>
              <div className="grid grid-cols-3 gap-2">
                {DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDurationOption(opt.value)}
                    className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      durationOption === opt.value
                        ? 'bg-blue-500 text-white'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {durationOption === -1 && (
                <div className="algo-div flex gap-[10px] items-center justify-between bg-[var(--input-bg)] rounded-[12px] pl-[0px] pr-[18px] py-[7px]">
                  <Input
                    type="number"
                    placeholder="Custom duration"
                    value={customDuration}
                    onChange={(e) => setCustomDuration(e.target.value)}
                    className="input-wrapper text-[16px] w-full"
                    min={1}
                  />
                  <p className="text-text_clr medium">Days</p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-[10px]">
              <p className="large text-[var(--text-primary)]">Lock Period</p>
              <div className="grid grid-cols-3 gap-2">
                {LOCK_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setLockOption(opt.value)}
                    className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      lockOption === opt.value
                        ? 'bg-blue-500 text-white'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {lockOption === -1 && (
                <div className="algo-div flex gap-[10px] items-center justify-between bg-[var(--input-bg)] rounded-[12px] pl-[0px] pr-[18px] py-[7px]">
                  <Input
                    type="number"
                    placeholder="Custom lock period"
                    value={customLock}
                    onChange={(e) => setCustomLock(e.target.value)}
                    className="input-wrapper text-[16px] w-full"
                    min={0}
                  />
                  <p className="text-text_clr medium">Days</p>
                </div>
              )}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="flex flex-col gap-4">
            {/* Desired APR */}
            <div className="flex flex-col gap-[10px]">
              <p className="large text-[var(--text-primary)]">Desired APR</p>
              <div className="flex items-center gap-2 bg-[var(--input-bg)] rounded-[12px] p-[7px] pr-[14px]">
                <Input
                  type="number"
                  placeholder="Enter APR"
                  value={desiredApr}
                  onChange={(e) => setDesiredApr(e.target.value)}
                  className="input-wrapper text-[16px] w-full"
                  min={0}
                />
                <span className="text-[var(--text-secondary)] font-medium">%</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {APR_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setDesiredApr(String(p.value))}
                    className={`py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
                      Number(desiredApr) === p.value
                        ? 'bg-blue-500 text-white'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {Number(desiredApr) > 10000 && (
                <p className="text-red-500 text-xs font-medium">Extremely high APR — this will require a very large reward allocation</p>
              )}
              {Number(desiredApr) > 1000 && Number(desiredApr) <= 10000 && (
                <p className="text-yellow-500 text-xs font-medium">Very high APR — ensure you have sufficient reward tokens</p>
              )}
            </div>

            {/* Expected TVL */}
            <div className="flex flex-col gap-[10px]">
              <p className="large text-[var(--text-primary)]">Expected TVL</p>
              <div className="flex items-center gap-2 bg-[var(--input-bg)] rounded-[12px] p-[7px] pl-[14px]">
                <span className="text-[var(--text-secondary)] font-medium">$</span>
                <Input
                  type="number"
                  placeholder="Estimated total value locked"
                  value={tvlEstimate}
                  onChange={(e) => setTvlEstimate(e.target.value)}
                  className="input-wrapper text-[16px] w-full"
                  min={0}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {TVL_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setTvlEstimate(String(p.value))}
                    className={`py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
                      Number(tvlEstimate) === p.value
                        ? 'bg-blue-500 text-white'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Manual price fallback — only shown when auto-fetch fails */}
            {!isPriceFetching && rewardTokenPrice === null && rewardToken && (
              <div className="flex flex-col gap-[10px]">
                <p className="large text-[var(--text-primary)]">Enter estimated token price (USD)</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  We couldn't automatically fetch the price for {rewardToken.symbol}. Enter an approximate price per token.
                </p>
                <div className="flex items-center gap-2 bg-[var(--input-bg)] rounded-[12px] p-[7px] pl-[14px]">
                  <span className="text-[var(--text-secondary)] font-medium">$</span>
                  <Input
                    type="number"
                    placeholder="Token price in USD"
                    value={manualTokenPrice}
                    onChange={(e) => setManualTokenPrice(e.target.value)}
                    className="input-wrapper text-[16px] w-full"
                    min={0}
                  />
                </div>
              </div>
            )}

            {/* Calculated result */}
            {computedRewardAmount !== null && !isRewardOverridden && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                <p className="text-sm font-medium text-green-700 dark:text-green-400">
                  Required: {Math.round(computedRewardAmount).toLocaleString()} {rewardToken?.symbol || 'tokens'}
                </p>
                {effectivePrice && (
                  <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                    ~${(computedRewardAmount * effectivePrice).toLocaleString(undefined, { maximumFractionDigits: 2 })} USD
                  </p>
                )}
              </div>
            )}

            {/* Reward Amount — editable */}
            <div className="flex flex-col gap-[10px]">
              <div className="flex items-center justify-between">
                <p className="large text-[var(--text-primary)]">Reward Amount</p>
                {isRewardOverridden && computedRewardAmount !== null && (
                  <button
                    onClick={() => {
                      setIsRewardOverridden(false);
                      setRewardAmount(String(Math.round(computedRewardAmount * 100) / 100));
                    }}
                    className="text-xs text-blue-500 hover:text-blue-600 transition-colors"
                  >
                    Reset to calculated
                  </button>
                )}
              </div>
              <div className="bg-[var(--input-bg)] rounded-[12px] p-[7px]">
                <Input
                  type="number"
                  placeholder="Total tokens to distribute"
                  value={rewardAmount}
                  onChange={(e) => {
                    setRewardAmount(e.target.value);
                    setIsRewardOverridden(true);
                  }}
                  className="input-wrapper text-[16px] w-full"
                  min={0}
                />
              </div>
              {isRewardOverridden && (
                <p className="text-xs text-yellow-500">(manual override)</p>
              )}
              {rewardToken && Number(rewardAmount) > 0 && (
                <p className="text-xs text-[var(--text-secondary)]">
                  Will distribute {Number(rewardAmount).toLocaleString()} {rewardToken.symbol} total
                </p>
              )}
            </div>

            {/* NFT Gating */}
            <NftGateConfig
              isGated={isGated}
              setIsGated={setIsGated}
              gateConfig={gateConfig}
              setGateConfig={setGateConfig}
            />
          </div>
        );

      case 4:
        return (
          <div className="flex flex-col gap-4">
            <p className="text-[var(--text-secondary)] text-sm mb-2">Review your staking pool configuration before deploying.</p>

            <div className="flex flex-col gap-3 bg-[var(--bg-secondary)] rounded-xl p-4">
              {/* Stake Token */}
              <div className="flex justify-between items-center">
                <span className="text-[var(--text-secondary)] text-sm">Stake Token</span>
                {stakeToken ? (
                  <div className="flex items-center gap-2">
                    <TokenImage tokenId={stakeToken.id} src={stakeToken.image} symbol={stakeToken.symbol} size={20} />
                    <span className="font-medium text-sm">{stakeToken.symbol}</span>
                  </div>
                ) : (
                  <span className="text-sm text-[var(--text-secondary)]">Not selected</span>
                )}
              </div>

              {/* Reward Token */}
              <div className="flex justify-between items-center">
                <span className="text-[var(--text-secondary)] text-sm">Reward Token</span>
                {rewardToken ? (
                  <div className="flex items-center gap-2">
                    <TokenImage tokenId={rewardToken.id} src={rewardToken.image} symbol={rewardToken.symbol} size={20} />
                    <span className="font-medium text-sm">{rewardToken.symbol}</span>
                  </div>
                ) : (
                  <span className="text-sm text-[var(--text-secondary)]">Not selected</span>
                )}
              </div>

              {/* Reward Amount */}
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)] text-sm">Reward Amount</span>
                <span className="font-medium text-sm">
                  {Number(rewardAmount).toLocaleString()} {rewardToken?.symbol || ''}
                  {isRewardOverridden && <span className="text-yellow-500 text-xs ml-1">(manual)</span>}
                </span>
              </div>

              {/* Reward Value */}
              {effectivePrice && Number(rewardAmount) > 0 && (
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)] text-sm">Reward Value</span>
                  <span className="font-medium text-sm">
                    ~${(Number(rewardAmount) * effectivePrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              <div className="border-t border-[var(--border-color)] my-1" />

              {/* Target APR */}
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)] text-sm">Target APR</span>
                <span className="font-medium text-sm text-green">{desiredApr}%</span>
              </div>

              {/* TVL Estimate */}
              {Number(tvlEstimate) > 0 && (
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)] text-sm">TVL Estimate</span>
                  <span className="font-medium text-sm">${Number(tvlEstimate).toLocaleString()}</span>
                </div>
              )}

              <div className="border-t border-[var(--border-color)] my-1" />

              {/* Timing */}
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)] text-sm">Start Date</span>
                <span className="font-medium text-sm">
                  {startDate ? dayjs(startDate).format('MMM D, YYYY') : 'Not set'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)] text-sm">Duration</span>
                <span className="font-medium text-sm">{actualDuration} days</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)] text-sm">Lock Period</span>
                <span className="font-medium text-sm">{actualLock === 0 ? 'None' : `${actualLock} days`}</span>
              </div>
            </div>

            {!isWalletConnected && (
              <p className="text-red-500 italic text-sm text-center">
                Please connect your wallet to deploy
              </p>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      open={isOpen}
      onCancel={() => {
        if (!isSubmitting) {
          setIsOpen(false);
          resetForm();
        }
      }}
      className="del-modal"
      centered
      width={700}
      footer={null}
      maskClosable={!isSubmitting}
    >
      <div className="modal-content flex flex-col pt-[24px] pb-[24px] px-[24px]">
        <h5 className="text-[var(--text-primary)] font-apex text-center">Create Staking Pool</h5>
        <div className="red-line w-full h-[1px] mt-[16px] mb-[16px]" />

        <Steps
          current={currentStep}
          size="small"
          items={steps}
          className="mb-[20px]"
          onChange={(step) => {
            if (step <= currentStep) {
              setCurrentStep(step);
            }
          }}
        />

        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar px-[4px] mb-[20px]">
          {renderStep()}
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          {currentStep > 0 && (
            <Button
              text="Back"
              className="button btn-red-border flex-1"
              height={48}
              onClick={() => setCurrentStep(currentStep - 1)}
              disabled={isSubmitting}
            />
          )}

          {currentStep < 4 ? (
            <Button
              text="Next"
              className="button btn-primary flex-1"
              height={48}
              onClick={() => {
                if (!isWalletConnected) {
                  toast.error('Please connect your wallet first');
                  return;
                }
                if (!canProceed(currentStep)) {
                  toast.error('Please complete all required fields');
                  return;
                }
                setCurrentStep(currentStep + 1);
              }}
              disabled={!canProceed(currentStep) || !isWalletConnected}
            />
          ) : (
            <Button
              text={isSubmitting ? 'Deploying... Please wait' : 'Create Staking Pool'}
              className="button btn-primary flex-1"
              height={48}
              onClick={handleDeploy}
              disabled={isSubmitting || !isWalletConnected}
              loading={isSubmitting}
            />
          )}
        </div>
      </div>
    </Modal>
  );
};

export default CreateStakeWizard;
