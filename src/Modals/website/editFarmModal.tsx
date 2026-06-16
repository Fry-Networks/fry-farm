import { Modal } from 'antd'
import React, { useEffect, useRef, useState } from 'react'
import Button from '../../components/shared/button'
import Input from '../../components/shared/input'

interface editfarmProps {
  iseditfarmOpen: boolean
  setiseditfarmOpen: (state: boolean) => void
}

interface Currency {
  code: string
  label: string
  img: string
}

const EditFarm: React.FC<editfarmProps> = ({ iseditfarmOpen, setiseditfarmOpen }) => {
  const currencies: Currency[] = [
    { code: 'ALGO', label: 'Algorand', img: '/assets/icons/algo.png' },
    { code: 'ETH', label: 'Ethereum', img: '/assets/icons/eth.png' },
    { code: 'XRP', label: 'XRP', img: '/assets/icons/XRP.png' },
    { code: 'BNB', label: 'Binance', img: '/assets/icons/Binance.png' },
    { code: 'USDT', label: 'Tether', img: '/assets/icons/Tether.png' },
    { code: 'BTC', label: 'Bitcoin', img: '/assets/icons/Bitcoin.png' },
  ]

  // Set default selected currency for ALGO Rewards to Ethereum (ETH)
  const [selectedStakingToken, setSelectedStakingToken] = useState<Currency>(currencies[0])
  const [selectedRewards, setSelectedRewards] = useState<Currency>(currencies[0])
  const [selectedAlgoRewards, setSelectedAlgoRewards] = useState<Currency>(currencies[1]) // Default to ETH

  const [isOpenDropdowns, setIsOpenDropdowns] = useState<{ [key: string]: boolean }>({
    stakingToken: false,
    rewards: false,
    algoRewards: false,
  })

  const [searchQuery, setSearchQuery] = useState('')

  const dropdownRefs = {
    stakingToken: useRef<HTMLDivElement | null>(null),
    rewards: useRef<HTMLDivElement | null>(null),
    algoRewards: useRef<HTMLDivElement | null>(null),
  }

  // Close all dropdowns except the one being toggled
  const toggleDropdown = (dropdown: string) => {
    setIsOpenDropdowns((prevState) => {
      const newState = { ...prevState }
      Object.keys(prevState).forEach((key) => {
        if (key !== dropdown) newState[key] = false
      })
      newState[dropdown] = !prevState[dropdown]
      return newState
    })
  }

  const selectCurrency = (currency: Currency, dropdown: string) => {
    if (dropdown === 'stakingToken') {
      setSelectedStakingToken(currency)
    } else if (dropdown === 'rewards') {
      setSelectedRewards(currency)
    } else if (dropdown === 'algoRewards') {
      setSelectedAlgoRewards(currency)
    }

    setIsOpenDropdowns((prevState) => ({
      ...prevState,
      [dropdown]: false,
    }))
  }

  const handleOk = () => {
    setiseditfarmOpen(false)
  }

  const handleCancel = () => {
    setiseditfarmOpen(false)
  }

  const filteredCurrencies = currencies.filter((currency) => currency.label.toLowerCase().includes(searchQuery.toLowerCase()))

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      Object.keys(dropdownRefs).forEach((dropdownKey) => {
        const ref = dropdownRefs[dropdownKey as keyof typeof dropdownRefs].current // Add type assertion here

        if (ref && !ref.contains(event.target as Node)) {
          setIsOpenDropdowns((prevState) => ({
            ...prevState,
            [dropdownKey]: false,
          }))
        }
      })
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  return (
    <>
      <Modal open={iseditfarmOpen} onOk={handleOk} onCancel={handleCancel} className="del-modal " centered width="415px">
        <div className="modal-content flex flex-col pt-[24px] pb-[31px] px-[31px] ">
          <h5 className="text-black font-apex text-center">Edit Farm</h5>

          <div className="red-line w-full h-[1px] mt-[25px] mb-[19px]"></div>

          {/* Content */}
          <div className="max-h-[80vh] overflow-y-auto px-[10px]">
            <div className="flex flex-col gap-[16px]">
              {/* Details div */}
              <div className="bg-[#F5F5F5] rounded-[11px] px-[20px] py-[18px] flex flex-col gap-[18px]">
                <div className="flex flex-col gap-[8px]">
                  <p className="text-black small font-medium">LP POOL</p>
                  <div className="flex items-center justify-between gap-[7px]">
                    {/* left */}
                    <div className="flex items-center gap-[6px]">
                      <div className="flex mr-[-5px]">
                        <img src="../../assets/icons/Bitcoin.png" alt="BTC" className="w-[30px] h-[30px] drop-shadow-md" />
                        <img
                          src="../../assets/icons/eth-black.png"
                          alt="BTC"
                          className="w-[30px] h-[30px] drop-shadow-md relative right-[10px] z-[1]"
                        />
                      </div>
                      <div className="flex flex-col">
                        <p className="small text-text_clr capitalize">USDC-ALGO LP</p>
                        <p className="e-small text-text_clr">tinyman2.0</p>
                      </div>
                    </div>
                    {/* Right */}
                    <div className="flex flex-col justify-end items-end">
                      <p className="small text-text_clr capitalize">ASA ID</p>
                      <p className="e-small text-text_clr">1002590888</p>
                    </div>
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

export default EditFarm
