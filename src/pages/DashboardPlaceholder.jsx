import { useNavigate } from 'react-router-dom';

import { clearAccessToken } from '../utils/storage.js';

function DashboardPlaceholder() {
  const navigate = useNavigate();

  const handleLogout = () => {
    clearAccessToken();
    navigate('/login', { replace: true });
  };

  return (
    <main className="dashboard-placeholder">
      <section className="dashboard-card">
        <p className="dashboard-eyebrow">TNEX Partner Admin Dashboard</p>
        <h1>Dashboard TNEX Partner - Coming soon</h1>
        <button className="secondary-button" type="button" onClick={handleLogout}>
          Đăng xuất
        </button>
      </section>
    </main>
  );
}

export default DashboardPlaceholder;
