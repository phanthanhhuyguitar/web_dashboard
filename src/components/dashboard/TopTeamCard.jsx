import { memo, useEffect, useMemo, useRef, useState } from 'react';

import EmptyState from '../common/EmptyState.jsx';
import ErrorState from '../common/ErrorState.jsx';
import LoadingState from '../common/LoadingState.jsx';
import OrgRevenueTree, { normalizeSearchText } from './OrgRevenueTree.jsx';
import { fetchOrganizationUnits } from '../../api/orgUnitsApi.js';
import { exportOrgRevenueTreeToExcel } from '../../utils/orgRevenueTreeExport.js';
import { buildOrgRevenueTree, calculateTeamRiskAlerts, getTeamLeaderLabel } from '../../utils/teamMetrics.js';
import { formatNumber, formatVndCompact } from '../../utils/formatNumber.js';
import { reportNotifications } from '../../api/notificationCenterApi.js';

function getRiskReasonText(team) {
  const reasons = [];

  if (team.isDropping) {
    reasons.push(`Giảm ${Math.abs(Math.round(team.changePercent))}% so cùng kỳ`);
  }

  if (team.isInactive) {
    reasons.push(`Không có đơn ${formatNumber(team.daysSinceLastOrder)} ngày`);
  }

  return reasons.join(' • ');
}

