import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fetchOrgJoinInfo } from '../api/commissionApi.js';
import { dashboardApi } from '../api/dashboardApi.js';
import { clearLoansCache, fetchAllLoans } from '../api/loansApi.js';
import { fetchManageTeamsWithUsers } from '../api/orgUnitsApi.js';
import { clearUsersCache, fetchAllUsers } from '../api/usersApi.js';
import {
  DASHBOARD_REFRESH_COOLDOWN_MS,
  DASHBOARD_REQUEST_CACHE_TTL_MS,
  DEFAULT_PAGE_SIZE,
} from '../config/constants.js';
import { buildDashboardViewModel } from '../services/dashboard/dashboardMetrics.service.js';
import { getSafeErrorMessage } from '../utils/error.js';
import { formatNumber, formatPercent, formatVndCompact } from '../utils/formatNumber.js';
import { clearRequestCache, createRequestKey, dedupeRequest } from '../utils/requestCache.js';

// Moi nguon du lieu (loans/users/teams/orgJoinInfo) co status rieng ('loading' | 'ready' |
// 'error') thay vi 1 co "status" chung cho ca 4 nguon - de tung the/card tren dashboard co the
// hien du lieu ngay khi nguon no can xong, khong phai cho nguon cham nhat (thuong la loans, vi
// phai phan trang tuan tu qua toan bo don vay) moi duoc hien bat ky thu gi.
const initialNetworkState = {
  mockData: null,
  loans: [],
  loansStatus: 'loading',
  loansErrorMessage: '',
  users: [],
  usersStatus: 'loading',
  usersErrorMessage: '',
  teams: [],
  teamsStatus: 'loading',
  teamsErrorMessage: '',
  orgJoinInfoBySaleId: {},
  orgJoinInfoStatus: 'loading',
};

function withLoanMetricKpis(dashboardData, metrics) {
  return {
    ...dashboardData,
    kpis: dashboardData.kpis.map((item) => {
      if (item.id === 'total-loans') {
        return {
          ...item,
          value: metrics.totalLoans,
          change: metrics.totalLoansChange ?? item.change,
          projection: metrics.totalLoansProjection ?? null,
        };
      }

      if (item.id === 'closed-loans') {
        return {
          ...item,
          value: metrics.closedLoans,
          change: metrics.closedLoansChange ?? item.change,
          description: metrics.closedLoansDescription ?? item.description,
          projection: metrics.closedLoansProjection ?? null,
        };
      }

      if (item.id === 'disbursement') {
        return {
          ...item,
          value: metrics.disbursementAmount,
          change: metrics.disbursementChange ?? item.change,
          description: metrics.disbursementDescription ?? item.description,
          projection: metrics.disbursementProjection ?? null,
        };
      }

      return item;
    }),
  };
}

function withUserMetricKpis(dashboardData, metrics) {
  return {
    ...dashboardData,
    kpis: dashboardData.kpis.map((item) => {
      if (item.id === 'active-sales') {
        return {
          ...item,
          value: metrics.activeUsers,
          change: metrics.activeUsersChange ?? item.change,
          description: metrics.activeUsersDescription ?? item.description,
        };
      }

      return item;
    }),
  };
}

function withCommissionKpi(dashboardData, metrics) {
  return {
    ...dashboardData,
    kpis: dashboardData.kpis.map((item) => {
      if (item.id === 'commission') {
        return {
          ...item,
          value: metrics.totalCommission,
          description: metrics.description ?? item.description,
        };
      }

      return item;
    }),
  };
}

function withProductPerformanceData(dashboardData, performance, status) {
  return {
    ...dashboardData,
    performance,
    performanceStatus: status,
  };
}

function withProductStructureData(dashboardData, metrics, status) {
  return {
    ...dashboardData,
    productStructureMetrics: metrics,
    productStructureStatus: status,
  };
}

function withFunnelData(dashboardData, funnel, status) {
  return {
    ...dashboardData,
    funnel,
    funnelStatus: status,
  };
}

function withTopCtvData(dashboardData, topCtvByRevenue, status) {
  return {
    ...dashboardData,
    topCtvByRevenue,
    topCtvStatus: status,
  };
}

function withTopTeamData(dashboardData, topTeamsByDisbursement, status) {
  return {
    ...dashboardData,
    topTeamsByDisbursement,
    topTeamStatus: status,
  };
}

