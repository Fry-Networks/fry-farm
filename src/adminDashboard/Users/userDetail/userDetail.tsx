import { Icon } from '@iconify/react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

const UserDetail = () => {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const toggleDropdown = () => setIsOpen((prev) => !prev)
  return (
    <>
      <div className="detail-main flex flex-col gap-[18px]">
        {/* top-banner */}
        <div className="flex flex-col gap-[8px] ">
          {/* img main div */}
          <div className="flex justify-between gap-[20px] items-end pl-[38px] sm-s:flex-col sm-s:items-center">
            {/* left-img */}
            <div className="relative">
              <img src="../../assets/images/dashboard/user-img.png" alt="" className="w-[102px] h-[101px]" />
              <div className="absolute top-[-4%] z-[-1] right-[-3%]  bg-darkRed rounded-[500px] opacity-[0.2] w-[107px] h-[107px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]"></div>
            </div>
            {/* right-buttons*/}
            <div className="flex gap-[12px] sm-s:items-center sm-s:flex-col sm-s:w-full">
              <p
                className="text-darkRed sm-s:w-[70%] sm-s:text-center cursor-pointer font-medium medium px-[20px] py-[8px] rounded-[4px] border-solid border-2 border-[#F00]"
                onClick={() => {
                  navigate('/admin/user-transactions-history')
                }}
              >
                Transaction History
              </p>

              <div
                ref={dropdownRef}
                className="relative inline-block text-left sm-s:w-full sm-s:flex sm-s:items-center sm-s:justify-center"
              >
                <div
                  className="flex relative items-center justify-center gap-[2px] cursor-pointer sm-s:w-[70%] sm-s:text-center w-[116px] rounded-[4px] py-[8px] border-solid border-[2px] border-red "
                  onClick={toggleDropdown}
                >
                  <p className="font-medium medium text-darkRed ">Actions</p>
                  <Icon icon={isOpen ? 'mdi:chevron-up' : 'mdi:chevron-down'} width={18} height={18} color="#F00" />
                </div>
                {isOpen && (
                  <div className="absolute right-0 mt-2 w-[180px] sm-s:w-[70%] sm-s:right-[15%] sm-s:mt-[130px] bg-white rounded-[8px] shadow-lg z-10">
                    <ul className="py-1">
                      <p
                        className="medium border-solid border-b-2 border-b-[#D9D9D9] font-medium text-text_clr py-[9px] px-[13px] cursor-pointer"
                        // onClick={() => {
                        //   navigate('/transaction-history')
                        // }}
                      >
                        Deactivate Account
                      </p>

                      <p className="medium font-medium text-darkRed py-[9px] px-[13px] cursor-pointer">Deleted Account</p>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* user-info */}
          <div className="user-info flex max-sm:flex-col max-sm:items-center justify-between pl-[38px] p-[9px] bg-white rounded-[14px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
            {/* left */}
            <div className="flex flex-col gap-[6px] py-[28px]">
              <h5 className="font-semibold text-primary">William Akarana</h5>
              <p className="text-primary medium font-semibold">
                Joined: <span className="text-text_clr font-normal">02/05/2023</span>
              </p>
            </div>
            {/* center */}
            <div className="flex items-center gap-[40px] py-[20px] ">
              <div className="flex flex-col items-center gap-[8px] ">
                <h3 className="small text-primary">
                  54<span className="text-darkRed">5</span>
                </h3>
                <p className="text-[#999] e-small">FRY Balance</p>
              </div>
              <div className="h-[85px] w-[1px] bg-[#D9D9D9]"></div>
              <div className="flex flex-col items-center gap-[8px] ">
                <h3 className="small text-primary">
                  87<span className="text-darkRed">5</span>
                </h3>
                <p className="text-[#999] e-small">FRY Fees Paid</p>
              </div>
            </div>
            {/* right */}
            <div className="flex gap-[8px] max-sm:py-[20px]">
              <p className="flex gap-[6px] bg-[#FFE6E6] rounded-[38px] h-fit text-darkRed small font-medium py-[4px] px-[8px]">
                User ID <span>#6546423</span>
              </p>
              <p className=" bg-[#D4EDDA] rounded-[38px] h-fit text-green small font-medium py-[4px] px-[8px]">Active</p>
            </div>
          </div>
        </div>

        {/* bottom-switcher */}
        <div className="flex flex-col items-center gap-[23px] py-[24px] px-[16px] bg-white rounded-[24px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)] ">
          <div className="flex gap-[16px]">
            <NavLink
              to="/admin/user-detail/staking"
              className={({ isActive }) =>
                isActive
                  ? 'text-darkRed cursor-pointer large font-medium border-solid border-b-2 border-darkRed'
                  : 'text-[#8E8E8E] cursor-pointer large'
              }
            >
              Staking
            </NavLink>

            <NavLink
              to="/admin/user-detail/farming"
              className={({ isActive }) =>
                isActive
                  ? 'text-darkRed cursor-pointer large font-medium border-solid border-b-2 border-darkRed'
                  : 'text-[#8E8E8E] cursor-pointer large'
              }
            >
              Farming
            </NavLink>
          </div>

          <div className="w-full">
            <Outlet />
          </div>
        </div>
      </div>
    </>
  )
}

export default UserDetail
