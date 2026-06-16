import { Icon } from '@iconify/react'
import { Drawer } from 'antd'
import { FC, useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface DashnavbarProps {
  toggleDrawer: () => void
}

const Dashnavbar: FC<DashnavbarProps> = ({ toggleDrawer }) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  const toggleRightDrawer = () => {
    setIsDrawerOpen(!isDrawerOpen)
  }
  const navigate = useNavigate()

  return (
    <>
      <div className="dashnavbar-container mb-[20px] py-[11px] px-[32px] bg-[var(--bg-card)] rounded-[26px] h-fit flex items-center justify-between w-[calc(100vw-310px)] max-md:w-full shadow-[0px_4px_24.2px_0px_var(--shadow-color)]">
        <div className="dashnav-left">
          <Icon icon="ion:menu" width={20} height={20} onClick={toggleDrawer} className="hidden max-md:flex cursor-pointer" />
        </div>

        <div className="dashnav-right w-100 flex items-center justify-end gap-[15px] sm-s:gap-[8px]">
          {/* Notification */}
          <div
            className="relative flex justify-center items-center w-[45px] h-[45px] sm-s:h-[40px] sm-s:w-[40px]"
            onClick={toggleRightDrawer}
          >
            <Icon
              icon="clarity:notification-line"
              width={28}
              height={28}
              color="#808080"
              className="cursor-pointer relative sm-s:h-[22px] sm-s:w-[22px]"
            />
            <div className="cursor-pointer w-[8px] h-[8px] bg-darkRed rounded-[50px] absolute top-[25%] right-[30%]"></div>
          </div>
          <div className="w-[1px] h-[30px] bg-[#808080]"></div>

          {/* Settings Button */}
          <div className="flex items-center justify-center gap-[18px]">
            <img
              src="../../assets/images/dashboard/dp.png"
              alt=""
              className="h-[46px] w-[46px] cursor-pointer"
              onClick={() => navigate('/admin/setting/profile')}
            />
            <div className="flex flex-col gap-[3px] cursor-pointer" onClick={() => navigate('/admin/setting')}>
              <p className="small font-bold">Johnwick</p>
              <p className="e-small font-semibold text-text_clr">Admin</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mobile-sidebar-right hidden max-md:flex relative">
        <Drawer
          placement="right"
          closable={false}
          onClose={toggleRightDrawer}
          open={isDrawerOpen}
          className="rounded-l-[10px] "
          width={280}
        >
          <div className="sidebar-container ">
            {/* <img
              src={isDrawerOpen ? '../../assets/icons/sidebarArrow-right.png' : '../../assets/icons/sidebarArrow-left.png'}
              alt=""
              className="cursor-pointer absolute left-[-5%] z-[99999]"
              onClick={toggleRightDrawer}
            /> */}
            <div className="flex flex-col gap-[20px]">
              <div className={`flex items-center gap-[12px] rounded-t-[10px] px-[11px] py-[26px] rounded-b-0 bg-darkRed`}>
                <Icon
                  icon="icon-park-outline:left"
                  color="white"
                  className="cursor-pointer"
                  width={24}
                  height={24}
                  onClick={toggleRightDrawer}
                />
                <p className="medium text-white">Notifications</p>
              </div>
            </div>
          </div>
        </Drawer>
      </div>
    </>
  )
}

export default Dashnavbar
