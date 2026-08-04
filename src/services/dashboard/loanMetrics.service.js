import { PRODUCT_IDS, PRODUCT_LABELS } from '../../config/productMap.js';
import { FUNNEL_STATUS_CONFIG, LOAN_STATUSES } from '../../config/statusMap.js';
import { getMonthProgress, isDateInRange, parseDateValue } from '../../utils/date.js';

function toSafeAmount(value) {
  const amount = Number(value || 0);

  return Number.isFinite(amount) ? amount : 0;
}

// Doanh số/giải ngân được ghi nhận theo tháng đơn CHUYỂN SANG CLOSED (updatedAt),
// không phải theo tháng tạo đơn (createdAt). Chỉ áp dụng cho các chỉ số doanh số/CLOSED;
// số lượng đơn tạo mới (Tổng đơn vay, Tổng đơn/Tỷ trọng đơn...) vẫn dùng createdAt.
function getLoanClosedDate(loan) {
  return loan?.updatedAt;
}

export function isValidOwnerSaleId(ownerSaleId) {
  return ownerSaleId !== null && ownerSaleId !== undefined && String(ownerSaleId).trim() !== '';
}

// Du bao tuyen tinh theo toc do trung binh/ngay: chi co nghia khi thang dang xem la thang
// dang chay do (chua het), va can it nhat 1 ngay du lieu de tinh toc do.
function projectMonthEndValue(currentValue, { isOngoing, daysElapsed, daysInMonth }) {
  if (!isOngoing || daysElapsed <= 0) return null;

  return (currentValue / daysElapsed) * daysInMonth;
}

// Dung chung cho ca so lieu KPI (calculateLoanDashboardMetrics) lan man hinh drill-down xem
// danh sach don cu the - dam bao 2 noi luon khop nhau, khong bao gio lech so.
export function getLoansCreatedInRange(loans, range) {
  return loans.filter((loan) => isDateInRange(loan.createdAt, range));
}

export function getClosedLoansInRange(loans, range) {
  return loans.filter((loan) => loan.status === LOAN_STATUSES.CLOSED && isDateInRange(getLoanClosedDate(loan), range));
}

export function calculateLoanDashboardMetrics(loans, { fromDate, toDate }) {
  const periodLoans = getLoansCreatedInRange(loans, { fromDate, toDate });
  const closedLoans = getClosedLoansInRange(loans, { fromDate, toDate });
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
  const conversionRate = periodLoans.length > 0 ? (closedLoans.length / periodLoans.length) * 100 : 0;
  const monthProgress = getMonthProgress({ fromDate, toDate });

  return {
    totalLoans: periodLoans.length,
    closedLoans: closedLoans.length,
    disbursementAmount,
    consumerDisbursementAmount,
    mortgageDisbursementAmount,
    conversionRate,
    projectedTotalLoans: projectMonthEndValue(periodLoans.length, monthProgress),
    projectedClosedLoans: projectMonthEndValue(closedLoans.length, monthProgress),
    projectedDisbursementAmount: projectMonthEndValue(disbursementAmount, monthProgress),
  };
}

export function buildProductPerformanceChartData(loans, { fromDate, toDate }) {
  const groupedByDay = new Map();

  function getDayEntry(day) {
    if (!groupedByDay.has(day)) {
      groupedByDay.set(day, {
        day,
        consumerLoan: 0,
        mortgageLoan: 0,
        closed: 0,
      });
    }

    return groupedByDay.get(day);
  }

  loans.forEach((loan) => {
    if (!isValidOwnerSaleId(loan.ownerSaleId)) return;
    if (!isDateInRange(loan.createdAt, { fromDate, toDate })) return;

    const date = parseDateValue(loan.createdAt);

    if (!date) return;

    const day = String(date.getDate()).padStart(2, '0');
    const item = getDayEntry(day);

    if (String(loan.productId) === PRODUCT_IDS.CONSUMER_LOAN) {
      item.consumerLoan += 1;
    }

    if (String(loan.productId) === PRODUCT_IDS.MORTGAGE_OUTSTANDING) {
      item.mortgageLoan += 1;
    }
  });

  loans.forEach((loan) => {
    if (!isValidOwnerSaleId(loan.ownerSaleId)) return;
    if (loan.status !== LOAN_STATUSES.CLOSED) return;
    if (!isDateInRange(getLoanClosedDate(loan), { fromDate, toDate })) return;

    const date = parseDateValue(getLoanClosedDate(loan));

    if (!date) return;

    const day = String(date.getDate()).padStart(2, '0');

    getDayEntry(day).closed += 1;
  });

  return Array.from(groupedByDay.values())
    .filter((item) => item.consumerLoan > 0 || item.mortgageLoan > 0 || item.closed > 0)
    .sort((a, b) => Number(a.day) - Number(b.day));
}

export function buildLoanCountByMonth(loans, { monthsLimit = 12, filterFn, dateSelector = (loan) => loan.createdAt } = {}) {
  const countByMonth = new Map();

  loans.forEach((loan) => {
    if (filterFn && !filterFn(loan)) return;

    const date = parseDateValue(dateSelector(loan));

    if (!date) return;

    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    countByMonth.set(monthKey, (countByMonth.get(monthKey) || 0) + 1);
  });

  const sortedMonthKeys = Array.from(countByMonth.keys()).sort();
  const limitedMonthKeys = sortedMonthKeys.slice(-monthsLimit);

  return limitedMonthKeys.map((monthKey) => {
    const [year, month] = monthKey.split('-');

    return {
      month: monthKey,
      label: `T${Number(month)}/${year}`,
      totalLoans: countByMonth.get(monthKey),
    };
  });
}

