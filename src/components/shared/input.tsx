import { Icon } from '@iconify/react'
import React, { ChangeEvent, CSSProperties, useState } from 'react'

interface InputProps {
  type?: string
  wrapperClass?: string
  className?: string
  inputClass?: string
  label?: string
  labelClass?: string
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void
  name?: string
  id?: string
  value?: string | number
  placeholder?: string
  icon?: string
  maxWidth?: string | number
  maxHeight?: string | number
  minHeight?: string | number
  minWidth?: string | number
  height?: string | number
  width?: string | number
  maxLength?: number
  error?: boolean
  errorMessage?: string
  disabled?: boolean
  leftImg?: string
  min?: number
  max?: number
  required?: boolean
}

const Input: React.FC<InputProps> = ({
  type = 'text',
  wrapperClass = '',
  className = '',
  inputClass = '',
  label,
  labelClass = '',
  onChange,
  name,
  id,
  value,
  placeholder,
  icon,
  maxWidth,
  maxHeight,
  minHeight,
  minWidth,
  height,
  width,
  maxLength,
  error = false,
  errorMessage,
  disabled = false,
  leftImg,
  min,
  max,
  required = false,
}) => {
  const [showPassword, setShowPassword] = useState(false)

  const inputStyle: CSSProperties = {
    height,
    minHeight,
    maxHeight,
    width,
    minWidth,
    maxWidth,
  }

  const togglePassword = () => {
    setShowPassword(!showPassword)
  }

  const getInputType = (): string => {
    if (type === 'password') {
      return showPassword ? 'text' : 'password'
    } else {
      return type
    }
  }

  const getInputIcon = (): string => {
    switch (type) {
      case 'password':
        return showPassword ? 'mingcute:eye-2-fill' : 'mdi:eye-off'
      default:
        return icon || ''
    }
  }

  return (
    <>
      <div className={`input-box ${error ? 'error' : ''} ${className}`}>
        {label && <label className={labelClass}>{label}</label>}
        <div className={`input-wrapper flex items-center gap-[8px] ${wrapperClass} ${disabled ? 'disabled' : ''}`} style={inputStyle}>
          {leftImg && <img src={leftImg} alt="img" className="w-[16px] h-[16px]" />}
          <input
            autoComplete="off"
            type={getInputType()}
            id={id}
            name={name}
            value={value}
            onChange={onChange}
            className={inputClass}
            disabled={disabled}
            maxLength={maxLength}
            placeholder={placeholder}
            min={type === 'number' ? min : undefined}
            max={type === 'number' ? max : undefined}
            required={required}
          />
          {getInputIcon() && (
            <Icon
              icon={getInputIcon()!} // Use "!" if you're confident getInputIcon() always returns a string here.
              className="cursor-pointer"
              onClick={togglePassword}
              color="#717274"
              width={18}
              height={18}
            />
          )}
        </div>
        {errorMessage && <p className="extra-small text-xs font-medium text-red-600">{errorMessage}</p>}
      </div>
    </>
  )
}

export default Input
