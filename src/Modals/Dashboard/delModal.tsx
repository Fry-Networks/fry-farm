import { Modal } from 'antd'
import React from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/shared/button'

interface DelModalProps {
  isdelModalOpen: boolean
  setIsdelModalOpen: (isOpen: boolean) => void
}

const DelModal: React.FC<DelModalProps> = ({ isdelModalOpen, setIsdelModalOpen }) => {
  const navigate = useNavigate()

  const handleOk = () => {
    setIsdelModalOpen(false)
  }

  const handleCancel = () => {
    setIsdelModalOpen(false)
  }

  return (
    <>
      <Modal open={isdelModalOpen} onOk={handleOk} onCancel={handleCancel} className="del-modal" centered={true} width="415px">
        <div className="modal-content flex flex-col items-center p-[34px] gap-[24px]">
          <h5 className="text-black text-center font-medium max-w-[327px]">Are you sure you want to delete this?</h5>
          <div className="flex gap-[8px]">
            <Button text="Yes" className="button btn-primary " height={45} width={142} onClick={handleCancel} />
            <Button text="No" className="button btn-red-border" height={45} width={142} onClick={handleCancel} />
          </div>
        </div>
      </Modal>
    </>
  )
}

export default DelModal
