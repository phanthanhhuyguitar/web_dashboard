import { LOAN_STATUSES } from '../config/statusMap.js';
import { isDateInRange } from './date.js';

function toSafeAmount(value) {
  const amount = Number(value || 0);

  return Number.isFinite(amount) ? amount : 0;
}

function normalizeSaleId(value) {
  return String(value ?? '').trim();
}

export function calculateTopTeamsByDisbursement(teams, loans, { fromDate, toDate, limit = 5 }) {
  const teamMetricsById = new Map();
  const saleIdToTeam = new Map();

  teams.forEach((team) => {
    const orgUnitId = team.orgUnitId;
    const users = Array.isArray(team.users) ? team.users : [];

    teamMetricsById.set(orgUnitId, {
      orgUnitId,
      teamName: team.teamName || 'Không rõ team',
      teamCode: team.teamCode || '',
      leadName: team.lead?.name || 'Không rõ Lead',
      leadSaleId: team.lead?.saleId || '',
      memberCount: users.length,
      ctvCount: users.filter((user) => user.roleName !== 'Lead').length,
      closedLoanCount: 0,
      disbursementAmount: 0,
    });

    users.forEach((user) => {
      const saleId = normalizeSaleId(user.saleId);

      if (saleId) {
        saleIdToTeam.set(saleId, orgUnitId);
      }
    });
  });

  loans.forEach((loan) => {
    if (!isDateInRange(loan.createdAt, { fromDate, toDate })) return;
    if (loan.status !== LOAN_STATUSES.CLOSED) return;

    const saleId = normalizeSaleId(loan.ownerSaleId);
    const teamId = saleIdToTeam.get(saleId);
    const amount = toSafeAmount(loan.approvedAmount);

    if (!teamId || amount <= 0) return;

    const teamMetric = teamMetricsById.get(teamId);

    if (!teamMetric) return;

    teamMetric.closedLoanCount += 1;
    teamMetric.disbursementAmount += amount;
  });

  return Array.from(teamMetricsById.values())
    .filter((team) => team.disbursementAmount > 0)
    .sort((a, b) => {
      if (b.disbursementAmount !== a.disbursementAmount) {
        return b.disbursementAmount - a.disbursementAmount;
      }

      if (b.closedLoanCount !== a.closedLoanCount) {
        return b.closedLoanCount - a.closedLoanCount;
      }

      return a.teamName.localeCompare(b.teamName, 'vi');
    })
    .slice(0, limit);
}
