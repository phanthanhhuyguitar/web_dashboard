import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import RouteLoadingFallback from '../components/common/RouteLoadingFallback.jsx';
import PrivateRoute from './PrivateRoute.jsx';

const DashboardPage = lazy(() => import('../pages/DashboardPage.jsx'));
const DataQualityPage = lazy(() => import('../pages/DataQualityPage.jsx'));
const LoginPage = lazy(() => import('../pages/LoginPage.jsx'));
const NotificationTemplatesPage = lazy(() => import('../pages/NotificationTemplatesPage.jsx'));
const OrganizationPage = lazy(() => import('../pages/OrganizationPage.jsx'));
const ReconciliationHistoryPage = lazy(() => import('../pages/ReconciliationHistoryPage.jsx'));
const SegmentManagementPage = lazy(() => import('../pages/SegmentManagementPage.jsx'));
const SegmentDetailPage = lazy(() => import('../pages/SegmentDetailPage.jsx'));
const SegmentUserConfigPage = lazy(() => import('../pages/SegmentUserConfigPage.jsx'));

function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
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
          <Route path="/reconciliations/history" element={<ReconciliationHistoryPage />} />
          <Route path="/data-quality" element={<DataQualityPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}

export default AppRoutes;
