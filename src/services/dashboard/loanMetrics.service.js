import { PRODUCT_IDS, PRODUCT_LABELS } from '../../config/productMap.js';
import { FUNNEL_STATUS_CONFIG, LOAN_STATUSES } from '../../config/statusMap.js';
import { isDateInRange } from '../../utils/date.js';

function toSafeAmount(value) {
  const amount = Number(value || 0);

  return Number.isFinite(amount) ? amount : 0;
}

export function isValidOwnerSaleId(ownerSaleId) {
  return ownerSaleId !== null && ownerSaleId !== undefined && String(ownerSaleId).trim() !== '';
}

export function getValidLoansByDateRange(loans, { fromDate, toDate }) {
  return loans.filter((loan) => {
    return isValidOwnerSaleId(loan.ownerSaleId) && isDateInRange(loan.createdAt, { fromDate, toDate });
  });
}

export function calculateLoanDashboardMetrics(loans, { fromDate, toDate }) {
  const validLoans = getValidLoansByDateRange(loans, { fromDate, toDate });
  const closedLoans = validLoans.filter((loan) => loan.status === LOAN_STATUSES.CLOSED);
  const disbursementAmount = closedLoans.reduce((sum, loan) => {
    return sum + toSafeAmount(loan.approvedAmount);
  }, 0);
  const consumerDisbursementAmount = closedLoans
    .filter((loan) => String(loan.productId) === PRODUCT_IDS.CONSUMER_LOAN)
    .reduce((sum, loan) => {
      return sum + toSafeAmount(loan.approvedAmount);
    }, 0);
  const mortgageDisbursementAmount = closedLoans
    .filter((loan) => String(loan.productId) === PRODUCT_IDS.MORTGAGE_OUTSTANDING)
    .reduce((sum, loan) => {
      return sum + toSafeAmount(loan.approvedAmount);
    }, 0);
  const conversionRate = validLoans.length > 0 ? (closedLoans.length / validLoans.length) * 100 : 0;

  return {
    totalLoans: validLoans.length,
    closedLoans: closedLoans.length,
    disbursementAmount,
    consumerDisbursementAmount,
    mortgageDisbursementAmount,
    conversionRate,
  };
}

export function buildProductPerformanceChartData(loans, { fromDate, toDate }) {
  const groupedByDay = new Map();

  loans.forEach((loan) => {
    if (!isValidOwnerSaleId(loan.ownerSaleId)) return;
    if (!isDateInRange(loan.createdAt, { fromDate, toDate })) return;

    const date = new Date(loan.createdAt);

    if (Number.isNaN(date.getTime())) return;

    const day = String(date.getDate()).padStart(2, '0');

    if (!groupedByDay.has(day)) {
      groupedByDay.set(day, {
        day,
        consumerLoan: 0,
        mortgageLoan: 0,
        closed: 0,
      });
    }

    const item = groupedByDay.get(day);

    if (String(loan.productId) === PRODUCT_IDS.CONSUMER_LOAN) {
      item.consumerLoan += 1;
    }

    if (String(loan.productId) === PRODUCT_IDS.MORTGAGE_OUTSTANDING) {
      item.mortgageLoan += 1;
    }

    if (loan.status === LOAN_STATUSES.CLOSED) {
      item.closed += 1;
    }
  });

  return Array.from(groupedByDay.values())
    .filter((item) => item.consumerLoan > 0 || item.mortgageLoan > 0 || item.closed > 0)
    .sort((a, b) => Number(a.day) - Number(b.day));
}

export function calculateProductStructureMetrics(loans, { fromDate, toDate }) {
  const validLoans = getValidLoansByDateRange(loans, { fromDate, toDate });
  const consumerLoans = validLoans.filter((loan) => String(loan.productId) === PRODUCT_IDS.CONSUMER_LOAN);
  const mortgageLoans = validLoans.filter((loan) => String(loan.productId) === PRODUCT_IDS.MORTGAGE_OUTSTANDING);
  const consumerClosedLoans = consumerLoans.filter((loan) => loan.status === LOAN_STATUSES.CLOSED);
  const mortgageClosedLoans = mortgageLoans.filter((loan) => loan.status === LOAN_STATUSES.CLOSED);
  const consumerRevenue = consumerClosedLoans.reduce((sum, loan) => {
    return sum + toSafeAmount(loan.approvedAmount);
  }, 0);
  const mortgageRevenue = mortgageClosedLoans.reduce((sum, loan) => {
    return sum + toSafeAmount(loan.approvedAmount);
  }, 0);
  const totalProductLoans = consumerLoans.length + mortgageLoans.length;
  const totalRevenue = consumerRevenue + mortgageRevenue;
  const consumerPercent = totalProductLoans > 0 ? (consumerLoans.length / totalProductLoans) * 100 : 0;
  const mortgagePercent = totalProductLoans > 0 ? (mortgageLoans.length / totalProductLoans) * 100 : 0;

  return {
    consumerTotal: consumerLoans.length,
    mortgageTotal: mortgageLoans.length,
    totalProductLoans,
    consumerClosed: consumerClosedLoans.length,
    mortgageClosed: mortgageClosedLoans.length,
    consumerRevenue,
    mortgageRevenue,
    totalRevenue,
    consumerPercent,
    mortgagePercent,
  };
}

