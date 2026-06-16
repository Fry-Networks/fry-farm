// import { useEffect, useState } from 'react'
// import AreaChart from '../../components/dashboard/AreaChart'
// import BarGraph from '../../components/dashboard/barGraph'
// import Users from '../Users/users'

// const StakingStatistics: React.FC = () => {
//   const calculateTimeLeft = () => {
//     const targetDate = new Date() // Replace with your target date
//     targetDate.setDate(targetDate.getDate() + 2) // Example: 2 days from now
//     const difference = targetDate.getTime() - new Date().getTime()

//     let timeLeft = {
//       days: '00',
//       hours: '00',
//       minutes: '00',
//       seconds: '00',
//     }

//     if (difference > 0) {
//       timeLeft = {
//         days: String(Math.floor(difference / (1000 * 60 * 60 * 24))).padStart(2, '0'),
//         hours: String(Math.floor((difference / (1000 * 60 * 60)) % 24)).padStart(2, '0'),
//         minutes: String(Math.floor((difference / 1000 / 60) % 60)).padStart(2, '0'),
//         seconds: String(Math.floor((difference / 1000) % 60)).padStart(2, '0'),
//       }
//     }

//     return timeLeft
//   }

//   const [timeLeft, setTimeLeft] = useState(calculateTimeLeft())

//   useEffect(() => {
//     const timer = setInterval(() => {
//       setTimeLeft(calculateTimeLeft())
//     }, 1000)

//     return () => clearInterval(timer)
//   }, [])

//   return (
//     <>
//       <div className="statistics-main">
//         {/* Bars-div */}
//         <div className="statistics-top flex gap-[18px] max-sm:flex-col">
//           <div className="flex flex-col items-center gap-[20px] w-full px-[16px] py-[28px] bg-white rounded-[15px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
//             <p className="text-text_clr medium">Total Token Staked</p>
//             <h4 className="small text-primary font-medium tracking-[0.839px]">
//               504<span className="text-darkRed">ALGO</span>
//             </h4>
//           </div>

//           <div className="flex flex-col items-center gap-[20px] w-full px-[16px] py-[28px] bg-white rounded-[15px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
//             <p className="text-text_clr medium">Time Left</p>
//             <div className="flex gap-[7px] text-darkRed font-semibold tracking-[0.839px]">
//               <div className="flex flex-col items-center">
//                 <h4 className="small ">{timeLeft.days}</h4>
//                 <span className="e-small font-medium text-text_clr leading-[28px]">Days</span>
//               </div>
//               <span className="mt-[7px]">:</span>
//               <div className="flex flex-col items-center">
//                 <h4 className="small">{timeLeft.hours}</h4>
//                 <span className="e-small font-medium text-text_clr leading-[28px]">Hours</span>
//               </div>
//               <span className="mt-[7px]">:</span>
//               <div className="flex flex-col items-center">
//                 <h4 className="small">{timeLeft.minutes}</h4>
//                 <span className="e-small font-medium text-text_clr leading-[28px]">Min</span>
//               </div>
//               <span className="mt-[7px]">:</span>
//               <div className="flex flex-col items-center">
//                 <h4 className="small">{timeLeft.seconds}</h4>
//                 <span className="e-small font-medium text-text_clr leading-[28px]">Sec</span>
//               </div>
//             </div>
//           </div>

//           <div className="flex flex-col items-center gap-[20px] w-full px-[16px] py-[28px] bg-white rounded-[15px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
//             <p className="text-text_clr medium">Available Rewards</p>
//             <h4 className="small text-primary font-medium tracking-[0.839px]">
//               576<span className="text-darkRed">ALGO</span>
//             </h4>
//           </div>
//         </div>

//         {/* bar and line graph */}
//         <div className="flex mt-[18px] gap-[15px] max-sm:flex-col">
//           <div className="flex flex-col gap-[18px] max-sm:max-w-full max-w-[40%] w-full px-[24px] py-[18px] bg-white rounded-[15px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
//             <p className="font-bold text-black medium ">Current fee collected</p>
//             <BarGraph />
//           </div>

//           <div className="flex flex-col gap-[18px] max-sm:max-w-full max-w-[60%] w-full px-[24px] py-[18px] bg-white rounded-[15px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
//             <p className="font-bold text-black medium ">Total fry fee collected</p>
//             <AreaChart showYAxisTitle="" />
//           </div>
//         </div>

//         {/* fry-fee-collected-graph */}
//         <div className="my-[15px]">
//           <div className="flex flex-col gap-[18px] w-full px-[24px] py-[18px] bg-white rounded-[15px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
//             <div className="flex gap-[10px] items-center justify-between sm-s:flex-col sm-s:items-start">
//               <p className="font-bold text-black medium ">FRY fee collected</p>
//               <div className="switcher flex justify-center items-center sm-s:gap-[0px] gap-[20px]  w-fit p-[3px] bg-transparent rounded-[8px] border-solid border-2 border-[#FF8080]">
//                 <p className="text-text_clr small font-semibold flex items-center justify-center  text-center cursor-pointer tracking-[0.09px] rounded-[6px] w-[92px] h-[29px] ">
//                   Per Day
//                 </p>
//                 <p className="text-darkRed bg-[#F7C4C4] small font-semibold flex items-center justify-center  text-center cursor-pointer tracking-[0.09px] rounded-[6px] w-[92px] h-[29px] ">
//                   Per Month
//                 </p>
//                 <p className="text-text_clr small font-semibold flex items-center justify-center  text-center cursor-pointer tracking-[0.09px] rounded-[6px] w-[92px] h-[29px] ">
//                   Per Year
//                 </p>
//               </div>
//             </div>
//             <AreaChart showYAxisTitle="FRY fee collected" />
//           </div>
//         </div>

//         <Users showSearchBar={false} showviewALL={true} dataLimit={3} showPagination={false} />
//       </div>
//     </>
//   )
// }

// export default StakingStatistics

const StakingStatistics = () => {
  return (
    <div className="flex flex-col items-center justify-center p-8">
      <h2 className="text-xl font-semibold text-gray-700 mb-2">Staking Statistics</h2>
      <p className="text-gray-500">Coming soon</p>
    </div>
  )
}

export default StakingStatistics
