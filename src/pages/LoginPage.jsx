import { Navigate } from 'react-router-dom';

import LoginForm from '../components/auth/LoginForm.jsx';
import { hasAccessToken } from '../utils/storage.js';

function LoginPage() {
  if (hasAccessToken()) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <main className="login-page">
      <section className="login-brand-panel" aria-label="TNEX Partner branding">
        <div className="brand-mark">TNEX</div>
        <div>
          <p className="brand-kicker">TNEX Partner</p>
          <h1>Admin Dashboard</h1>
          <p className="brand-description">
            Theo dõi hiệu suất bán hàng, sản phẩm, đội ngũ và đối soát TNEX Partner.
          </p>
        </div>
      </section>

      <section className="login-form-panel" aria-label="Login form">
        <LoginForm />
      </section>
    </main>
  );
}

export default LoginPage;