function TopTeamCard({ data = [], status = 'ready', teams = [], loans = [], range, focusRiskRequestId = null }) {
  const [modalMode, setModalMode] = useState(null);
  const [searchValue, setSearchValue] = useState('');
  const [orgUnits, setOrgUnits] = useState([]);
  const [overviewStatus, setOverviewStatus] = useState('idle');
  const [overviewRetryToken, setOverviewRetryToken] = useState(0);
  const [exportingTree, setExportingTree] = useState(false);
  const overviewRequestRef = useRef(0);
  const isLoading = status === 'loading';
  const isError = status === 'error';
  const canOpenDetail = !isLoading && !isError;
  const isModalOpen = modalMode !== null;
  const rankedTeams = useMemo(
    () =>
      data.map((item, index) => ({
        ...item,
        rank: index + 1,
      })),
    [data]
  );
  const displayTeams = rankedTeams.slice(0, 5);
  const filteredTeams = useMemo(() => {
    const keyword = normalizeSearchText(searchValue);

    if (!keyword) return rankedTeams;

    return rankedTeams.filter((item) => {
      const searchableText = [item.teamName, item.teamCode, item.leadName, item.leadSaleId, item.bmName, item.bmSaleId]
        .map(normalizeSearchText)
        .join(' ');

      return searchableText.includes(keyword);
    });
  }, [rankedTeams, searchValue]);

  const orgRevenueTree = useMemo(
    () => (range ? buildOrgRevenueTree(orgUnits, teams, loans, range) : []),
    [orgUnits, teams, loans, range]
  );
  const riskAlerts = useMemo(
    () => (range ? calculateTeamRiskAlerts(teams, loans, range) : []),
    [teams, loans, range]
  );

  useEffect(() => {
    if (!range) return;

    // Luon goi ke ca riskAlerts rong - de server tu dong "resolve" cac thong bao cu neu
    // van de goc da het (xem reportNotifications trong notificationStore.cjs).
    reportNotifications(
      'TEAM_RISK',
      riskAlerts.map((item) => ({
        sourceKey: `team-risk:${item.orgUnitId}`,
        title: `${item.teamName} / ${item.teamCode || '--'}`,
        message: getRiskReasonText(item),
        severity: 'warning',
      }))
    );
  }, [riskAlerts, range]);

  // Duoc dieu huong toi tu NotificationBell (bam vao thong bao Team lech cau truc) - tu mo modal
  // canh bao. Dung 1 gia tri doi moi (location.key tu DashboardPage) lam dependency de van chay
  // lai ke ca bam nhieu lan thong bao khac nhau trong khi da dang dung san o trang nay.
  useEffect(() => {
    if (!focusRiskRequestId) return;

    setSearchValue('');
    setModalMode('risk');
  }, [focusRiskRequestId]);

  useEffect(() => {
    if (modalMode !== 'overview') return;

    const requestId = overviewRequestRef.current + 1;

    overviewRequestRef.current = requestId;
    setOverviewStatus('loading');

    fetchOrganizationUnits()
      .then((result) => {
        if (overviewRequestRef.current !== requestId) return;

        setOrgUnits(Array.isArray(result) ? result : []);
        setOverviewStatus('ready');
      })
      .catch(() => {
        if (overviewRequestRef.current !== requestId) return;

        setOverviewStatus('error');
      });
  }, [modalMode, overviewRetryToken]);

  useEffect(() => {
    if (!isModalOpen) return undefined;

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setModalMode(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModalOpen]);

  const openModal = (mode) => {
    setSearchValue('');
    setModalMode(mode);
  };

  const closeModal = () => setModalMode(null);

  const retryOverview = () => setOverviewRetryToken((token) => token + 1);

  const handleExportOrgTree = async () => {
    if (exportingTree || orgRevenueTree.length === 0) return;

    setExportingTree(true);

    try {
      await exportOrgRevenueTreeToExcel(orgRevenueTree);
    } finally {
      setExportingTree(false);
    }
  };

  return (
    <>
      <section className="dashboard-card compact-card">
      <div className="card-header-row top-team-card-header">
        <div>
        <h2>Top Team theo doanh số giải ngân</h2>
        <p>Xếp hạng team theo số tiền giải ngân trong tháng đã chọn</p>
        </div>
        <div className="top-team-tabs">
          <div className="top-team-tabs-row">
            <button
              className="top-team-tab-link"
              type="button"
              onClick={() => openModal('overview')}
              disabled={!canOpenDetail}
            >
              Overview
            </button>
            <span className="top-team-tab-divider">|</span>
            <button
              className="top-team-tab-link"
              type="button"
              onClick={() => openModal('detail')}
              disabled={!canOpenDetail}
            >
              Chi tiết
            </button>
          </div>
          <button
            className="top-team-tab-risk"
            type="button"
            onClick={() => openModal('risk')}
            disabled={!canOpenDetail}
          >
            {riskAlerts.length > 0 ? (
              <span className="top-team-risk-dot" aria-hidden="true">
                <span className="top-team-risk-dot-ping" />
              </span>
            ) : null}
            Cảnh báo{riskAlerts.length > 0 ? ` (${riskAlerts.length})` : ''}
          </button>
        </div>
      </div>

      {isLoading ? <LoadingState className="chart-state leader-state" text="Đang tải dữ liệu team..." /> : null}

      {isError ? <ErrorState className="chart-state leader-state" text="Không tải được dữ liệu Top Team" /> : null}

      {!isLoading && !isError && data.length === 0 ? (
        <EmptyState
          className="chart-state leader-state"
          text="Chưa có team phát sinh doanh số giải ngân trong kỳ đã chọn"
        />
      ) : null}

      {!isLoading && !isError && displayTeams.length > 0 ? (
        <div className="team-list">
          {displayTeams.map((item) => (
            <div className="team-row" key={item.orgUnitId}>
              <span className={`rank-badge rank-${Math.min(item.rank, 4)}`}>{item.rank}</span>
              <div className="team-main">
                <strong>
                  {item.teamName} / {item.teamCode || '--'}
                </strong>
                <p>
                  {getTeamLeaderLabel(item)} • {formatNumber(item.ctvCount)} CTV •{' '}
                  {formatNumber(item.closedLoanCount)} đơn
                </p>
              </div>
              <span>{formatVndCompact(item.disbursementAmount)}</span>
            </div>
          ))}
        </div>
      ) : null}
      </section>

      {isModalOpen ? (
        <div className="top-team-modal-backdrop" role="presentation" onMouseDown={closeModal}>
          <section
            className="top-team-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="top-team-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="top-team-modal-header">
              <div>
                {modalMode === 'overview' ? (
                  <>
                    <h2 id="top-team-modal-title">Overview Top Team theo doanh số giải ngân</h2>
                    <p>Doanh số giải ngân theo cây tổ chức trong tháng hiện tại</p>
                  </>
                ) : null}
                {modalMode === 'detail' ? (
                  <>
                    <h2 id="top-team-modal-title">Chi tiết Top Team theo doanh số giải ngân</h2>
                    <p>Danh sách tất cả team theo doanh số giải ngân trong tháng hiện tại</p>
                  </>
                ) : null}
                {modalMode === 'risk' ? (
                  <>
                    <h2 id="top-team-modal-title">Team cần chú ý</h2>
                    <p>Team giảm doanh số mạnh so với cùng kỳ tháng trước, hoặc không phát sinh đơn giải ngân trong thời gian gần đây</p>
                  </>
                ) : null}
              </div>
              <div className="top-team-modal-header-actions">
                {modalMode === 'overview' ? (
                  <button
                    className="top-team-modal-export"
                    type="button"
                    onClick={handleExportOrgTree}
                    disabled={exportingTree || overviewStatus !== 'ready' || orgRevenueTree.length === 0}
                  >
                    {exportingTree ? 'Đang xuất...' : 'Xuất Excel'}
                  </button>
                ) : null}
                <button
                  className="top-team-modal-close"
                  type="button"
                  onClick={closeModal}
                  aria-label="Đóng modal"
                >
                  ×
                </button>
              </div>
            </div>

            {modalMode === 'detail' ? (
              <div className="top-team-modal-toolbar">
                <input
                  type="search"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Tìm kiếm theo team hoặc lead..."
                  aria-label="Tìm kiếm"
                />
              </div>
            ) : null}

            {modalMode === 'detail' ? (
              <>
                {rankedTeams.length === 0 ? (
                  <EmptyState
                    className="chart-state top-team-modal-state"
                    text="Không có dữ liệu team trong tháng hiện tại"
                  />
                ) : null}

                {rankedTeams.length > 0 && filteredTeams.length === 0 ? (
                  <EmptyState className="chart-state top-team-modal-state" text="Không tìm thấy team phù hợp" />
                ) : null}

                {filteredTeams.length > 0 ? (
                  <div className="top-team-table-wrap">
                    <table className="top-team-table">
                      <thead>
                        <tr>
                          <th>Rank</th>
                          <th>Team</th>
                          <th>Quản lý</th>
                          <th>Số CTV</th>
                          <th>Số đơn</th>
                          <th>Doanh số giải ngân</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTeams.map((item) => (
                          <tr key={item.orgUnitId}>
                            <td>{item.rank}</td>
                            <td>
                              <strong>
                                {item.teamName} / {item.teamCode || '--'}
                              </strong>
                            </td>
                            <td>{item.leadName}</td>
                            <td>{formatNumber(item.ctvCount)} CTV</td>
                            <td>{formatNumber(item.closedLoanCount)} đơn</td>
                            <td>{formatVndCompact(item.disbursementAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            ) : null}

            {modalMode === 'risk' ? (
              <>
                {riskAlerts.length === 0 ? (
                  <EmptyState className="chart-state top-team-modal-state" text="Hiện không có team nào cần chú ý" />
                ) : (
                  <div className="top-team-table-wrap">
                    <table className="team-risk-table">
                      <thead>
                        <tr>
                          <th>Team</th>
                          <th>Quản lý</th>
                          <th>Lý do</th>
                          <th>Doanh số hiện tại</th>
                          <th>Cùng kỳ trước</th>
                        </tr>
                      </thead>
                      <tbody>
                        {riskAlerts.map((item) => (
                          <tr key={item.orgUnitId}>
                            <td>
                              <strong>
                                {item.teamName} / {item.teamCode || '--'}
                              </strong>
                            </td>
                            <td>{item.leadName}</td>
                            <td>{getRiskReasonText(item)}</td>
                            <td>{formatVndCompact(item.disbursementAmount)}</td>
                            <td>{formatVndCompact(item.previousDisbursementAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}

            {modalMode === 'overview' ? (
              <>
                {overviewStatus === 'loading' ? (
                  <LoadingState className="chart-state top-team-modal-state" text="Đang tải cây tổ chức..." />
                ) : null}

                {overviewStatus === 'error' ? (
                  <div className="chart-state top-team-modal-state top-team-overview-error">
                    <ErrorState text="Không tải được cây tổ chức" />
                    <button className="top-team-tab-link" type="button" onClick={retryOverview}>
                      Thử lại
                    </button>
                  </div>
                ) : null}

                {overviewStatus === 'ready' && orgRevenueTree.length === 0 ? (
                  <EmptyState className="chart-state top-team-modal-state" text="Chưa có dữ liệu tổ chức" />
                ) : null}

                {overviewStatus === 'ready' && orgRevenueTree.length > 0 ? (
                  <div className="top-team-overview-tree-wrap">
                    <OrgRevenueTree nodes={orgRevenueTree} />
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}

export default memo(TopTeamCard);
