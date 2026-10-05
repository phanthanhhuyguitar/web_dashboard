import { useCallback, useEffect } from 'react';

import { useAppSettings } from '../context/AppSettingsContext.jsx';

export function applyTheme(theme) {
  if (typeof document === 'undefined') return;

  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
}

// Theme gio la 1 field trong AppSettingsContext (dong bo storage voi trang Cai dat) - hook nay
// chi con la lop tien ich de cac component cu (Topbar...) dung API isDark/toggleTheme quen thuoc.
export function useTheme() {
  const { settings, updateSetting } = useAppSettings();
  const theme = settings.theme;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    updateSetting('theme', theme === 'dark' ? 'light' : 'dark');
  }, [theme, updateSetting]);

  return { theme, isDark: theme === 'dark', toggleTheme };
}
