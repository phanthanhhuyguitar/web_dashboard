import { Navigate, Route, Routes } from 'react-router-dom';

import DashboardPage from '../pages/DashboardPage.jsx';
import LoginPage from '../pages/LoginPage.jsx';
import NotificationTemplatesPage from '../pages/NotificationTemplatesPage.jsx';
import OrganizationPage from '../pages/OrganizationPage.jsx';
import SegmentManagementPage from '../pages/SegmentManagementPage.jsx';
import SegmentDetailPage from '../pages/SegmentDetailPage.jsx';
import SegmentUserConfigPage from '../pages/SegmentUserConfigPage.jsx';
import PrivateRoute from './PrivateRoute.jsx';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<PrivateRoute />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/organization" element={<OrganizationPage />} />
        <Route path="/notifications/templates" element={<NotificationTemplatesPage />} />
        <Route path="/segments" element={<SegmentManagementPage />} />
        <Route path="/segments/:segmentId/detail" element={<SegmentDetailPage />} />
        <Route path="/segments/:segmentId/users" element={<SegmentUserConfigPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default AppRoutes;
