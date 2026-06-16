import { Icon } from '@iconify/react'
import { NavLink, Outlet } from 'react-router-dom'

const Settings = () => {
  const baseClass = 'medium  flex items-center gap-[6px] pb-[3px]'
  const activeClass = 'text-darkRed cursor-pointer font-medium border-solid border-b-2 border-darkRed'
  const inactiveClass = 'text-[#767F8C]'

  return (
    <>
      <div className="flex flex-col gap-[28px] py-[27px] px-[32px] sm-s:px-[20px] bg-white rounded-[24px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
        <p className="elarge text-primary font-semibold">Settings</p>
        <div className="flex gap-[16px]">
          <NavLink to="/admin/setting/profile" className={({ isActive }) => `${baseClass}  ${isActive ? activeClass : inactiveClass}`}>
            <Icon icon="iconamoon:profile-circle-light" height={22} width={22} />
            Profile settings
          </NavLink>

          <NavLink to="/admin/setting/general" className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}>
            <Icon icon="weui:setting-outlined" height={22} width={22} />
            General settings
          </NavLink>
        </div>

        <div className="w-full">
          <Outlet />
        </div>
      </div>
    </>
  )
}

export default Settings
