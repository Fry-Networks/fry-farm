import { Icon } from '@iconify/react';
import { useTheme } from '../../contexts/ThemeContext';

const ThemeToggle: React.FC = () => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="flex items-center justify-center w-[40px] h-[40px] rounded-full bg-transparent hover:bg-[var(--bg-secondary)] transition-colors"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <Icon
        icon={isDark ? 'mdi:weather-sunny' : 'mdi:weather-night'}
        width={24}
        height={24}
        color={isDark ? '#f5c542' : '#555555'}
      />
    </button>
  );
};

export default ThemeToggle;
