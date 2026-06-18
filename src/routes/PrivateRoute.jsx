import { Navigate, Outlet } from 'react-router-dom';

import { hasAccessToken } from '../utils/storage.js';

function PrivateRoute() {
  return hasAccessToken() ? <Outlet /> : <Navigate to="/login" replace />;
}

export default PrivateRoute;
