import { Icon } from '@iconify/react';
import { usePreferences } from '../../contexts/PreferencesContext';

const GrandmaToggle: React.FC = () => {
  const { isSimpleMode, toggleSimpleMode } = usePreferences();

  return (
    <button
      onClick={toggleSimpleMode}
      className="flex items-center justify-center w-[40px] h-[40px] rounded-full bg-transparent hover:bg-[var(--bg-secondary)] transition-colors"
      aria-label={isSimpleMode ? 'Switch to advanced view' : 'Switch to simple view'}
      title={isSimpleMode ? 'Simple Mode ON \u2014 Click for Advanced View' : 'Click for Simple Mode (hides technical details)'}
    >
      <Icon
        icon="mdi:glasses"
        width={24}
        height={24}
        color={isSimpleMode ? '#f5c542' : '#555555'}
      />
    </button>
  );
};

export default GrandmaToggle;
