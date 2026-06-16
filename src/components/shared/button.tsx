import { Icon } from '@iconify/react'

interface ButtonProps {
  text?: string
  img?: string
  className?: string
  onClick?: () => void
  minHeight?: string | number
  maxHeight?: string | number
  minWidth?: string | number
  maxWidth?: string | number
  height?: string | number
  width?: string | number
  disabled?: boolean
  imgClass?: string
  loading?: boolean
  padding?: string | number
  imgright?: string
  clr?: string
}

const Button: React.FC<ButtonProps> = ({
  text,
  img,
  className = '',
  onClick,
  minHeight,
  maxHeight,
  minWidth,
  maxWidth,
  height,
  width,
  disabled = false,
  imgClass = '',
  loading = false,
  padding,
  imgright,
  clr,
}) => {
  const buttonStyle: React.CSSProperties = {
    minHeight,
    maxHeight,
    minWidth,
    maxWidth,
    height,
    width,
    padding,
  }

  return (
    <button className={`flex justify-center ${className}`} style={buttonStyle} onClick={onClick} disabled={loading || disabled}>
      {loading ? (
        <span className="flex justify-center items-center">
          <Icon icon="eos-icons:loading" width={22} className="text-white" />
        </span>
      ) : (
        <>
          {img && <Icon icon={img} className={`cursor-pointer ${imgClass}`} color={clr} width={18} height={18} />}
          <span>{text}</span>
          {imgright && <Icon icon={imgright} className="cursor-pointer" color={clr} width={20} height={20} />}
        </>
      )}
    </button>
  )
}

export default Button
