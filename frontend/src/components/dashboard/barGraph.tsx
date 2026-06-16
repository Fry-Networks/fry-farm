import { ApexOptions } from 'apexcharts'
import { useEffect, useState } from 'react'
import ReactApexChart from 'react-apexcharts'
import axios from 'axios'

interface BarGraphProps {
  appId: number
}

const BarGraph: React.FC<BarGraphProps> = ({ appId }) => {
  const [series, setSeries] = useState([
    {
      name: 'Fees',
      data: [0, 0, 0, 0], // Default placeholder
    },
  ])

  const options: ApexOptions = {
    chart: {
      type: 'bar',
      toolbar: { show: false },
    },
    colors: ['#FF0000'],
    plotOptions: {
      bar: {
        borderRadius: 2,
        columnWidth: '50%',
      },
    },
    dataLabels: { enabled: false },
    xaxis: {
      categories: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
      labels: {
        style: {
          colors: '#7A7A7A',
        },
      },
    },
    yaxis: {
      labels: {
        formatter: (value) => `${value}`,
        style: {
          colors: '#7A7A7A',
        },
      },
    },
    grid: { strokeDashArray: 4 },
  }

  useEffect(() => {
    setSeries([{ name: 'Fees', data: [0, 0, 0, 0] }])

    const fetchWeeklyFees = async () => {
      try {
        const res = await axios.get(
          `${import.meta.env.VITE_API_BASE_URL}/gasfee/weekly?appId=${appId}`
        )

        if (res.data.success && Array.isArray(res.data.data)) {
          setSeries([{ name: 'Fees', data: res.data.data }])
        }
      } catch (err) {
        console.error('Failed to fetch weekly gas fees:', err)
      }
    }

    fetchWeeklyFees()
  }, [appId])

  return <ReactApexChart options={options} series={series} type="bar" height={300} />
}

export default BarGraph
