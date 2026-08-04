import { Navigate, Outlet } from 'react-router-dom';

import ChatAssistant from '../components/assistant/ChatAssistant.jsx';
import { hasAccessToken } from '../utils/storage.js';

function PrivateRoute() {
  if (!hasAccessToken()) return <Navigate to="/login" replace />;

  return (
    <>
      <Outlet />
      <ChatAssistant />
    </>
  );
}

export default PrivateRoute;
