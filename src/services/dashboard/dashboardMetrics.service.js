import {
  buildProductPerformanceChartData,
  calculateFunnelByProductMetrics,
  calculateLoanDashboardMetrics,
  calculateProductStructureMetrics,
  calculateTopCtvByRevenue,
} from './loanMetrics.service.js';
import { calculateUserDashboardMetrics } from './userMetrics.service.js';
import { getPreviousMonthRange } from '../../utils/date.js';
import { formatChangePercent, formatSignedNumber } from '../../utils/formatNumber.js';
import { calculateTopTeamsByDisbursement } from '../../utils/teamMetrics.js';

function getTrend(value, display) {
  if (display === 'Mới') return 'new';
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return 'neutral';
}

function calculatePercentChange(currentValue, previousValue) {
  if (previousValue > 0) {
    const value = ((currentValue - previousValue) / previousValue) * 100;
    const display = formatChangePercent(value);

    return {
      type: 'percent',
      value,
      display,
      trend: getTrend(value, display),
    };
  }

  if (currentValue > 0) {
    return {
      type: 'percent',
      value: null,
      display: 'Mới',
      trend: 'new',
    };
  }

  return {
    type: 'percent',
    value: 0,
    display: '0.0%',
    trend: 'neutral',
  };
}

function calculateNumberChange(currentValue, previousValue) {
  const value = currentValue - previousValue;
  const display = formatSignedNumber(value);

  return {
    type: 'number',
    value,
    display,
    trend: getTrend(value, display),
  };
}

export function calculateKpiChangeMetrics({ loans, users, currentRange }) {
  const previousRange = getPreviousMonthRange(currentRange);
  const currentLoanMetrics = calculateLoanDashboardMetrics(loans, currentRange);
  const previousLoanMetrics = calculateLoanDashboardMetrics(loans, previousRange);
  const currentUserMetrics = calculateUserDashboardMetrics(users, currentRange);
  const previousUserMetrics = calculateUserDashboardMetrics(users, previousRange);

  return {
    loanChanges: {
      totalLoans: calculatePercentChange(currentLoanMetrics.totalLoans, previousLoanMetrics.totalLoans),
      closedLoans: calculatePercentChange(currentLoanMetrics.closedLoans, previousLoanMetrics.closedLoans),
      disbursementAmount: calculatePercentChange(
        currentLoanMetrics.disbursementAmount,
        previousLoanMetrics.disbursementAmount
      ),
    },
    userChanges: {
      activeUsers: calculateNumberChange(currentUserMetrics.activeUsers, previousUserMetrics.activeUsers),
    },
  };
}

export function buildDashboardViewModel({ loans, users, teams = [], range }) {
  const loanMetrics = calculateLoanDashboardMetrics(loans, range);
  const userMetrics = calculateUserDashboardMetrics(users, range);
  const kpiChanges = calculateKpiChangeMetrics({
    loans,
    users,
    currentRange: range,
  });

  return {
    loanMetrics: {
      ...loanMetrics,
      changes: kpiChanges.loanChanges,
    },
    productPerformanceChartData: buildProductPerformanceChartData(loans, range),
    productStructureMetrics: calculateProductStructureMetrics(loans, range),
    funnelByProductMetrics: calculateFunnelByProductMetrics(loans, range),
    topCtvByRevenue: calculateTopCtvByRevenue(loans, users, range),
    topTeamsByDisbursement: calculateTopTeamsByDisbursement(teams, loans, {
      ...range,
      limit: 5,
    }),
    userMetrics: {
      ...userMetrics,
      changes: kpiChanges.userChanges,
    },
  };
}
