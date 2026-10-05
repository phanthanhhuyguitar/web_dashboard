import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { fetchSyncFreshness } from '../api/dataQualityApi.js';
import { fetchAllLoans } from '../api/loansApi.js';
import { reportNotifications } from '../api/notificationCenterApi.js';
import { fetchManageTeamsWithUsers } from '../api/orgUnitsApi.js';
import { fetchAllUsers } from '../api/usersApi.js';
import EmptyState from '../components/common/EmptyState.jsx';
import ErrorState from '../components/common/ErrorState.jsx';
import LoadingState from '../components/common/LoadingState.jsx';
import Sidebar from '../components/layout/Sidebar.jsx';
import Topbar from '../components/layout/Topbar.jsx';
import SyncProgressPanel from '../components/dataQuality/SyncProgressPanel.jsx';
import SyncTriggerButton from '../components/dataQuality/SyncTriggerButton.jsx';
import { DEFAULT_PAGE_SIZE } from '../config/constants.js';
import { useAppSettings } from '../context/AppSettingsContext.jsx';
import { useDataSyncPanel } from '../hooks/useDataSyncPanel.js';
import { runDataQualityChecks } from '../services/dataQuality/dataQualityChecks.service.js';
import { getSafeErrorMessage } from '../utils/error.js';
import { clearAccessToken } from '../utils/storage.js';

const SEVERITY_LABELS = {
  error: 'Nghiêm trọng',
  warning: 'Cần xem',
  info: 'Thông tin',
};

function SeverityBadge({ severity }) {
  return <span className={`data-quality-badge data-quality-badge-${severity}`}>{SEVERITY_LABELS[severity] || severity}</span>;
}

