import { ApexOptions } from 'apexcharts'
import { useEffect, useState } from 'react'
import ReactApexChart from 'react-apexcharts'
import axios from 'axios'

interface AreaChartProps {
  showYAxisTitle?: string
  appId: number
}

const AreaChartFarm: React.FC<AreaChartProps> = ({ showYAxisTitle, appId }) => {
  const [chartOptions, setChartOptions] = useState<ApexOptions>({
    chart: {
      type: 'area',
      height: 300,
    },
    colors: ['#ff4d4f'],
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.8,
        opacityTo: 0,
        stops: [0, 100],
      },
    },
    dataLabels: { enabled: false },
    stroke: {
      curve: 'smooth',
      width: 2,
    },
    xaxis: {
      categories: [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ],
      labels: {
        style: {
          colors: '#7A7A7A',
        },
      },
    },
    yaxis: {
      title: {
        text: showYAxisTitle,
        style: {
          color: '#7A7A7A',
        },
      },
      labels: {
        style: {
          colors: '#7A7A7A',
        },
      },
    },
    markers: {
      size: 6,
      colors: ['#fff'],
      strokeColors: '#FF0000',
      strokeWidth: 3,
    },
    tooltip: {
      theme: 'light',
      x: { format: 'dd MMM' },
    },
    grid: { strokeDashArray: 4 },
  })

  const [series, setSeries] = useState([
    {
      name: 'FRY Fee',
      data: Array(12).fill(0),
    },
  ])

  useEffect(() => {
    const fetchMonthlyGasFees = async () => {
      try {
        const res = await axios.get(
          `${import.meta.env.VITE_API_BASE_URL}/gasfee/monthly?appId=${appId}`
        )

        if (res.data.success && Array.isArray(res.data.data)) {
          setSeries([
            {
              name: 'FRY Fee',
              data: res.data.data,
            },
          ])
        }
      } catch (err) {
        console.error('Failed to fetch monthly gas fees:', err)
      }
    }

    fetchMonthlyGasFees()
  }, [appId])

  return <ReactApexChart options={chartOptions} series={series} type="area" height={300} />
}

export default AreaChartFarm
