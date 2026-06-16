import { authAxios } from './apiClient'

export interface AiPrices {
  poolAnalysis: number
  portfolioAnalysis: number
  swapAnalysis: number
  currency: string
  fryPriceUsd: number
}

export interface AiAnalysisResult {
  analysis: string
  cost: number
  interactionId: string
}

export const getAiPrices = async (): Promise<AiPrices> => {
  const response = await authAxios.get('/ai/prices')
  return response.data.data
}

export const analyzePool = async (txId: string, poolId: string): Promise<AiAnalysisResult> => {
  const response = await authAxios.post('/ai/analyze-pool', { txId, poolId })
  return response.data.data
}

export const analyzePortfolio = async (txId: string): Promise<AiAnalysisResult> => {
  const response = await authAxios.post('/ai/analyze-portfolio', { txId })
  return response.data.data
}

export const analyzeSwap = async (
  txId: string,
  swapData: { fromToken: string; toToken: string; amount: number; priceImpact: number }
): Promise<AiAnalysisResult> => {
  const response = await authAxios.post('/ai/analyze-swap', { txId, ...swapData })
  return response.data.data
}
