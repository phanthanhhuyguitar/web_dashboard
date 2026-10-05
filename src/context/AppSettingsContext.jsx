import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'tnex-app-settings';
const LEGACY_THEME_KEY = 'tnex-theme';

// Noi luu MOI cau hinh tuy chinh cua web (khac voi du lieu nghiep vu) - vd bat/tat hieu ung
// giao dien, giao dien sang/toi, nguong canh bao du lieu cu. Trang Cai dat (SettingsPage.jsx)
// doc/ghi qua day. Them 1 tuy chon moi sau nay chi can them 1 key vao DEFAULT_SETTINGS + doc/ghi
// qua updateSetting, khong can sua co che luu tru.
const DEFAULT_SETTINGS = {
  theme: 'light',
  fallingLeavesEnabled: true,
  cinematicBackgroundEnabled: true,
  syncStaleDays: 7,
  // Toc do tra cuu CTV BANG API THAT khi xuat file Excel doi soat (moi CTV = 2 lan goi API
  // that: search-users theo saleId, roi profile theo userId) - xem ReconciliationHistoryPage.jsx.
  // De thap hon cac job dong bo nen vi day la tinh nang moi, chay tu trinh duyet luc nguoi dung
  // dang cho.
  exportEnrichConcurrency: 2,
  exportEnrichDelayMs: 250,
};

// Doc dong bo (khong qua React) - dung ca luc render truoc khi App mount (main.jsx, tranh nhay
// sang FOUC) lan luc khoi tao AppSettingsProvider.
export function readStoredSettings() {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const merged = { ...DEFAULT_SETTINGS, ...parsed };

    // Di chu tu key rieng cua useTheme.js truoc day (truoc khi co AppSettingsContext) - tranh
    // reset lua chon dark mode nguoi dung da chon truoc do.
    if (!parsed.theme && window.localStorage.getItem(LEGACY_THEME_KEY) === 'dark') {
      merged.theme = 'dark';
    }

    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const AppSettingsContext = createContext(null);

// Gan 1 lan o goc app (main.jsx) - moi component con (FallingLeaves, SettingsPage...) doc/ghi
// qua cung 1 state nen thay doi o trang Cai dat co hieu luc ngay, khong can reload trang.
export function AppSettingsProvider({ children }) {
  const [settings, setSettings] = useState(readStoredSettings);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const updateSetting = useCallback((key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
  }, []);

  return <AppSettingsContext.Provider value={{ settings, updateSetting }}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings() {
  const context = useContext(AppSettingsContext);

  if (!context) {
    throw new Error('useAppSettings phai duoc dung ben trong AppSettingsProvider');
  }

  return context;
}
