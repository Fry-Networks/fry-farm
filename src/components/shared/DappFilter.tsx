import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

interface DappFilterProps {
  options?: { label: string; value: string }[]
  onFilterChange?: (dapp: string | null) => void
}

const DappFilter: React.FC<DappFilterProps> = ({
  options = [{ label: 'Haystack', value: 'haystack' }],
  onFilterChange
}) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedDapp, setSelectedDapp] = useState<string | null>(
    searchParams.get('dapp') || null
  )

  useEffect(() => {
    const dappParam = searchParams.get('dapp')
    setSelectedDapp(dappParam)
    onFilterChange?.(dappParam)
  }, [searchParams, onFilterChange])

  const handleSelectDapp = (value: string | null) => {
    setSelectedDapp(value)
    const newParams = new URLSearchParams(searchParams)
    if (value) {
      newParams.set('dapp', value)
    } else {
      newParams.delete('dapp')
    }
    setSearchParams(newParams)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-[var(--text-secondary)] font-medium">Filter by dapp:</span>

      <button
        onClick={() => handleSelectDapp(null)}
        className={selectedDapp === null ? 'px-3 py-1.5 rounded-full text-sm font-medium transition-colors bg-secondary text-white' : 'px-3 py-1.5 rounded-full text-sm font-medium transition-colors bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'}
      >
        All
      </button>

      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => handleSelectDapp(option.value)}
          className={selectedDapp === option.value ? 'px-3 py-1.5 rounded-full text-sm font-medium transition-colors bg-secondary text-white' : 'px-3 py-1.5 rounded-full text-sm font-medium transition-colors bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export default DappFilter
