import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'tnex-theme';

function getStoredTheme() {
  if (typeof window === 'undefined') return 'light';

  return window.localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') return;

  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
}

// Dung chung cho moi trang co Topbar - moi instance tu doc lai localStorage luc mount, nen
// luon dong bo voi lua chon gan nhat du khong co context/state dung chung giua cac trang.
export function useTheme() {
  const [theme, setTheme] = useState(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, isDark: theme === 'dark', toggleTheme };
}