export function buildClosedLoanCountByMonth(loans, { monthsLimit = 12 } = {}) {
  return buildLoanCountByMonth(loans, {
    monthsLimit,
    filterFn: (loan) => loan.status === LOAN_STATUSES.CLOSED,
    dateSelector: getLoanClosedDate,
  });
}

export function buildDisbursementAmountByMonth(loans, { monthsLimit = 12 } = {}) {
  const amountByMonth = new Map();

  loans.forEach((loan) => {
    if (loan.status !== LOAN_STATUSES.CLOSED) return;

    const date = parseDateValue(getLoanClosedDate(loan));

    if (!date) return;

    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    amountByMonth.set(monthKey, (amountByMonth.get(monthKey) || 0) + toSafeAmount(loan.approvedAmount));
  });

  const sortedMonthKeys = Array.from(amountByMonth.keys()).sort();
  const limitedMonthKeys = sortedMonthKeys.slice(-monthsLimit);

  return limitedMonthKeys.map((monthKey) => {
    const [year, month] = monthKey.split('-');

    return {
      month: monthKey,
      label: `T${Number(month)}/${year}`,
      disbursementAmount: amountByMonth.get(monthKey),
    };
  });
}

export function calculateProductStructureMetrics(loans, { fromDate, toDate }) {
  const validLoans = loans.filter((loan) => isDateInRange(loan.createdAt, { fromDate, toDate }));
  const consumerLoans = validLoans.filter((loan) => String(loan.productId) === PRODUCT_IDS.CONSUMER_LOAN);
  const mortgageLoans = validLoans.filter((loan) => String(loan.productId) === PRODUCT_IDS.MORTGAGE_OUTSTANDING);
  const closedLoansInPeriod = loans.filter(
    (loan) => loan.status === LOAN_STATUSES.CLOSED && isDateInRange(getLoanClosedDate(loan), { fromDate, toDate })
  );
  const consumerClosedLoans = closedLoansInPeriod.filter((loan) => String(loan.productId) === PRODUCT_IDS.CONSUMER_LOAN);
  const mortgageClosedLoans = closedLoansInPeriod.filter(
    (loan) => String(loan.productId) === PRODUCT_IDS.MORTGAGE_OUTSTANDING
  );
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

// saleId thật không bao giờ có tiền tố "DR" — 1 số user chỉ có referralCode dạng
// "DR028605" (thiếu field saleId riêng), nên phải bỏ tiền tố này để khớp đúng với
// loan.ownerSaleId (không bao giờ có "DR").
function normalizeSaleId(value) {
  return String(value ?? '').trim().replace(/^DR/i, '');
}

export function calculateTopCtvByDisbursement(loans, users = [], { fromDate, toDate, limit = 5 }) {
  const saleIdToUser = new Map();
  const groupedBySaleId = new Map();

  users.forEach((user) => {
    const saleId = normalizeSaleId(user?.saleId);

    if (!saleId) return;

    saleIdToUser.set(saleId, user);
  });

  loans.forEach((loan) => {
    if (!isValidOwnerSaleId(loan.ownerSaleId)) return;
    if (loan.status !== LOAN_STATUSES.CLOSED) return;
    if (!isDateInRange(getLoanClosedDate(loan), { fromDate, toDate })) return;

    const productId = String(loan.productId || '').trim();

    if (productId !== PRODUCT_IDS.CONSUMER_LOAN && productId !== PRODUCT_IDS.MORTGAGE_OUTSTANDING) return;

    const amount = toSafeAmount(loan.approvedAmount);

    if (amount <= 0) return;

    const saleId = normalizeSaleId(loan.ownerSaleId);

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

// Danh sach TAT CA CTV co don PHAT SINH (tao moi) trong thang, theo ngay tao (khac voi
// calculateTopCtvByDisbursement dung ngay CLOSED cho doanh so) - dung cho man "Chi tiet".
export function calculateCtvOrdersCreatedInRange(loans, users = [], range) {
  const saleIdToUser = new Map();
  const groupedBySaleId = new Map();

  users.forEach((user) => {
    const saleId = normalizeSaleId(user?.saleId);

    if (!saleId) return;

    saleIdToUser.set(saleId, user);
  });

  getLoansCreatedInRange(loans, range).forEach((loan) => {
    if (!isValidOwnerSaleId(loan.ownerSaleId)) return;

    const saleId = normalizeSaleId(loan.ownerSaleId);

    if (!groupedBySaleId.has(saleId)) {
      const user = saleIdToUser.get(saleId);
      const displayName = getTopCtvDisplayName(user, saleId);

      groupedBySaleId.set(saleId, {
        ownerSaleId: saleId,
        displayName,
        displayLabel: user ? `${displayName} / ${saleId}` : saleId,
        orderCount: 0,
        latestCreatedAt: null,
      });
    }

    const item = groupedBySaleId.get(saleId);
    const createdAt = parseDateValue(loan.createdAt);

    item.orderCount += 1;

    if (createdAt && (!item.latestCreatedAt || createdAt > item.latestCreatedAt)) {
      item.latestCreatedAt = createdAt;
    }
  });

  return Array.from(groupedBySaleId.values())
    .sort((a, b) => {
      if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;

      return a.ownerSaleId.localeCompare(b.ownerSaleId);
    })
    .map((item, index) => ({
      rank: index + 1,
      ...item,
      latestCreatedAt: item.latestCreatedAt ? item.latestCreatedAt.toISOString() : null,
    }));
}
