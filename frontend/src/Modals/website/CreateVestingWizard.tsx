import React, { useState } from 'react';
import { Modal, Steps, Spin } from 'antd';
import { toast } from 'react-toastify';
import { useMultiChainWallet } from '../../hooks/useMultiChainWallet';
import { useAuth } from '../../hooks/useAuth';
import { initVesting, optInAsset, fundPool } from '../../vesting_func';
import { updateEvent, updateCommunityEvent } from '../../services/eventService';

interface CreateVestingWizardProps {
  visible: boolean;
  eventId: string;
  rewardAsaId: number;
  vestingStart: number;      // Unix seconds
  vestingEnd: number;        // Unix seconds
  eventEnd: number;          // Unix seconds - when the event ends (for seeding time gate)
  cliffDays: number;
  totalPool: bigint;         // base units — MUST stay bigint until fundPool()
  eventType: 'official' | 'community';
  onSuccess: (appId: number) => void;
  onCancel: () => void;
}

const STEPS = [
  { title: 'Deploy Contract' },
  { title: 'Opt-In ASA' },
  { title: 'Fund Pool' },
];

const CreateVestingWizard: React.FC<CreateVestingWizardProps> = ({
  visible,
  eventId,
  rewardAsaId,
  vestingStart,
  vestingEnd,
  eventEnd,
  cliffDays,
  totalPool,
  eventType,
  onSuccess,
  onCancel,
}) => {
  const { signer: multiSigner, activeAddress } = useMultiChainWallet();
  const signer = multiSigner!;
  const { ensureAuth } = useAuth();

  const [currentStep, setCurrentStep] = useState(0);
  const [deployedAppId, setDeployedAppId] = useState<bigint | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isOptingIn, setIsOptingIn] = useState(false);
  const [isFunding, setIsFunding] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  const handleDeploy = async () => {
    if (!activeAddress || !signer) {
      toast.error('Wallet not connected.');
      return;
    }
    setIsDeploying(true);
    setStepError(null);
    try {
      // TODO: Replace with backend API call that generates event caller keypair
      // Backend will return { eventCallerAddress: string } after creating the keypair
      // For now, use a placeholder to keep the contract call structure correct
      const eventCallerAddress = 'PLACEHOLDER_EVENT_CALLER'; // Task B will replace this

      const appId = await initVesting(
        activeAddress,
        eventCallerAddress,
        eventEnd,
        rewardAsaId,
        vestingStart,
        vestingEnd,
        cliffDays * 86400,
        activeAddress,
        signer
      );
      setDeployedAppId(appId);
      setCurrentStep(1);
      toast.success(`Contract deployed — App ID: ${appId}`);
    } catch (e: any) {
      setStepError(e.message || 'Deploy failed');
    } finally {
      setIsDeploying(false);
    }
  };

  const handleOptIn = async () => {
    if (!activeAddress || !signer || !deployedAppId) return;
    setIsOptingIn(true);
    setStepError(null);
    try {
      await optInAsset(Number(deployedAppId), rewardAsaId, activeAddress, signer);
      setCurrentStep(2);
      toast.success('Contract opted into reward ASA');
    } catch (e: any) {
      setStepError(e.message || 'Opt-in failed');
    } finally {
      setIsOptingIn(false);
    }
  };

  const handleFund = async () => {
    if (!activeAddress || !signer || !deployedAppId) return;
    setIsFunding(true);
    setStepError(null);
    try {
      // totalPool is bigint — pass directly to fundPool, never convert to Number()
      await fundPool(Number(deployedAppId), rewardAsaId, totalPool, activeAddress, signer);
      toast.success('Pool funded successfully');

      // Save vesting config to backend
      await ensureAuth();
      const vestingPayload = {
        vesting: {
          enabled: true,
          vestingType: 'on-chain' as const,
          appId: Number(deployedAppId),
          rewardAsaId,
          totalPool: Number(totalPool),  // Number() only here, for Mongoose storage
          durationDays: Math.round((vestingEnd - vestingStart) / 86400),
          cliffDays,
          model: 'linear' as const,
          startDate: new Date(vestingStart * 1000).toISOString(),
        },
      };

      if (eventType === 'official') {
        await updateEvent(eventId, vestingPayload);
      } else {
        await updateCommunityEvent(eventId, vestingPayload);
      }

      onSuccess(Number(deployedAppId));
    } catch (e: any) {
      setStepError(e.message || 'Funding failed');
    } finally {
      setIsFunding(false);
    }
  };

  const isProcessing = isDeploying || isOptingIn || isFunding;

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p>Deploy the EventVesting smart contract to the Algorand blockchain.</p>
            <p style={{ fontSize: '0.85em', color: '#888' }}>
              Reward ASA: {rewardAsaId} &bull; Cliff: {cliffDays} days &bull; Pool: {totalPool.toString()} base units
            </p>
            {!activeAddress && (
              <p style={{ color: '#ff4d4f' }}>Connect your wallet to continue.</p>
            )}
            {stepError && <p style={{ color: '#ff4d4f' }}>{stepError}</p>}
            <button
              onClick={handleDeploy}
              disabled={!activeAddress || isProcessing}
              className="w-full py-3 rounded-lg font-bold text-white transition-colors linearGradient disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ marginTop: 12 }}
            >
              {isDeploying ? <Spin size="small" /> : 'Deploy Contract'}
            </button>
          </div>
        );
      case 1:
        return (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p>Opt the contract into the reward ASA so it can hold tokens.</p>
            <p style={{ fontSize: '0.85em', color: '#888' }}>App ID: {deployedAppId?.toString()}</p>
            {stepError && <p style={{ color: '#ff4d4f' }}>{stepError}</p>}
            <button
              onClick={handleOptIn}
              disabled={isProcessing}
              className="w-full py-3 rounded-lg font-bold text-white transition-colors linearGradient disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ marginTop: 12 }}
            >
              {isOptingIn ? <Spin size="small" /> : 'Opt-In ASA'}
            </button>
          </div>
        );
      case 2:
        return (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p>Fund the vesting pool with {totalPool.toString()} base units of ASA {rewardAsaId}.</p>
            {stepError && <p style={{ color: '#ff4d4f' }}>{stepError}</p>}
            <button
              onClick={handleFund}
              disabled={isProcessing}
              className="w-full py-3 rounded-lg font-bold text-white transition-colors linearGradient disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ marginTop: 12 }}
            >
              {isFunding ? <Spin size="small" /> : 'Fund Pool'}
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Modal
      title="On-Chain Vesting Setup"
      open={visible}
      onCancel={isProcessing ? undefined : onCancel}
      footer={null}
      closable={!isProcessing}
      maskClosable={false}
      width={520}
    >
      <Steps current={currentStep} items={STEPS} style={{ marginBottom: 24 }} />
      {renderStep()}
    </Modal>
  );
};

export default CreateVestingWizard;
