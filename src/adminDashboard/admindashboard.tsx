import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Dashnavbar from '../components/dashboard/dashnavbar'
import Sidebar from '../components/dashboard/sidebar'

const AdminDashboard: React.FC = () => {
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false)

  const toggleDrawer = (): void => {
    setIsDrawerOpen(!isDrawerOpen)
  }

  return (
    <>
      <div className="flex overflow-x-hidden relative min-h-screen bg-dashbg">
        {/* Sidebar */}
        <div className="p-[12px] max-md:p-[0px]">
          <Sidebar isDrawerOpen={isDrawerOpen} toggleDrawer={toggleDrawer} />
        </div>

        {/* Main Content */}
        <div className="p-[12px] pl-[20px] ml-auto max-w-full w-[calc(100vw-270px)] max-md:w-full max-md:ml-0 max-sm:px-[20px] max-sm:py-[10px]">
          <Dashnavbar toggleDrawer={toggleDrawer} />
          {/* <div className="page-dom max-h-[87vh] max-exl:max-h-[82vh] overflow-y-auto pr-[10px]"> */}

          <div className="page-dom ">
            <Outlet />
          </div>
        </div>
      </div>
    </>
  )
}

export default AdminDashboard
