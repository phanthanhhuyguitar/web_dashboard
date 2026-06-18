import { isDateInRange } from '../../utils/date.js';

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
