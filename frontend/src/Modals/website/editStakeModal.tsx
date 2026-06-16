import { Modal } from 'antd'
import React from 'react'
import Button from '../../components/shared/button'
import Input from '../../components/shared/input'

interface editstakeProps {
  iseditStakeOpen: boolean
  setiseditStakeOpen: (state: boolean) => void
}

const Editstake: React.FC<editstakeProps> = ({ iseditStakeOpen, setiseditStakeOpen }) => {
  const handleOk = () => {
    setiseditStakeOpen(false)
  }

  const handleCancel = () => {
    setiseditStakeOpen(false)
  }

  return (
    <>
      <Modal open={iseditStakeOpen} onOk={handleOk} onCancel={handleCancel} className="del-modal " centered width="415px">
        <div className="modal-content flex flex-col pt-[24px] pb-[31px] px-[31px] ">
          <h5 className="text-black font-apex text-center">Edit Stake</h5>

          <div className="red-line w-full h-[1px] mt-[25px] mb-[19px]"></div>

          {/* Content */}
          <div className="max-h-[80vh] overflow-y-auto px-[10px]">
            <div className="flex flex-col gap-[16px]">
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
                  <p className="text-black small font-medium">Rewards</p>
                  <div className="flex items-center gap-[7px]">
                    <img src="../../assets/icons/algo.png" alt="" className="w-[22px] h-[22px]" />
                    <p className="small text-text_clr capitalize">ALGO</p>
                  </div>
                </div>

                <div className="flex justify-between items-center gap-[8px]">
                  <p className="text-black small font-medium">ALGO Reward</p>
                  <div className="flex items-center gap-[7px]">
                    <img src="../../assets/icons/eth.png" alt="" className="w-[22px] h-[22px]" />
                    <p className="small text-text_clr capitalize">ETH</p>
                  </div>
                </div>

                <div className="flex justify-between items-center gap-[8px]">
                  <p className="text-black small font-medium">Start Time</p>
                  <p className="small text-text_clr capitalize">26/04/2025</p>
                </div>
              </div>

              {/* Duration div */}
              <div className="flex flex-col gap-[10px]">
                <p className="large text-black">Duration</p>
                <div className="algo-div flex gap-[10px] items-center justify-between bg-[#F5F5F5] rounded-[12px] pl-[0px] pr-[18px] py-[7px]">
                  <Input type="number" name="number" placeholder="1" className="input-wrapper text-[16px] w-full" />
                  <p className="text-text_clr medium">Days</p>
                </div>
              </div>

              {/* Lock div */}
              <div className="flex flex-col gap-[10px]">
                <p className="large text-black">Lock</p>
                <div className="algo-div flex gap-[10px] items-center justify-between bg-[#F5F5F5] rounded-[12px] pl-[0px] pr-[18px] py-[7px]">
                  <Input type="number" name="number" placeholder="1" className="input-wrapper text-[16px] w-full" />
                  <p className="text-text_clr medium">Days</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-[12px] items-center justify-center mt-[30px]">
              <Button text="Verify Details" className="button btn-primary" height={53} width="100%"></Button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  )
}

export default Editstake