function formatProjection(value, formatter) {
  return value === null || value === undefined ? null : `Dự kiến cuối tháng: ~${formatter(value)}`;
}

// Tat ca phan phu thuoc DUY NHAT vao "loans" (KPI tong/dong/giai ngan, bieu do san pham, funnel)
// - gom vao 1 ham xu ly ca 3 trang thai de khong lap logic 3 lan. Con topCtv/topTeam/commission
// phu thuoc them users/teams nen duoc tinh rieng o buildDisplayData.
function applyLoanSection(dashboardData, loanStatus, viewModel) {
  const kpis =
    loanStatus === 'ready'
      ? {
          totalLoans: formatNumber(viewModel.loanMetrics.totalLoans),
          totalLoansChange: viewModel.loanMetrics.changes.totalLoans,
          totalLoansProjection: formatProjection(viewModel.loanMetrics.projectedTotalLoans, (value) =>
            formatNumber(Math.round(value))
          ),
          closedLoans: formatNumber(viewModel.loanMetrics.closedLoans),
          closedLoansChange: viewModel.loanMetrics.changes.closedLoans,
          closedLoansDescription: `Tỷ lệ chuyển đổi ${formatPercent(viewModel.loanMetrics.conversionRate)}`,
          closedLoansProjection: formatProjection(viewModel.loanMetrics.projectedClosedLoans, (value) =>
            formatNumber(Math.round(value))
          ),
          disbursementAmount: formatVndCompact(viewModel.loanMetrics.disbursementAmount),
          disbursementChange: viewModel.loanMetrics.changes.disbursementAmount,
          disbursementDescription: `Tiêu dùng ${formatVndCompact(
            viewModel.loanMetrics.consumerDisbursementAmount
          )} • Dư nợ ${formatVndCompact(viewModel.loanMetrics.mortgageDisbursementAmount)}`,
          disbursementProjection: formatProjection(viewModel.loanMetrics.projectedDisbursementAmount, formatVndCompact),
        }
      : loanStatus === 'error'
      ? {
          totalLoans: '--',
          totalLoansChange: '--',
          closedLoans: '--',
          closedLoansChange: '--',
          closedLoansDescription: 'Tỷ lệ chuyển đổi --',
          disbursementAmount: '--',
          disbursementChange: '--',
          disbursementDescription: 'Tiêu dùng -- • Dư nợ --',
        }
      : {
          totalLoans: 'Đang tải...',
          closedLoans: 'Đang tải...',
          closedLoansDescription: 'Đang tính tỷ lệ chuyển đổi...',
          disbursementAmount: 'Đang tải...',
          disbursementDescription: 'Đang tải dữ liệu sản phẩm...',
        };

  const withKpis = withLoanMetricKpis(dashboardData, kpis);
  const isReady = loanStatus === 'ready';

  return withFunnelData(
    withProductStructureData(
      withProductPerformanceData(withKpis, isReady ? viewModel.productPerformanceChartData : [], loanStatus),
      isReady ? viewModel.productStructureMetrics : null,
      loanStatus
    ),
    isReady ? viewModel.funnelByProductMetrics : [],
    loanStatus
  );
}

function applyUserSection(dashboardData, userStatus, viewModel) {
  const kpis =
    userStatus === 'ready'
      ? {
          activeUsers: formatNumber(viewModel.userMetrics.activeUsers),
          activeUsersChange: viewModel.userMetrics.changes.activeUsers,
          activeUsersDescription: 'Hoạt động trong 30 ngày',
        }
      : userStatus === 'error'
      ? {
          activeUsers: '--',
          activeUsersChange: '--',
          activeUsersDescription: 'Hoạt động trong 30 ngày',
        }
      : {
          activeUsers: 'Đang tải...',
          activeUsersChange: '...',
          activeUsersDescription: 'Hoạt động trong 30 ngày',
        };

  return withUserMetricKpis(dashboardData, kpis);
}

