import { isDateInRange, parseDateValue } from '../../utils/date.js';

function getUserCreatedAt(user) {
  return user?.createdAt;
}

export function calculateUserDashboardMetrics(users, { fromDate, toDate }) {
  const activeUsers = users.filter((user) => {
    return isDateInRange(getUserCreatedAt(user), { fromDate, toDate });
  }).length;

  return {
    activeUsers,
  };
}

export function buildActiveUserCountByMonth(users, { monthsLimit = 12 } = {}) {
  const countByMonth = new Map();

  users.forEach((user) => {
    const date = parseDateValue(getUserCreatedAt(user));

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
      activeUsers: countByMonth.get(monthKey),
    };
  });
}
