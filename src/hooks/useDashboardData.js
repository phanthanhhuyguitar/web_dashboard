import { useCallback, useEffect, useRef, useState } from 'react';

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

function withLoanMetricKpis(dashboardData, metrics) {
  return {
    ...dashboardData,
    kpis: dashboardData.kpis.map((item) => {
      if (item.id === 'total-loans') {
        return {
          ...item,
          value: metrics.totalLoans,
          change: metrics.totalLoansChange ?? item.change,
        };
      }

      if (item.id === 'closed-loans') {
        return {
          ...item,
          value: metrics.closedLoans,
          change: metrics.closedLoansChange ?? item.change,
          description: metrics.closedLoansDescription ?? item.description,
        };
      }

      if (item.id === 'disbursement') {
        return {
          ...item,
          value: metrics.disbursementAmount,
          change: metrics.disbursementChange ?? item.change,
          description: metrics.disbursementDescription ?? item.description,
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

function withProductPerformanceData(dashboardData, performance, status = 'ready') {
  return {
    ...dashboardData,
    performance,
    performanceStatus: status,
  };
}

function withProductStructureData(dashboardData, metrics, status = 'ready') {
  return {
    ...dashboardData,
    productStructureMetrics: metrics,
    productStructureStatus: status,
  };
}

function withFunnelData(dashboardData, funnel, status = 'ready') {
  return {
    ...dashboardData,
    funnel,
    funnelStatus: status,
  };
}

function withTopCtvData(dashboardData, topCtvByRevenue, status = 'ready') {
  return {
    ...dashboardData,
    topCtvByRevenue,
    topCtvStatus: status,
  };
}

function withTopTeamData(dashboardData, topTeamsByDisbursement, status = 'ready') {
  return {
    ...dashboardData,
    topTeamsByDisbursement,
    topTeamStatus: status,
  };
}

function buildLoadingDashboardData(mockData) {
  const withLoadingLoans = withLoanMetricKpis(mockData, {
    totalLoans: 'Đang tải...',
    closedLoans: 'Đang tải...',
    closedLoansDescription: 'Đang tính tỷ lệ chuyển đổi...',
    disbursementAmount: 'Đang tải...',
    disbursementDescription: 'Đang tải dữ liệu sản phẩm...',
  });
  const withLoadingUsers = withUserMetricKpis(withLoadingLoans, {
    activeUsers: 'Đang tải...',
    activeUsersChange: '...',
    activeUsersDescription: 'Hoạt động trong 30 ngày',
  });

  return withTopTeamData(
    withTopCtvData(
      withFunnelData(
        withProductStructureData(
          withProductPerformanceData(withLoadingUsers, [], 'loading'),
          null,
          'loading'
        ),
        [],
        'loading'
      ),
      [],
      'loading'
    ),
    [],
    'loading'
  );
}

function applyLoanViewModel(dashboardData, viewModel, { topTeamStatus = 'ready' } = {}) {
  const withLoanKpis = withLoanMetricKpis(dashboardData, {
    totalLoans: formatNumber(viewModel.loanMetrics.totalLoans),
    totalLoansChange: viewModel.loanMetrics.changes.totalLoans,
    closedLoans: formatNumber(viewModel.loanMetrics.closedLoans),
    closedLoansChange: viewModel.loanMetrics.changes.closedLoans,
    closedLoansDescription: `Tỷ lệ chuyển đổi ${formatPercent(viewModel.loanMetrics.conversionRate)}`,
    disbursementAmount: formatVndCompact(viewModel.loanMetrics.disbursementAmount),
    disbursementChange: viewModel.loanMetrics.changes.disbursementAmount,
    disbursementDescription: `Tiêu dùng ${formatVndCompact(
      viewModel.loanMetrics.consumerDisbursementAmount
    )} • Dư nợ ${formatVndCompact(viewModel.loanMetrics.mortgageDisbursementAmount)}`,
  });

  return withTopTeamData(
    withTopCtvData(
      withFunnelData(
        withProductStructureData(
          withProductPerformanceData(withLoanKpis, viewModel.productPerformanceChartData, 'ready'),
          viewModel.productStructureMetrics,
          'ready'
        ),
        viewModel.funnelByProductMetrics,
        'ready'
      ),
      viewModel.topCtvByRevenue,
      'ready'
    ),
    viewModel.topTeamsByDisbursement,
    topTeamStatus
  );
}

function applyLoanError(dashboardData) {
  const withLoanKpis = withLoanMetricKpis(dashboardData, {
    totalLoans: '--',
    totalLoansChange: '--',
    closedLoans: '--',
    closedLoansChange: '--',
    closedLoansDescription: 'Tỷ lệ chuyển đổi --',
    disbursementAmount: '--',
    disbursementChange: '--',
    disbursementDescription: 'Tiêu dùng -- • Dư nợ --',
  });

  return withTopTeamData(
    withTopCtvData(
      withFunnelData(
        withProductStructureData(
          withProductPerformanceData(withLoanKpis, [], 'error'),
          null,
          'error'
        ),
        [],
        'error'
      ),
      [],
      'error'
    ),
    [],
    'error'
  );
}

function applyUserMetrics(dashboardData, viewModel) {
  return withUserMetricKpis(dashboardData, {
    activeUsers: formatNumber(viewModel.userMetrics.activeUsers),
    activeUsersChange: viewModel.userMetrics.changes.activeUsers,
    activeUsersDescription: 'Hoạt động trong 30 ngày',
  });
}

function applyUserError(dashboardData) {
  return withUserMetricKpis(dashboardData, {
    activeUsers: '--',
    activeUsersChange: '--',
    activeUsersDescription: 'Hoạt động trong 30 ngày',
  });
}

export function useDashboardData(range) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState({ loans: '', users: '', teams: '' });
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const latestRequestId = useRef(0);
  const lastRefreshRef = useRef(0);
  const hasDataRef = useRef(false);

  const loadDashboardData = useCallback(
    async ({ force = false } = {}) => {
      const requestId = latestRequestId.current + 1;
      const isRefresh = Boolean(force);

      latestRequestId.current = requestId;
      setLoading((current) => (hasDataRef.current ? current : true));
      setRefreshing(isRefresh);
      setError({ loans: '', users: '', teams: '' });

      if (force) {
        clearLoansCache();
        clearUsersCache();
        clearRequestCache('dashboard:');
      }

      try {
        const mockData = await dashboardApi.getDashboardOverview();

        if (latestRequestId.current !== requestId) return;

        setData(buildLoadingDashboardData(mockData));
        hasDataRef.current = true;

        const loansKey = createRequestKey('dashboard:loans', { size: DEFAULT_PAGE_SIZE });
        const usersKey = createRequestKey('dashboard:users', { size: DEFAULT_PAGE_SIZE });
        const teamsKey = createRequestKey('dashboard:teams', { useCache: !force });
        const requestOptions = {
          ttl: DASHBOARD_REQUEST_CACHE_TTL_MS,
          force,
        };

        const loansRequest = dedupeRequest(
          loansKey,
          () => fetchAllLoans({ size: DEFAULT_PAGE_SIZE }),
          requestOptions
        );
        const usersRequest = dedupeRequest(
          usersKey,
          () => fetchAllUsers({ size: DEFAULT_PAGE_SIZE }),
          requestOptions
        );
        const teamsRequest = dedupeRequest(
          teamsKey,
          () => fetchManageTeamsWithUsers({ useCache: !force }),
          requestOptions
        );
        const [loansResult, usersResult, teamsResult] = await Promise.allSettled([
          loansRequest,
          usersRequest,
          teamsRequest,
        ]);

        if (latestRequestId.current !== requestId) return;

        const loans = loansResult.status === 'fulfilled' ? loansResult.value : [];
        const users = usersResult.status === 'fulfilled' ? usersResult.value : [];
        const teams = teamsResult.status === 'fulfilled' ? teamsResult.value : [];
        const viewModel = buildDashboardViewModel({ loans, users, teams, range });

        setData((currentData) => {
          if (!currentData) return currentData;

          let nextData = currentData;

          if (loansResult.status === 'fulfilled') {
            nextData = applyLoanViewModel(nextData, viewModel, {
              topTeamStatus: teamsResult.status === 'fulfilled' ? 'ready' : 'error',
            });
          } else {
            nextData = applyLoanError(nextData);
          }

          if (usersResult.status === 'fulfilled') {
            nextData = applyUserMetrics(nextData, viewModel);
          } else {
            nextData = applyUserError(nextData);
          }

          return nextData;
        });

        setError({
          loans:
            loansResult.status === 'rejected'
              ? getSafeErrorMessage(loansResult.reason, 'Không tải được dữ liệu khoản vay')
              : '',
          users:
            usersResult.status === 'rejected'
              ? getSafeErrorMessage(usersResult.reason, 'Không tải được dữ liệu người dùng')
              : '',
          teams:
            teamsResult.status === 'rejected'
              ? getSafeErrorMessage(teamsResult.reason, 'Không tải được dữ liệu team')
              : '',
        });
        setLastUpdatedAt(new Date());
      } finally {
        if (latestRequestId.current === requestId) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [range]
  );

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

  return {
    data,
    loading,
    refreshing,
    error,
    refresh,
    lastUpdatedAt,
  };
}
