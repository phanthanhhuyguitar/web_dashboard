function Topbar({ breadcrumbs, isRefreshing, onRefresh, onLogout }) {
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
        {onRefresh ? (
          <button className="topbar-link" type="button" onClick={onRefresh} disabled={isRefreshing}>
            {isRefreshing ? 'Đang làm mới...' : '↻ Làm mới dữ liệu'}
          </button>
        ) : null}
        <button className="topbar-logout" type="button" onClick={onLogout}>
          ↗ Đăng xuất
        </button>
      </div>
    </header>
  );
}

export default Topbar;
