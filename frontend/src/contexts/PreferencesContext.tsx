import React, { createContext, useContext, useState, useEffect } from 'react';

interface PreferencesContextValue {
  isSimpleMode: boolean;
  toggleSimpleMode: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSimpleMode, setIsSimpleMode] = useState(() => {
    const stored = localStorage.getItem('fry-simple-mode');
    return stored === 'true';
  });

  useEffect(() => {
    localStorage.setItem('fry-simple-mode', String(isSimpleMode));
  }, [isSimpleMode]);

  const toggleSimpleMode = () => setIsSimpleMode((prev) => !prev);

  return (
    <PreferencesContext.Provider value={{ isSimpleMode, toggleSimpleMode }}>
      {children}
    </PreferencesContext.Provider>
  );
};

export const usePreferences = (): PreferencesContextValue => {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used within a PreferencesProvider');
  return context;
};
