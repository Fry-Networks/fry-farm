import { Icon } from '@iconify/react'
import { Drawer } from 'antd'
import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import LogoutModal from '../../Modals/Dashboard/LogoutModal'

interface AdminSidebarProps {
  isDrawerOpen: boolean
  toggleDrawer: () => void
}

const AdminSidebar: React.FC<AdminSidebarProps> = ({ isDrawerOpen, toggleDrawer }) => {
  const location = useLocation()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const onLogoutClick = () => {
    setIsModalOpen(true)
  }
  return (
    <>
      <div className="sidebar-main-container bg-white rounded-[26px] pt-[30px] pb-[12px] px-[12px] max-md:hidden max-w-[260px] w-full fixed flex flex-col gap-[60px] overflow-y-auto max-h-fit h-[calc(100vh-22px)] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
        <div className="sidebar-logo-container relative ">
          <Link to="/admin/dashboard">
            <div className="flex items-center gap-[3px] justify-center">
              <img src="../../assets/logo.png" alt="logo" className="logo w-[39px] h-[33px]" />
              <p className="text-darkRed font-medium large cursor-pointer">Fry Networks</p>
            </div>
          </Link>
        </div>

        <div className="sidebar-options-container h-full relative ">
          <ul className="flex flex-col justify-between relative h-full  w-full ">
            <div className="top-options flex flex-col">
              <li>
                <NavLink
                  to="/admin/dashboard"
                  className={({ isActive }) =>
                    `dashLinks w-full max-w-full rounded-[16px] flex items-center gap-[10px] px-[20px] py-[15px]  ${
                      isActive ? 'linearGradient text-white' : 'text-primary'
                    }`
                  }
                >
                  <Icon icon="mage:dashboard-fill" width={24} height={24} />
                  <p className="medium font-medium">Dashboard</p>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/admin/users"
                  className={({ isActive }) =>
                    `dashLinks w-full max-w-full rounded-[16px] flex items-center gap-[10px] px-[20px] py-[15px]  ${
                      isActive ||
                      location.pathname === '/admin/user-detail/staking' ||
                      location.pathname === '/admin/user-detail/farming' ||
                      location.pathname === '/admin/user-transactions-history'
                        ? 'linearGradient text-white'
                        : 'text-primary'
                    }`
                  }
                >
                  <Icon icon="mdi:users" width={24} height={24} />
                  <p className="medium font-medium">Users</p>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/admin/staking"
                  className={({ isActive }) =>
                    `dashLinks w-full max-w-full rounded-[16px] flex items-center gap-[10px] px-[20px] py-[15px]  ${
                      isActive || location.pathname === '/admin/staking-statistics' ? 'linearGradient text-white' : 'text-primary'
                    }`
                  }
                >
                  <Icon icon="lets-icons:3d-box-fill" width={24} height={24} />
                  <p className="medium font-medium">Staking</p>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/admin/farming"
                  className={({ isActive }) =>
                    `dashLinks w-full max-w-full rounded-[16px] flex items-center gap-[10px] px-[20px] py-[15px]  ${
                      isActive || location.pathname === '/admin/farming-statistics' ? 'linearGradient text-white' : 'text-primary'
                    }`
                  }
                >
                  <img
                    src={
                      location.pathname === '/admin/farming' || location.pathname === '/admin/farming-statistics'
                        ? '../../assets/icons/plant-white.png'
                        : '../../assets/icons/plant-black.png'
                    }
                    alt="plant"
                  />
                  <p className="medium font-medium">Farming</p>
                </NavLink>
              </li>
            </div>
            <div className="bottom-options ">
              <li>
                <NavLink
                  to="/admin/setting/profile"
                  className={({ isActive }) =>
                    `dashLinks w-full max-w-full rounded-[16px] flex items-center gap-[10px] px-[20px] py-[15px]  ${
                      isActive || location.pathname === '/admin/setting/general' ? 'linearGradient text-white' : 'text-primary'
                    }`
                  }
                >
                  <Icon icon="lets-icons:setting-line" width={24} height={24} />
                  <p className="medium font-medium">Settings</p>
                </NavLink>
              </li>

              <li className="flex items-center gap-[10px] px-[20px] py-[15px]  cursor-pointer text-primary" onClick={onLogoutClick}>
                <Icon icon="hugeicons:logout-03" width={24} height={24} />
                <p className="medium font-medium ">Logout</p>
              </li>
            </div>
          </ul>
        </div>
      </div>

      {/* mobile sidebar */}
      <div className="mobile-sidebar hidden max-md:flex ">
        <Drawer
          placement="left"
          closable={false}
          onClose={toggleDrawer}
          open={isDrawerOpen}
          className="rounded-r-[20px] p-[20px]"
          width={340}
        >
          <div className="sidebar-container ">
            <img
              src={isDrawerOpen ? '../../assets/icons/sidebarArrow-left.png' : '../../assets/icons/sidebarArrow-right.png'}
              alt=""
              className="cursor-pointer absolute right-[-4%] z-[99999] w-[40px] "
              onClick={toggleDrawer}
            />
            <div className="sidebar-logo-container relative mb-[60px]">
              <Link to="/admin/dashboard" onClick={toggleDrawer}>
                <div className="flex items-center gap-[3px] justify-center">
                  <img src="../../assets/logo.png" alt="logo" className="logo w-[39px] h-[33px]" />
                  <p className="text-darkRed font-medium large cursor-pointer">Fry Networks</p>
                </div>
              </Link>
            </div>

            <div className="sidebar-options-container h-full relative ">
              <ul className="flex flex-col justify-between relative h-full  w-full ">
                <div className="top-options flex flex-col">
                  <li>
                    <NavLink
                      to="/admin/dashboard"
                      onClick={toggleDrawer}
                      className={({ isActive }) =>
                        `dashLinks w-full max-w-full rounded-[16px] flex items-center gap-[10px] px-[20px] py-[15px]  ${
                          isActive ? 'linearGradient text-white' : 'text-primary'
                        }`
                      }
                    >
                      <Icon icon="mage:dashboard-fill" width={24} height={24} />
                      <p className="medium font-medium">Dashboard</p>
                    </NavLink>
                  </li>
                  <li>
                    <NavLink
                      to="/admin/users"
                      onClick={toggleDrawer}
                      className={({ isActive }) =>
                        `dashLinks w-full max-w-full rounded-[16px] flex items-center gap-[10px] px-[20px] py-[15px]  ${
                          isActive ||
                          location.pathname === '/admin/user-detail/staking' ||
                          location.pathname === '/admin/user-detail/farming' ||
                          location.pathname === '/admin/user-transactions-history'
                            ? 'linearGradient text-white'
                            : 'text-primary'
                        }`
                      }
                    >
                      <Icon icon="mdi:users" width={24} height={24} />
                      <p className="medium font-medium">Users</p>
                    </NavLink>
                  </li>
                  <li>
                    <NavLink
                      to="/admin/staking"
                      onClick={toggleDrawer}
                      className={({ isActive }) =>
                        `dashLinks w-full max-w-full rounded-[16px] flex items-center gap-[10px] px-[20px] py-[15px]  ${
                          isActive || location.pathname === '/admin/staking-statistics' ? 'linearGradient text-white' : 'text-primary'
                        }`
                      }
                    >
                      <Icon icon="lets-icons:3d-box-fill" width={24} height={24} />
                      <p className="medium font-medium">Staking</p>
                    </NavLink>
                  </li>
                  <li>
                    <NavLink
                      to="/admin/farming"
                      onClick={toggleDrawer}
                      className={({ isActive }) =>
                        `dashLinks w-full max-w-full rounded-[16px] flex items-center gap-[10px] px-[20px] py-[15px]  ${
                          isActive || location.pathname === '/admin/farming-statistics' ? 'linearGradient text-white' : 'text-primary'
                        }`
                      }
                    >
                      <img
                        src={
                          location.pathname === '/admin/farming' || location.pathname === '/admin/farming-statistics'
                            ? '../../assets/icons/plant-white.png'
                            : '../../assets/icons/plant-black.png'
                        }
                        alt="plant"
                      />
                      <p className="medium font-medium">Farming</p>
                    </NavLink>
                  </li>
                </div>
                <div className="bottom-options ">
                  <li>
                    <NavLink
                      to="/admin/setting/profile"
                      onClick={toggleDrawer}
                      className={({ isActive }) =>
                        `dashLinks w-full max-w-full rounded-[16px] flex items-center gap-[10px] px-[20px] py-[15px]  ${
                          isActive || location.pathname === '/admin/setting/general' ? 'linearGradient text-white' : 'text-primary'
                        }`
                      }
                    >
                      <Icon icon="lets-icons:setting-line" width={24} height={24} />
                      <p className="medium font-medium">Settings</p>
                    </NavLink>
                  </li>

                  <li
                    className="flex items-center gap-[10px] px-[20px] py-[15px] text-primary cursor-pointer"
                    onClick={() => {
                      onLogoutClick()
                      toggleDrawer()
                    }}
                  >
                    <Icon icon="hugeicons:logout-03" width={24} height={24} />
                    <p className="medium font-medium">Logout</p>
                  </li>
                </div>
              </ul>
            </div>
          </div>
        </Drawer>
      </div>

      <LogoutModal isModalOpen={isModalOpen} setIsModalOpen={setIsModalOpen} />
    </>
  )
}

export default AdminSidebar
