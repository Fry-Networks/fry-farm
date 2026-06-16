import axios from 'axios';
import { authAxios } from './apiClient';

const API_BASE = import.meta.env.VITE_API_BASE_URL as string;

const publicApi = axios.create({ baseURL: API_BASE });

export interface ClaimStatusResponse {
  success: boolean;
  canClaim: boolean;
  pendingReward: number;
  pendingRewardDisplay: number;
  isLocked: boolean;
  lockEndsAt: number | null;
  lockEndsIn: number;
  poolEnded: boolean;
  stakedAmount: number;
  stakedAmountDisplay: number;
  periodStart: number;
  rewardToken: number;
  apr: number;
  error?: string;
}

export interface ClaimResponse {
  success: boolean;
  txId: string;
  amount: number;
  amountDisplay: number;
  claimedAt: string;
  rewardToken: number;
  message?: string;
}

export async function getClaimStatus(appId: number, wallet: string): Promise<ClaimStatusResponse> {
  const res = await publicApi.get(`/staking-claim/${appId}/status`, { params: { wallet } });
  return res.data;
}

export async function claimReward(appId: number, wallet: string): Promise<ClaimResponse> {
  const res = await authAxios.post(`/staking-claim/${appId}/claim`, { wallet });
  return res.data;
}
