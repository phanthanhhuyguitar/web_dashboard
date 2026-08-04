import { useTheme } from '../../hooks/useTheme.js';
import NotificationBell from './NotificationBell.jsx';

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.4M12 19.1v2.4M4.2 12H1.8M22.2 12h-2.4M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />
    </svg>
  );
}

function Topbar({ breadcrumbs, onLogout }) {
  const { isDark, toggleTheme } = useTheme();
  const breadcrumbItems = breadcrumbs?.length ? breadcrumbs : ['Hệ thống quản trị', 'Tnex Partner'];

  return (
    <header className="dashboard-topbar">
      <div className="topbar-status">
        <span className="status-dot" />
        {breadcrumbItems.map((item, index) => (
          <span className="topbar-breadcrumb" key={item}>
            {index > 0 ? <span className="topbar-divider" /> : null}
            {index === breadcrumbItems.length - 1 ? <strong>{item}</strong> : <span>{item}</span>}
          </span>
        ))}
      </div>

      <div className="topbar-actions">
        <button
          className={`theme-toggle${isDark ? ' is-dark' : ''}`}
          type="button"
          onClick={toggleTheme}
          role="switch"
          aria-checked={isDark}
          aria-label={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
          title={isDark ? 'Giao diện tối' : 'Giao diện sáng'}
        >
          <span className="theme-toggle-track">
            <span className="theme-toggle-icon theme-toggle-icon-sun">
              <SunIcon />
            </span>
            <span className="theme-toggle-icon theme-toggle-icon-moon">
              <MoonIcon />
            </span>
            <span className="theme-toggle-thumb" />
          </span>
        </button>

        <NotificationBell />

        <button className="topbar-logout" type="button" onClick={onLogout}>
          ↗ Đăng xuất
        </button>
      </div>
    </header>
  );
}

export default Topbar;