export function buildProductFunnelData(loans, { fromDate, toDate }) {
  const rows = FUNNEL_STATUS_CONFIG.map((item) => ({
    key: item.key,
    status: item.status,
    label: item.label,
    consumerCount: 0,
    mortgageCount: 0,
    total: 0,
  }));
  const statusMap = new Map(rows.map((row) => [row.status, row]));

  loans.forEach((loan) => {
    if (!isValidOwnerSaleId(loan.ownerSaleId)) return;
    if (!isDateInRange(loan.createdAt, { fromDate, toDate })) return;

    const row = statusMap.get(loan.status);

    if (!row) return;

    const productId = String(loan.productId);

    if (productId === PRODUCT_IDS.CONSUMER_LOAN) {
      row.consumerCount += 1;
      row.total += 1;
    }

    if (productId === PRODUCT_IDS.MORTGAGE_OUTSTANDING) {
      row.mortgageCount += 1;
      row.total += 1;
    }
  });

  return rows;
}

export function calculateFunnelByProductMetrics(loans, range) {
  return buildProductFunnelData(loans, range);
}

const TOP_CTV_PRODUCT_LABELS = {
  consumer: 'Vay tiêu dùng',
  mortgage: 'Dư nợ BĐS',
};

function getTopCtvDisplayName(user, saleId) {
  return user?.name || user?.fullName || user?.phoneNumber || saleId;
}

function getTopCtvProductLabel(item) {
  const hasConsumer = item.consumerDisbursementAmount > 0;
  const hasMortgage = item.mortgageDisbursementAmount > 0;

  if (hasConsumer && hasMortgage) {
    return `${TOP_CTV_PRODUCT_LABELS.consumer}/${TOP_CTV_PRODUCT_LABELS.mortgage}`;
  }

  if (hasConsumer) return TOP_CTV_PRODUCT_LABELS.consumer;
  if (hasMortgage) return TOP_CTV_PRODUCT_LABELS.mortgage;

  return 'Khác';
}

export function calculateTopCtvByDisbursement(loans, users = [], { fromDate, toDate, limit = 5 }) {
  const saleIdToUser = new Map();
  const groupedBySaleId = new Map();

  users.forEach((user) => {
    const saleId = String(user?.saleId || '').trim();

    if (!saleId) return;

    saleIdToUser.set(saleId, user);
  });

  loans.forEach((loan) => {
    if (!isValidOwnerSaleId(loan.ownerSaleId)) return;
    if (!isDateInRange(loan.createdAt, { fromDate, toDate })) return;
    if (loan.status !== LOAN_STATUSES.CLOSED) return;

    const productId = String(loan.productId || '').trim();

    if (productId !== PRODUCT_IDS.CONSUMER_LOAN && productId !== PRODUCT_IDS.MORTGAGE_OUTSTANDING) return;

    const amount = toSafeAmount(loan.approvedAmount);

    if (amount <= 0) return;

    const saleId = String(loan.ownerSaleId).trim();

    if (!groupedBySaleId.has(saleId)) {
      const user = saleIdToUser.get(saleId);
      const displayName = getTopCtvDisplayName(user, saleId);

      groupedBySaleId.set(saleId, {
        ownerSaleId: saleId,
        displayName,
        displayLabel: user ? `${displayName} / ${saleId}` : saleId,
        closedLoanCount: 0,
        disbursementAmount: 0,
        consumerDisbursementAmount: 0,
        mortgageDisbursementAmount: 0,
        consumerClosedLoanCount: 0,
        mortgageClosedLoanCount: 0,
        productLabel: 'Khác',
      });
    }

    const item = groupedBySaleId.get(saleId);

    item.disbursementAmount += amount;
    item.closedLoanCount += 1;

    if (productId === PRODUCT_IDS.CONSUMER_LOAN) {
      item.consumerDisbursementAmount += amount;
      item.consumerClosedLoanCount += 1;
    }

    if (productId === PRODUCT_IDS.MORTGAGE_OUTSTANDING) {
      item.mortgageDisbursementAmount += amount;
      item.mortgageClosedLoanCount += 1;
    }
  });

  return Array.from(groupedBySaleId.values())
    .map((item) => {
      return {
        ...item,
        productLabel: getTopCtvProductLabel(item),
      };
    })
    .sort((a, b) => {
      if (b.disbursementAmount !== a.disbursementAmount) {
        return b.disbursementAmount - a.disbursementAmount;
      }

      if (b.closedLoanCount !== a.closedLoanCount) {
        return b.closedLoanCount - a.closedLoanCount;
      }

      return a.ownerSaleId.localeCompare(b.ownerSaleId);
    })
    .slice(0, limit)
    .map((item, index) => ({
      rank: index + 1,
      ...item,
    }));
}

export function calculateTopCtvByRevenue(loans, users, range) {
  return calculateTopCtvByDisbursement(loans, users, {
    ...range,
    limit: 5,
  });
}