// Hoa hong can ca loans, users VA teams deu tai thanh cong moi tinh dung (doanh so team lay
// tu teams) - neu thieu 1 trong 3 thi hien '--' thay vi tinh ra so sai/thieu ma khong bao loi.
function applyCommissionSection(dashboardData, commissionStatus, viewModel) {
  const kpi =
    commissionStatus === 'ready'
      ? {
          totalCommission: formatVndCompact(viewModel.commissionMetrics.totalCommission),
          description: 'Ước tính theo rule hoa hồng hiện hành',
        }
      : commissionStatus === 'error'
      ? {
          totalCommission: '--',
          description: 'Chờ đủ dữ liệu đơn vay/team để tính',
        }
      : {
          totalCommission: 'Đang tải...',
          description: 'Đang tính hoa hồng...',
        };

  return withCommissionKpi(dashboardData, kpi);
}

// Gop 2 status rieng le thanh 1 status hien thi: uu tien "error" (chi can 1 nguon loi la khong
// the tinh dung), roi moi den "ready" (ca 2 nguon xong), con lai la "loading".
function combineStatus(...statuses) {
  if (statuses.includes('error')) return 'error';
  if (statuses.every((status) => status === 'ready')) return 'ready';

  return 'loading';
}

// Pure, synchronous: derives the display-ready dashboard data from whatever raw
// loans/users/teams have arrived so far (moi nguon co status rieng), plus the currently
// selected range. Never triggers network calls, so switching month/year only recomputes
// this instead of refetching - va tung the/card duoc hien ngay khi nguon no san sang, khong
// phai cho nguon cham nhat.
function buildDisplayData(networkState, range) {
  if (!networkState.mockData) return null;

  const viewModel = buildDashboardViewModel({
    loans: networkState.loans,
    users: networkState.users,
    teams: networkState.teams,
    orgJoinInfoBySaleId: networkState.orgJoinInfoBySaleId,
    range,
  });

  const { loansStatus, usersStatus, teamsStatus } = networkState;
  const topCtvStatus = combineStatus(loansStatus, usersStatus);
  const topTeamStatus = combineStatus(loansStatus, teamsStatus);
  const commissionStatus = combineStatus(loansStatus, usersStatus, teamsStatus);

  let nextData = applyLoanSection(networkState.mockData, loansStatus, viewModel);

  nextData = applyUserSection(nextData, usersStatus, viewModel);
  nextData = withTopCtvData(nextData, topCtvStatus === 'ready' ? viewModel.topCtvByRevenue : [], topCtvStatus);
  nextData = withTopTeamData(
    nextData,
    topTeamStatus === 'ready' ? viewModel.topTeamsByDisbursement : [],
    topTeamStatus
  );
  nextData = applyCommissionSection(nextData, commissionStatus, viewModel);

  return {
    ...nextData,
    teams: networkState.teams,
    loans: networkState.loans,
    users: networkState.users,
    orgJoinInfoBySaleId: networkState.orgJoinInfoBySaleId,
    usersStatus,
    commissionBreakdown: commissionStatus === 'ready' ? viewModel.commissionMetrics.breakdown : [],
    commissionStatus,
    range,
  };
}