function CheckCard({ check, isFocused }) {
  const [expanded, setExpanded] = useState(check.severity !== 'info' && check.count > 0);

  // Duoc dieu huong toi tu NotificationBell (bam vao thong bao Data Quality) - buoc mo rong dung
  // check nay ke ca khi mac dinh dang thu gon (severity 'info' hoac count = 0 tai thoi diem render dau).
  useEffect(() => {
    if (isFocused) setExpanded(true);
  }, [isFocused]);

  return (
    <section id={`dq-check-${check.id}`} className={`data-quality-card data-quality-card-${check.severity}`}>
      <button
        className="data-quality-card-header"
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
      >
        <div className="data-quality-card-heading">
          <SeverityBadge severity={check.severity} />
          <strong>{check.title}</strong>
        </div>
        <div className="data-quality-card-count-wrap">
          <span className="data-quality-card-count">{check.count.toLocaleString('vi-VN')}</span>
          <span className="data-quality-card-toggle" aria-hidden="true">
            {expanded ? '-' : '+'}
          </span>
        </div>
      </button>

      <p className="data-quality-card-description">{check.description}</p>

      {expanded && check.samples.length > 0 ? (
        <ul className="data-quality-sample-list">
          {check.samples.map((sample, index) => (
            <li className="data-quality-sample-item" key={`${sample.label}-${index}`}>
              <strong>{sample.label}</strong>
              <span>{sample.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function DataQualityPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const focusCheckId = location.state?.focusCheckId;
  const syncPanel = useDataSyncPanel();
  const { settings } = useAppSettings();
  const [checks, setChecks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const runChecks = useCallback(async ({ force = false } = {}) => {
    setRefreshing(force);
    setError('');

    try {
      const [loansResult, usersResult, teamsResult, freshnessResult] = await Promise.allSettled([
        fetchAllLoans({ size: DEFAULT_PAGE_SIZE }),
        fetchAllUsers({ size: DEFAULT_PAGE_SIZE }),
        fetchManageTeamsWithUsers({ useCache: !force }),
        fetchSyncFreshness(),
      ]);

      if (loansResult.status === 'rejected' && usersResult.status === 'rejected') {
        throw loansResult.reason || usersResult.reason;
      }

      const results = runDataQualityChecks({
        loans: loansResult.status === 'fulfilled' ? loansResult.value : [],
        users: usersResult.status === 'fulfilled' ? usersResult.value : [],
        teams: teamsResult.status === 'fulfilled' ? teamsResult.value : [],
        syncFreshness: freshnessResult.status === 'fulfilled' ? freshnessResult.value : null,
        staleDays: settings.syncStaleDays,
      });

      setChecks(results);
    } catch (requestError) {
      setChecks(null);
      setError(getSafeErrorMessage(requestError, 'Không kiểm tra được chất lượng dữ liệu.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [settings.syncStaleDays]);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  useEffect(() => {
    if (!checks) return;

    // Luon goi ke ca khong con check nao co loi - de server tu dong "resolve" cac thong bao cu.
    reportNotifications(
      'DATA_QUALITY',
      checks
        .filter((check) => check.count > 0)
        .map((check) => ({
          sourceKey: `dq:${check.id}`,
          title: check.title,
          message: check.description,
          severity: check.severity,
        }))
    );
  }, [checks]);

  // Duoc dieu huong toi tu NotificationBell - cuon toi dung the check sau khi da render xong voi
  // du lieu that (CheckCard tu buoc mo rong qua prop isFocused o tren).
  useEffect(() => {
    if (!checks || !focusCheckId) return;

    document.getElementById(`dq-check-${focusCheckId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checks, location.key]);

  const handleLogout = () => {
    clearAccessToken();
    navigate('/login', { replace: true });
  };

  const totalIssues = checks ? checks.reduce((sum, check) => sum + (check.severity !== 'info' ? check.count : 0), 0) : 0;
  const reviewList = checks ? checks.filter((check) => check.severity !== 'info' && check.count > 0) : [];

  const scrollToCheck = (checkId) => {
    document.getElementById(`dq-check-${checkId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="dashboard-shell">
      <Sidebar />
      <div className="dashboard-main">
        <Topbar
          breadcrumbs={['Hệ thống quản trị', 'Kiểm tra dữ liệu']}
          isRefreshing={loading || refreshing}
          onLogout={handleLogout}
          onRefresh={() => runChecks({ force: true })}
        />

        <main className="dashboard-content segment-page">
          <div className="dashboard-heading-row">
            <div>
              <h1>Kiểm tra chất lượng dữ liệu</h1>
              <p>
                Tự động rà soát dữ liệu đang có (đơn vay, user, team) để phát hiện sớm bất thường có thể ảnh hưởng tới số
                liệu dashboard - tính lại mỗi khi mở trang, không lưu lịch sử.
              </p>
            </div>
            <SyncTriggerButton
              isSyncRunning={syncPanel.isSyncRunning}
              syncMenuOpen={syncPanel.syncMenuOpen}
              toggleSyncMenu={syncPanel.toggleSyncMenu}
              handleSyncAction={syncPanel.handleSyncAction}
            />
          </div>

          <SyncProgressPanel {...syncPanel} />

          {loading ? <LoadingState className="chart-state" text="Đang rà soát dữ liệu..." /> : null}

          {!loading && error ? <ErrorState className="chart-state" text={error} /> : null}

          {!loading && !error && checks && checks.length === 0 ? (
            <EmptyState className="chart-state" text="Không có dữ liệu để kiểm tra." />
          ) : null}

          {!loading && !error && checks && checks.length > 0 ? (
            <>
              <div className={`data-quality-summary${totalIssues > 0 ? ' has-issues' : ' is-clean'}`}>
                <p className="data-quality-summary-text">
                  {totalIssues > 0
                    ? `Tổng cộng ${totalIssues.toLocaleString('vi-VN')} trường hợp cần xem lại.`
                    : 'Không phát hiện bất thường đáng chú ý nào.'}
                </p>

                {reviewList.length > 0 ? (
                  <ul className="data-quality-summary-list">
                    {reviewList.map((check) => (
                      <li key={check.id}>
                        <button
                          className="data-quality-summary-list-item"
                          type="button"
                          onClick={() => scrollToCheck(check.id)}
                        >
                          <SeverityBadge severity={check.severity} />
                          <span className="data-quality-summary-list-title">{check.title}</span>
                          <strong className="data-quality-summary-list-count">
                            {check.count.toLocaleString('vi-VN')}
                          </strong>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="data-quality-list">
                {checks.map((check) => (
                  <CheckCard check={check} isFocused={check.id === focusCheckId} key={check.id} />
                ))}
              </div>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}

export default DataQualityPage;
