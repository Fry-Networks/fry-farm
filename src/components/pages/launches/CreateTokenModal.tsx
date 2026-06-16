import React, { useState, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { useWallet } from '@txnlab/use-wallet'
import algosdk from 'algosdk'
import { getAlgodClient } from '../../../farming_func'

interface CreateTokenModalProps {
  visible: boolean
  onClose: () => void
  onSuccess: () => void
}

const CreateTokenModal: React.FC<CreateTokenModalProps> = ({ visible, onClose, onSuccess }) => {
  const { activeAddress, signTransactions } = useWallet()
  const [step, setStep] = useState('input')
  const [formData, setFormData] = useState({
    name: '',
    unitName: '',
    decimals: 6,
    totalSupply: '',
    description: '',
  })
  const [error, setError] = useState('')

  const handleCreateToken = useCallback(async () => {
    if (!activeAddress || !signTransactions) return
    setStep('signing')
    
    try {
      const response = await fetch('/api/launches/create-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          unitName: formData.unitName,
          decimals: formData.decimals,
          supply: parseInt(formData.totalSupply) * Math.pow(10, formData.decimals),
          description: formData.description,
          creatorAddress: activeAddress,
        }),
      })

      if (!response.ok) throw new Error('API error')
      const result = await response.json()

      const txnBytes = result.txns.map((b64: string) => {
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
        return algosdk.decodeUnsignedTransaction(bytes)
      })

      const encodedUnsigned = txnBytes.map((txn: any) => algosdk.encodeUnsignedTransaction(txn))
      const signed = await signTransactions(encodedUnsigned)

      setStep('submitting')
      const algod = getAlgodClient()
      const { txId } = await algod.sendRawTransaction(signed).do()
      await algosdk.waitForConfirmation(algod, txId, 4)

      setStep('success')
    } catch (e: any) {
      setError(e?.message || 'Failed')
      setStep('error')
    }
  }, [activeAddress, signTransactions, formData])

  const handleClose = () => {
    setStep('input')
    setFormData({ name: '', unitName: '', decimals: 6, totalSupply: '', description: '' })
    setError('')
    onClose()
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
      <div className="relative bg-[var(--bg-card)] rounded-[16px] w-full max-w-[480px] mx-4 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:plus-circle" className="text-green-500" width={22} />
            <h3 className="text-[var(--text-primary)] font-bold text-lg">Create Token</h3>
          </div>
          <button onClick={handleClose} className="text-[var(--text-secondary)]">
            <Icon icon="mdi:close" width={22} />
          </button>
        </div>
        <div className="px-6 py-5">
          {step === 'input' && (
            <div className="flex flex-col gap-4">
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="Token Name"
                className="w-full bg-[var(--input-bg)] rounded-[10px] px-3 py-2.5"
              />
              <input
                type="text"
                value={formData.unitName}
                onChange={(e) => setFormData({...formData, unitName: e.target.value.slice(0, 8)})}
                placeholder="Unit Name (max 8)"
                className="w-full bg-[var(--input-bg)] rounded-[10px] px-3 py-2.5"
              />
              <button
                onClick={() => setStep('review')}
                disabled={!activeAddress || !formData.name || !formData.unitName}
                className="w-full py-3 rounded-lg font-bold text-white linearGradient disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          )}
          {step === 'review' && (
            <div className="text-center">
              <h4 className="text-[var(--text-primary)] font-bold text-lg mt-2">Review Token</h4>
              <p className="text-[var(--text-secondary)] mt-2">{formData.name}</p>
              <button
                onClick={handleCreateToken}
                className="mt-4 w-full py-3 rounded-lg font-bold text-white linearGradient"
              >
                Confirm & Sign
              </button>
            </div>
          )}
          {step === 'success' && (
            <div className="text-center py-8">
              <Icon icon="mdi:check-circle" width={64} className="text-green-500" />
              <h4 className="text-[var(--text-primary)] font-bold text-xl mt-2">Created!</h4>
              <button onClick={onSuccess} className="mt-4 w-full py-3 rounded-lg font-bold text-white linearGradient">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default CreateTokenModal
