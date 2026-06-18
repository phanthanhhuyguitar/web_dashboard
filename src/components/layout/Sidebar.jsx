import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const menuItems = [
  { label: 'Trang chủ', icon: '▦', path: '/dashboard' },
  {
    label: 'Trung tâm thông báo',
    icon: '▧',
    hasChildren: true,
    matchPaths: ['/notifications', '/segments'],
    children: [
      { label: 'Nội dung thông báo', path: '/notifications/templates' },
      { label: 'Quản lý Segment', path: '/segments' },
    ],
  },
  { label: 'Mô hình tổ chức', icon: '⌬', path: '/organization' },
];

function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [expandedMenus, setExpandedMenus] = useState(() => new Set());

  const isItemActive = (item) => {
    if (item.matchPaths) {
      return item.matchPaths.some((matchPath) => location.pathname.startsWith(matchPath));
    }

    if (item.match) return location.pathname.startsWith(item.match);

    return item.path === location.pathname;
  };

  const isChildActive = (child) => child.path === location.pathname;

  const handleNavigate = (item) => {
    if (item.children?.length) {
      setExpandedMenus((current) => {
        const next = new Set(current);

        if (next.has(item.label)) {
          next.delete(item.label);
        } else {
          next.add(item.label);
        }

        return next;
      });
      return;
    }

    if (!item.path) return;

    navigate(item.path);
  };

  return (
    <aside className="dashboard-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">T</div>
        <div>
          <strong>TNEX Partner</strong>
          <span>Admin Console</span>
        </div>
        <button className="sidebar-collapse" type="button" aria-label="Thu gọn sidebar">
          ▫
        </button>
      </div>

      <nav className="sidebar-nav" aria-label="Dashboard navigation">
        {menuItems.map((item) => {
          const isActive = isItemActive(item);
          const isExpanded = isActive || expandedMenus.has(item.label);

          return (
            <div className="sidebar-nav-group" key={item.label}>
              <button
                className={`sidebar-nav-item${isActive ? ' is-active' : ''}${isExpanded ? ' is-expanded' : ''}${item.children ? ' has-children' : ''}`}
                type="button"
                onClick={() => handleNavigate(item)}
                aria-expanded={item.children ? isExpanded : undefined}
              >
                <span className="sidebar-icon">{item.icon}</span>
                <span>{item.label}</span>
                {item.hasChildren ? <span className="sidebar-chevron">{isExpanded ? '⌃' : '⌄'}</span> : null}
              </button>

              {item.children && isExpanded ? (
                <div className="sidebar-subnav">
                  {item.children.map((child) => (
                    <button
                      className={`sidebar-subnav-item${isChildActive(child) ? ' is-active' : ''}`}
                      type="button"
                      onClick={() => navigate(child.path)}
                      key={child.label}
                    >
                      {child.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <strong>TNEX Partner</strong>
        <span>Admin Console • Version 1.0</span>
      </div>
    </aside>
  );
}

export default Sidebar;
