import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import AreaChartFarm from '../../dashboard/AreaChartFarm'
import BarGraphFarm from '../../dashboard/barGraphFarm'
import FarmPoolParticipants from './farmpoolParticipants'

const FarmPoolStats: React.FC = () => {
  const [poolData, setPoolData] = useState<number>(0)
  const [appId, setAppId] = useState<string>('')
  const [farmEndTime, setFarmEndTime] = useState<number | null>(null)

  const [timeLeft, setTimeLeft] = useState({
    days: '00',
    hours: '00',
    minutes: '00',
    seconds: '00',
  })

  const navigate = useNavigate()
  const location = useLocation()
  const queryParams = new URLSearchParams(location.search)

  // ✅ Get appId and immediately fetch stats
  useEffect(() => {
    const poolId = queryParams.get('appId')
    if (poolId) {
      setAppId(poolId)
      farmStats(poolId)
    } else {
      console.warn('No poolId found in URL query parameters')
    }
  }, [location.search])

  // ✅ Fetch farm stats
  const farmStats = async (appId: string) => {
    if (!appId) return
    try {
      const res = await axios.get(
        `${import.meta.env.VITE_API_BASE_URL}/stakingfarmingtoken/pool/${appId}`
      )
      const updatedTotalTokens = res.data?.totalBalance || 0
      setPoolData(updatedTotalTokens)

      const poolRes = await axios.get(
        `${import.meta.env.VITE_API_BASE_URL}/stakingfarmingtoken/appId/${appId}`
      )
      const farmEndTime = poolRes.data?.data?.[0]?.farmEndTime
      if (farmEndTime) {
        setFarmEndTime(Number(farmEndTime))
      }
    } catch (err) {
      console.error('Error fetching farm stats:', err)
    }
  }

  // ✅ Countdown logic
  const calculateTimeLeft = () => {
    if (!farmEndTime) return timeLeft

    const now = Math.floor(Date.now() / 1000)
    const diff = farmEndTime - now

    if (diff <= 0) {
      return {
        days: '00',
        hours: '00',
        minutes: '00',
        seconds: '00',
      }
    }

    return {
      days: String(Math.floor(diff / (60 * 60 * 24))).padStart(2, '0'),
      hours: String(Math.floor((diff / (60 * 60)) % 24)).padStart(2, '0'),
      minutes: String(Math.floor((diff / 60) % 60)).padStart(2, '0'),
      seconds: String(Math.floor(diff % 60)).padStart(2, '0'),
    }
  }

  // ✅ Only calculate countdown — no fetching here
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft())
    }, 1000)

    return () => clearInterval(timer)
  }, [farmEndTime])

  return (
    <div className="w-full mt-[67px] mb-[119px] sm-s:mb-[29px] flex-1">
      <div className="max-xxxl:w-[95%] w-[80%] m-auto flex flex-col gap-[38px] sm-s:gap-[20px]">
        {/* Header */}
        <div className="flex justify-between items-center sm-s:flex-col gap-[20px]">
          <img
            src="../../assets/icons/back-redArrow.svg"
            alt="arrow"
            className="cursor-pointer sm-s:w-[40px] sm-s:h-[40px]"
            onClick={() => navigate('/farm')}
          />
          <h1 className="font-apex text-grad uppercase text-center sm-s:text-[60px]">Farm Statistics</h1>
          <div></div>
        </div>

        {/* Stats Boxes */}
        <div className="statistics-main w-full">
          <div className="statistics-top flex gap-[18px] max-sm:flex-col">
            {/* TVL */}
            <div className="flex flex-col items-center gap-[20px] w-full px-[16px] py-[28px] bg-white rounded-[15px] shadow">
              <p className="text-text_clr medium">Total Token Staked</p>
              <h4 className="small text-primary font-medium tracking-[0.839px]">{(poolData / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}</h4>
            </div>

            {/* Timer */}
            <div className="flex flex-col items-center gap-[20px] w-full px-[16px] py-[28px] bg-white rounded-[15px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
              <p className="text-text_clr medium">Time Left</p>
              <div className="flex gap-[7px] text-darkRed font-semibold tracking-[0.839px]">
                <div className="flex flex-col items-center">
                  <h4 className="small">{timeLeft.days}</h4>
                  <span className="e-small font-medium text-text_clr leading-[28px]">Days</span>
                </div>
                <span className="mt-[7px]">:</span>
                <div className="flex flex-col items-center">
                  <h4 className="small">{timeLeft.hours}</h4>
                  <span className="e-small font-medium text-text_clr leading-[28px]">Hours</span>
                </div>
                <span className="mt-[7px]">:</span>
                <div className="flex flex-col items-center">
                  <h4 className="small">{timeLeft.minutes}</h4>
                  <span className="e-small font-medium text-text_clr leading-[28px]">Min</span>
                </div>
                <span className="mt-[7px]">:</span>
                <div className="flex flex-col items-center">
                  <h4 className="small">{timeLeft.seconds}</h4>
                  <span className="e-small font-medium text-text_clr leading-[28px]">Sec</span>
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          {appId && (
            <div className="flex mt-[18px] gap-[15px] max-sm:flex-col">
              <div className="flex flex-col gap-[18px] max-sm:max-w-full max-w-[40%] w-full px-[24px] py-[18px] bg-white rounded-[15px] shadow">
                <p className="font-bold text-black medium">Current fee collected</p>
                <BarGraphFarm appId={Number(appId)} />
              </div>

              <div className="flex flex-col gap-[18px] max-sm:max-w-full max-w-[60%] w-full px-[24px] py-[18px] bg-white rounded-[15px] shadow">
                <p className="font-bold text-black medium">Total fry fee collected</p>
                <AreaChartFarm showYAxisTitle="" appId={Number(appId)} />
              </div>
            </div>
          )}

          {/* Participants */}
          <div className="flex mt-[18px] gap-[15px] max-sm:flex-col">
            <div className="flex flex-col gap-[18px] w-full px-[24px] py-[18px] bg-white rounded-[15px] shadow">
              {appId && <FarmPoolParticipants appId={Number(appId)} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FarmPoolStats
