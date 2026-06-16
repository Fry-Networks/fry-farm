import { Modal } from 'antd'
import React from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/shared/button'

interface LogoutModalProps {
  isModalOpen: boolean
  setIsModalOpen: (isOpen: boolean) => void
}

const LogoutModal: React.FC<LogoutModalProps> = ({ isModalOpen, setIsModalOpen }) => {
  const navigate = useNavigate()

  const handleOk = () => {
    setIsModalOpen(false)
  }

  const handleCancel = () => {
    setIsModalOpen(false)
  }

  return (
    <>
      <Modal open={isModalOpen} onOk={handleOk} onCancel={handleCancel} className="del-modal" centered={true} width="415px">
        <div className="modal-content flex flex-col items-center p-[34px] gap-[24px]">
          <h5 className="text-[var(--text-heading)] text-center font-medium max-w-[327px]">Are you sure you want to Logout?</h5>
          <div className="flex gap-[8px]">
            <Button
              text="Yes"
              className="button btn-primary "
              height={45}
              width={142}
              onClick={() => {
                navigate('/')
              }}
            />
            <Button text="No" className="button btn-red-border" height={45} width={142} onClick={handleCancel} />
          </div>
        </div>
      </Modal>
    </>
  )
}

export default LogoutModal