export function useDashboardData(range) {
  const [networkState, setNetworkState] = useState(initialNetworkState);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const latestRequestId = useRef(0);
  const lastRefreshRef = useRef(0);
  const hasDataRef = useRef(false);

  // Intentionally has no dependency on `range` — this only fetches raw data from
  // the server (mount + manual refresh). Switching the month/year filter must not
  // re-trigger any network call; see buildDisplayData for the range-aware part.
  const loadDashboardData = useCallback(async ({ force = false } = {}) => {
    const requestId = latestRequestId.current + 1;
    const isRefresh = Boolean(force);

    latestRequestId.current = requestId;
    setLoading((current) => (hasDataRef.current ? current : true));
    setRefreshing(isRefresh);

    if (force) {
      clearLoansCache();
      clearUsersCache();
      clearRequestCache('dashboard:');
    }

    try {
      const mockData = await dashboardApi.getDashboardOverview();

      if (latestRequestId.current !== requestId) return;

      setNetworkState((current) => ({
        ...current,
        mockData,
        loans: [],
        loansStatus: 'loading',
        loansErrorMessage: '',
        users: [],
        usersStatus: 'loading',
        usersErrorMessage: '',
        teams: [],
        teamsStatus: 'loading',
        teamsErrorMessage: '',
        orgJoinInfoBySaleId: {},
        orgJoinInfoStatus: 'loading',
      }));
      hasDataRef.current = true;

      const loansKey = createRequestKey('dashboard:loans', { size: DEFAULT_PAGE_SIZE });
      const usersKey = createRequestKey('dashboard:users', { size: DEFAULT_PAGE_SIZE });
      const teamsKey = createRequestKey('dashboard:teams', { useCache: !force });
      const requestOptions = {
        ttl: DASHBOARD_REQUEST_CACHE_TTL_MS,
        force,
      };

      // Moi request tu cap nhat state ngay khi XONG (thanh cong hoac loi), khong doi cac
      // request con lai - nho vay the/card nao phu thuoc nguon da xong se hien ngay, thay vi
      // ca dashboard dung im cho den khi nguon cham nhat (thuong la loans) hoan tat.
      const loansPromise = dedupeRequest(loansKey, () => fetchAllLoans({ size: DEFAULT_PAGE_SIZE }), requestOptions)
        .then((loans) => {
          if (latestRequestId.current !== requestId) return;

          setNetworkState((current) => ({ ...current, loans, loansStatus: 'ready', loansErrorMessage: '' }));
        })
        .catch((error) => {
          if (latestRequestId.current !== requestId) return;

          setNetworkState((current) => ({
            ...current,
            loansStatus: 'error',
            loansErrorMessage: getSafeErrorMessage(error, 'Không tải được dữ liệu khoản vay'),
          }));
        });

      const usersPromise = dedupeRequest(usersKey, () => fetchAllUsers({ size: DEFAULT_PAGE_SIZE }), requestOptions)
        .then((users) => {
          if (latestRequestId.current !== requestId) return;

          setNetworkState((current) => ({ ...current, users, usersStatus: 'ready', usersErrorMessage: '' }));
        })
        .catch((error) => {
          if (latestRequestId.current !== requestId) return;

          setNetworkState((current) => ({
            ...current,
            usersStatus: 'error',
            usersErrorMessage: getSafeErrorMessage(error, 'Không tải được dữ liệu người dùng'),
          }));
        });

      const teamsPromise = dedupeRequest(
        teamsKey,
        () => fetchManageTeamsWithUsers({ useCache: !force }),
        requestOptions
      )
        .then((teams) => {
          if (latestRequestId.current !== requestId) return;

          setNetworkState((current) => ({ ...current, teams, teamsStatus: 'ready', teamsErrorMessage: '' }));
        })
        .catch((error) => {
          if (latestRequestId.current !== requestId) return;

          setNetworkState((current) => ({
            ...current,
            teamsStatus: 'error',
            teamsErrorMessage: getSafeErrorMessage(error, 'Không tải được dữ liệu team'),
          }));
        });

      // Rule (1) hoa hong (ngay join to chuc) - lay tu local sync, khong phai API that, nen
      // loi o day KHONG chan tinh hoa hong, chi bo qua buoc loc theo ngay join (xem
      // commissionMetrics.service.js).
      const orgJoinInfoPromise = fetchOrgJoinInfo()
        .then((orgJoinInfoBySaleId) => {
          if (latestRequestId.current !== requestId) return;

          setNetworkState((current) => ({ ...current, orgJoinInfoBySaleId, orgJoinInfoStatus: 'ready' }));
        })
        .catch(() => {
          if (latestRequestId.current !== requestId) return;

          setNetworkState((current) => ({ ...current, orgJoinInfoBySaleId: {}, orgJoinInfoStatus: 'error' }));
        });

      await Promise.allSettled([loansPromise, usersPromise, teamsPromise, orgJoinInfoPromise]);

      if (latestRequestId.current !== requestId) return;

      setLastUpdatedAt(new Date());
    } finally {
      if (latestRequestId.current === requestId) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    const now = Date.now();

    if (loading || refreshing) return;

    if (now - lastRefreshRef.current < DASHBOARD_REFRESH_COOLDOWN_MS) {
      return;
    }

    lastRefreshRef.current = now;
    await loadDashboardData({ force: true });
  }, [loadDashboardData, loading, refreshing]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const data = useMemo(() => buildDisplayData(networkState, range), [networkState, range]);
  const error = useMemo(
    () => ({
      loans: networkState.loansErrorMessage,
      users: networkState.usersErrorMessage,
      teams: networkState.teamsErrorMessage,
    }),
    [networkState.loansErrorMessage, networkState.usersErrorMessage, networkState.teamsErrorMessage]
  );

  return {
    data,
    loading,
    refreshing,
    error,
    refresh,
    lastUpdatedAt,
  };
}
