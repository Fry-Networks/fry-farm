import { Modal } from 'antd'
import React, { useState } from 'react'
import Button from '../../components/shared/button'
import DelModal from './delModal'

interface pendingstakeProps {
  ispendingStakeOpen: boolean
  setispendingStakeOpen: (state: boolean) => void
}

const StakingDetailPending: React.FC<pendingstakeProps> = ({ ispendingStakeOpen, setispendingStakeOpen }) => {
  const [isdelModalOpen, setIsdelModalOpen] = useState(false)
  const onDelClick = () => {
    setIsdelModalOpen(true)
    setispendingStakeOpen(false)
  }
  const handleOk = () => {
    setispendingStakeOpen(false)
  }

  const handleCancel = () => {
    setispendingStakeOpen(false)
  }

  return (
    <>
      <Modal open={ispendingStakeOpen} onOk={handleOk} onCancel={handleCancel} className="del-modal " centered width="415px">
        <div className="modal-content flex flex-col pt-[16px] pb-[24px] px-[18px] ">
          <p className="medium text-primary">
            Staking Pool details - <span className="text-txtPending">(Pending)</span>
          </p>

          <div className="mt-[20px] px-[12px]">
            <div className="flex items-center justify-between ">
              <p className="text-red large font-apex text-center">user A</p>
              <img src="../../assets/icons/del.png" alt="Delete" className="cursor-pointer" onClick={onDelClick} />
            </div>
            <div className="red-line w-full h-[1px] my-[20px]"></div>

            {/* Content */}
            <div className="max-h-[80vh] overflow-y-auto ">
              <div className="flex flex-col gap-[12px]">
                {/* Details div */}
                <div className="bg-[#F5F5F5] rounded-[11px] px-[20px] py-[18px] flex flex-col gap-[18px]">
                  <div className="flex justify-between items-center gap-[8px]">
                    <p className="text-black small font-medium">Staking Token</p>
                    <div className="flex items-center gap-[7px]">
                      <img src="../../assets/icons/algo.png" alt="" className="w-[22px] h-[22px]" />
                      <p className="small text-text_clr capitalize">ALGO</p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center gap-[8px]">
                    <p className="text-black small font-medium">ASA ID</p>
                    <p className="small text-text_clr capitalize text-right">846484654</p>
                  </div>
                </div>
                {/* Details div */}
                <div className="bg-[#F5F5F5] rounded-[11px] px-[20px] py-[18px] flex flex-col gap-[18px]">
                  <div className="flex justify-between items-center gap-[8px]">
                    <p className="text-black small font-medium">Start Time</p>
                    <p className="small text-text_clr capitalize text-right">26/04/2025 14:24</p>
                  </div>

                  <div className="flex justify-between items-center gap-[8px]">
                    <p className="text-black small font-medium">End Time</p>
                    <p className="small text-text_clr capitalize text-right">26/04/2025 14:24</p>
                  </div>

                  <div className="flex justify-between items-center gap-[8px]">
                    <p className="text-black small font-medium">Start-end blocks</p>
                    <p className="small text-text_clr capitalize text-right">54684486-45646453</p>
                  </div>
                </div>

                {/* Details div */}
                <div className="bg-[#F5F5F5] rounded-[11px] px-[20px] py-[18px] flex flex-col gap-[18px]">
                  <div className="flex justify-between items-center gap-[8px]">
                    <p className="text-black small font-medium">Total Reward</p>
                    <p className="small text-text_clr capitalize text-right">100 ALGO</p>
                  </div>

                  <div className="flex justify-between items-center gap-[8px]">
                    <p className="text-black small font-medium">Reward per block</p>
                    <p className="small text-text_clr capitalize text-right">0.000654500 ALGO</p>
                  </div>

                  <div className="flex justify-between items-center gap-[8px]">
                    <p className="text-black small font-medium">Lock period blocks</p>
                    <p className="small text-text_clr capitalize text-right">319999</p>
                  </div>
                </div>
              </div>

              <div className="flex  gap-[12px] mt-[20px]">
                <Button text="Decline" className="button btn-red-border" height={51} width="100%"></Button>
                <Button text="Approve" className="button btn-primary" height={51} width="100%"></Button>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <DelModal isdelModalOpen={isdelModalOpen} setIsdelModalOpen={setIsdelModalOpen} />
    </>
  )
}

export default StakingDetailPending
