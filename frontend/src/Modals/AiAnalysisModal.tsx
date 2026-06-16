import React, { useEffect, useState } from 'react'
import { Modal } from 'antd'
import { Icon } from '@iconify/react'
import useAiPayment from '../hooks/useAiPayment'
import { getAiPrices, analyzePool, analyzePortfolio, analyzeSwap } from '../services/aiService'
import type { AiPrices } from '../services/aiService'
import { useAuth } from '../hooks/useAuth'
import { fetchVoiUsd } from '../contracts/nomadex/NomadexPriceService'

type Step = 'confirm' | 'paying' | 'analyzing' | 'result' | 'error'

function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Bullet lists: lines starting with "- "
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul class="list-disc pl-4 my-1">$1</ul>')
  // Paragraphs: double newlines
  html = html.replace(/\n\n/g, '</p><p class="mb-2">')
  // Single newlines
  html = html.replace(/\n/g, '<br/>')
  return `<p class="mb-2">${html}</p>`
}

interface AiAnalysisModalProps {
  isOpen: boolean
  onClose: () => void
  type: 'pool' | 'portfolio' | 'swap'
  poolId?: string
  poolName?: string
  swapData?: {
    fromToken: string
    toToken: string
    amount: number
    priceImpact: number
  }
}

const AiAnalysisModal: React.FC<AiAnalysisModalProps> = ({
  isOpen,
  onClose,
  type,
  poolId,
  poolName,
  swapData,
}) => {
  const { ensureAuth } = useAuth()
  const { payForAnalysis, isProcessing, chainId } = useAiPayment()
  const isVoi = chainId === 'voi-mainnet'
  const [step, setStep] = useState<Step>('confirm')
  const [analysis, setAnalysis] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [prices, setPrices] = useState<AiPrices | null>(null)
  const [voiCost, setVoiCost] = useState<number | null>(null)

  useEffect(() => {
    if (isOpen) {
      setStep('confirm')
      setAnalysis('')
      setErrorMsg('')
      setVoiCost(null)
      getAiPrices().then(async (p) => {
        setPrices(p)
        if (isVoi && p.fryPriceUsd) {
          try {
            const voiUsd = await fetchVoiUsd()
            if (voiUsd > 0) {
              // Store VOI/USD rate; actual cost computed in getCostVoi()
              setVoiCost(voiUsd)
            }
          } catch { /* fallback: show FRY cost */ }
        }
      }).catch(() => {})
    }
  }, [isOpen, isVoi])

  const getCost = (): number => {
    if (!prices) return 0
    switch (type) {
      case 'pool': return prices.poolAnalysis
      case 'portfolio': return prices.portfolioAnalysis
      case 'swap': return prices.swapAnalysis
    }
  }

  const getTitle = (): string => {
    switch (type) {
      case 'pool': return poolName || 'Pool'
      case 'portfolio': return 'Your Portfolio'
      case 'swap': return 'Swap'
    }
  }

  const handleAnalyze = async () => {
    try {
      await ensureAuth()
    } catch {
      setErrorMsg('Authentication required')
      setStep('error')
      return
    }

    setStep('paying')

    const txId = await payForAnalysis(getCost(), prices?.fryPriceUsd)
    if (!txId) {
      setErrorMsg('Payment cancelled or failed')
      setStep('error')
      return
    }

    setStep('analyzing')

    try {
      let result
      switch (type) {
        case 'pool':
          result = await analyzePool(txId, poolId || '')
          break
        case 'portfolio':
          result = await analyzePortfolio(txId)
          break
        case 'swap':
          result = await analyzeSwap(txId, swapData || { fromToken: '', toToken: '', amount: 0, priceImpact: 0 })
          break
      }
      setAnalysis(result.analysis)
      setStep('result')
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message || err?.message || 'Analysis failed')
      setStep('error')
    }
  }

  const handleClose = () => {
    if (step !== 'paying' && step !== 'analyzing') {
      onClose()
    }
  }

  return (
    <Modal
      open={isOpen}
      onCancel={handleClose}
      centered
      width="415px"
      footer={null}
      className="fee-confirmation-modal"
      maskClosable={step !== 'paying' && step !== 'analyzing'}
    >
      <div className="flex flex-col p-[28px] gap-[16px]">
        <h3 className="text-[var(--text-primary)] text-[18px] font-bold flex items-center gap-[8px]">
          <Icon icon="mdi:sparkles" width={20} className="text-purple-500" />
          AI Analysis
        </h3>

        {step === 'confirm' && (
          <>
            <p className="text-[var(--text-secondary)] text-[14px]">
              Get AI-powered insights on <span className="text-[var(--text-primary)] font-medium">{getTitle()}</span>
            </p>
            <div className="flex justify-between text-[14px]">
              <span className="text-[var(--text-secondary)]">Cost</span>
              <span className="text-[var(--text-primary)] font-medium">
                {isVoi && voiCost !== null && prices?.fryPriceUsd ? (
                  <>{((getCost() * prices.fryPriceUsd) / voiCost).toFixed(2)} VOI
                    {prices?.fryPriceUsd ? (
                      <span className="text-[var(--text-secondary)] font-normal ml-[6px]">
                        (~${(getCost() * prices.fryPriceUsd).toFixed(4)})
                      </span>
                    ) : null}
                  </>
                ) : (
                  <>{getCost().toLocaleString()} FRY
                    {prices?.fryPriceUsd ? (
                      <span className="text-[var(--text-secondary)] font-normal ml-[6px]">
                        (~${(getCost() * prices.fryPriceUsd).toFixed(4)})
                      </span>
                    ) : null}
                  </>
                )}
              </span>
            </div>
            <div className="flex gap-[12px] mt-[8px]">
              <button
                onClick={handleClose}
                className="flex-1 h-[44px] rounded-xl border border-[var(--border-color)] text-[var(--text-primary)] font-medium hover:opacity-80 transition-opacity"
              >
                Cancel
              </button>
              <button
                onClick={handleAnalyze}
                disabled={!prices}
                className="flex-1 h-[44px] rounded-xl bg-secondary text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Pay & Analyze
              </button>
            </div>
          </>
        )}

        {step === 'paying' && (
          <div className="flex flex-col items-center gap-[16px] py-[24px]">
            <Icon icon="eos-icons:loading" width={32} className="text-purple-500" />
            <p className="text-[var(--text-secondary)] text-[14px]">Confirm transaction in your wallet...</p>
          </div>
        )}

        {step === 'analyzing' && (
          <div className="flex flex-col items-center gap-[16px] py-[24px]">
            <Icon icon="eos-icons:loading" width={32} className="text-purple-500" />
            <p className="text-[var(--text-secondary)] text-[14px]">Analyzing...</p>
          </div>
        )}

        {step === 'result' && (
          <>
            <div
              className="text-[var(--text-primary)] text-[14px] leading-[22px] max-h-[300px] overflow-y-auto custom-scrollbar"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(analysis) }}
            />
            <button
              onClick={handleClose}
              className="w-full h-[44px] rounded-xl bg-secondary text-white font-medium hover:opacity-90 transition-opacity mt-[8px]"
            >
              Close
            </button>
          </>
        )}

        {step === 'error' && (
          <>
            <p className="text-red-500 text-[14px]">{errorMsg}</p>
            <div className="flex gap-[12px] mt-[8px]">
              <button
                onClick={handleClose}
                className="flex-1 h-[44px] rounded-xl border border-[var(--border-color)] text-[var(--text-primary)] font-medium hover:opacity-80 transition-opacity"
              >
                Close
              </button>
              <button
                onClick={() => setStep('confirm')}
                className="flex-1 h-[44px] rounded-xl bg-secondary text-white font-medium hover:opacity-90 transition-opacity"
              >
                Retry
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

export default AiAnalysisModal
