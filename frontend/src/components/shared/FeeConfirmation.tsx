import React from 'react'
import { Modal } from 'antd'
import { usePreferences } from '../../contexts/PreferencesContext'
import { friendlyFee } from '../../utils/grandmaLabels'

interface FeeConfirmationProps {
  visible: boolean
  onConfirm: () => void
  onCancel: () => void
  actionLabel: string
  feePercent: number
  feeAmountFormatted: string
  netAmountFormatted: string
  loading: boolean
}

const FeeConfirmation: React.FC<FeeConfirmationProps> = ({
  visible,
  onConfirm,
  onCancel,
  actionLabel,
  feePercent,
  feeAmountFormatted,
  netAmountFormatted,
  loading,
}) => {
  const { isSimpleMode } = usePreferences()
  return (
    <Modal
      open={visible}
      onCancel={onCancel}
      centered
      width="415px"
      footer={null}
      className="fee-confirmation-modal"
    >
      <div className="flex flex-col p-[28px] gap-[16px]">
        <h3 className="text-[var(--text-primary)] text-[18px] font-bold">
          Confirm Transaction
        </h3>

        <div className="flex flex-col gap-[10px] text-[var(--text-primary)] text-[14px]">
          <div className="flex justify-between">
            <span className="text-[var(--text-secondary)]">Action</span>
            <span className="font-medium">{actionLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-secondary)]">Fee rate</span>
            <span className="font-medium">{isSimpleMode ? friendlyFee(feePercent) : `${feePercent}%`}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-secondary)]">Platform fee</span>
            <span className="font-medium">{feeAmountFormatted}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-secondary)]">You receive</span>
            <span className="font-medium">{netAmountFormatted}</span>
          </div>
        </div>

        <div className="flex gap-[12px] mt-[8px]">
          <button
            onClick={onCancel}
            className="flex-1 h-[44px] rounded-xl border border-[var(--border-color)] text-[var(--text-primary)] font-medium hover:opacity-80 transition-opacity"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 h-[44px] rounded-xl bg-secondary text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : 'Confirm'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default FeeConfirmation
