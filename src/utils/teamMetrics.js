import { buildOrgUnitTree } from '../api/orgUnitsApi.js';
import { LOAN_STATUSES } from '../config/statusMap.js';
import { getPreviousMonthRange, isDateInRange, parseDateValue } from './date.js';

const DEFAULT_RISK_DROP_PERCENT = 30;
const DEFAULT_RISK_INACTIVE_DAYS = 14;

function toSafeAmount(value) {
  const amount = Number(value || 0);

  return Number.isFinite(amount) ? amount : 0;
}

// saleId thật không bao giờ có tiền tố "DR" — 1 số user chỉ có referralCode dạng
// "DR028605" (thiếu field saleId riêng), nên phải bỏ tiền tố này để khớp đúng với
// loan.ownerSaleId (không bao giờ có "DR").
function normalizeSaleId(value) {
  return String(value ?? '').trim().replace(/^DR/i, '');
}

function buildTeamMetricsById(teams, loans, { fromDate, toDate }) {
  const teamMetricsById = new Map();
  const saleIdToTeam = new Map();

  teams.forEach((team) => {
    const orgUnitId = String(team.orgUnitId);
    const users = Array.isArray(team.users) ? team.users : [];

    teamMetricsById.set(orgUnitId, {
      orgUnitId: team.orgUnitId,
      teamName: team.teamName || 'Không rõ team',
      teamCode: team.teamCode || '',
      leadName: team.lead?.name || '',
      leadSaleId: normalizeSaleId(team.lead?.saleId),
      bmName: team.bm?.name || '',
      bmSaleId: normalizeSaleId(team.bm?.saleId),
      memberCount: users.length,
      ctvCount: users.filter((user) => user.roleName !== 'Lead' && user.roleName !== 'BM').length,
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
    if (loan.status !== LOAN_STATUSES.CLOSED) return;
    if (!isDateInRange(loan.updatedAt, { fromDate, toDate })) return;

    const saleId = normalizeSaleId(loan.ownerSaleId);
    const teamId = saleIdToTeam.get(saleId);
    const amount = toSafeAmount(loan.approvedAmount);

    if (!teamId || amount <= 0) return;

    const teamMetric = teamMetricsById.get(teamId);

    if (!teamMetric) return;

    teamMetric.closedLoanCount += 1;
    teamMetric.disbursementAmount += amount;
  });

  return teamMetricsById;
}

export function getTeamLeaderLabel(team) {
  if (team.leadName) return `Quản lý: ${team.leadName}`;
  if (team.bmName) return `BM: ${team.bmName}`;

  return '';
}

export function calculateTopTeamsByDisbursement(teams, loans, { fromDate, toDate, limit = Infinity }) {
  const teamMetricsById = buildTeamMetricsById(teams, loans, { fromDate, toDate });
  const rankedTeams = Array.from(teamMetricsById.values())
    .filter((team) => team.disbursementAmount > 0 && Boolean(team.leadName))
    .sort((a, b) => {
      if (b.disbursementAmount !== a.disbursementAmount) {
        return b.disbursementAmount - a.disbursementAmount;
      }

      if (b.closedLoanCount !== a.closedLoanCount) {
        return b.closedLoanCount - a.closedLoanCount;
      }

      return a.teamName.localeCompare(b.teamName, 'vi');
    });

  return Number.isFinite(limit) ? rankedTeams.slice(0, limit) : rankedTeams;
}

// Ngay CLOSED gan nhat cua tung team, tinh tren TOAN BO loans (khong gioi han theo range dang
// xem) - de biet team da bao lau roi khong phat sinh don, bat ke dang xem thang nao.
function getLastOrderDateByTeam(teams, loans) {
  const saleIdToTeam = new Map();

  teams.forEach((team) => {
    const orgUnitId = String(team.orgUnitId);
    const users = Array.isArray(team.users) ? team.users : [];

    users.forEach((user) => {
      const saleId = normalizeSaleId(user.saleId);

      if (saleId) {
        saleIdToTeam.set(saleId, orgUnitId);
      }
    });
  });

  const lastOrderByTeam = new Map();

  loans.forEach((loan) => {
    if (loan.status !== LOAN_STATUSES.CLOSED) return;

    const saleId = normalizeSaleId(loan.ownerSaleId);
    const teamId = saleIdToTeam.get(saleId);

    if (!teamId) return;

    const closedDate = parseDateValue(loan.updatedAt);

    if (!closedDate) return;

    const current = lastOrderByTeam.get(teamId);

    if (!current || closedDate > current) {
      lastOrderByTeam.set(teamId, closedDate);
    }
  });

  return lastOrderByTeam;
}

// Phat hien team dang "tut": doanh so giam manh so voi cung ky thang truoc, hoac khong co
// don CLOSED nao trong N ngay gan nhat. Dung rieng ham nay (khong loc disbursementAmount > 0
// nhu calculateTopTeamsByDisbursement) vi team dang risk thuong KHONG con nam trong top doanh
// so cao nhat nua.
export function calculateTeamRiskAlerts(
  teams,
  loans,
  range,
  { dropThresholdPercent = DEFAULT_RISK_DROP_PERCENT, inactiveDays = DEFAULT_RISK_INACTIVE_DAYS, limit = 5 } = {}
) {
  const currentMetricsById = buildTeamMetricsById(teams, loans, range);
  const previousMetricsById = buildTeamMetricsById(teams, loans, getPreviousMonthRange(range));
  const lastOrderByTeam = getLastOrderDateByTeam(teams, loans);
  const now = new Date();

  return Array.from(currentMetricsById.values())
    .filter((team) => Boolean(team.leadName))
    .map((team) => {
      const teamId = String(team.orgUnitId);
      const previousAmount = previousMetricsById.get(teamId)?.disbursementAmount || 0;
      const changePercent =
        previousAmount > 0 ? ((team.disbursementAmount - previousAmount) / previousAmount) * 100 : null;
      const lastOrderDate = lastOrderByTeam.get(teamId) || null;
      const daysSinceLastOrder = lastOrderDate
        ? Math.floor((now.getTime() - lastOrderDate.getTime()) / (24 * 60 * 60 * 1000))
        : null;

      return {
        ...team,
        previousDisbursementAmount: previousAmount,
        changePercent,
        daysSinceLastOrder,
        isDropping: changePercent !== null && changePercent <= -dropThresholdPercent,
        isInactive: daysSinceLastOrder !== null && daysSinceLastOrder >= inactiveDays,
      };
    })
    .filter((team) => team.isDropping || team.isInactive)
    .sort((a, b) => {
      if (a.isInactive !== b.isInactive) return a.isInactive ? -1 : 1;
      if (a.isInactive) return (b.daysSinceLastOrder ?? 0) - (a.daysSinceLastOrder ?? 0);

      return (a.changePercent ?? 0) - (b.changePercent ?? 0);
    })
    .slice(0, limit);
}

export function buildOrgRevenueTree(orgUnits, teams, loans, { fromDate, toDate }) {
  const teamMetricsById = buildTeamMetricsById(teams, loans, { fromDate, toDate });
  const tree = buildOrgUnitTree(orgUnits);

  function annotate(node) {
    const children = node.children.map(annotate);
    const ownMetric = teamMetricsById.get(String(node.id));
    const disbursementAmount =
      (ownMetric?.disbursementAmount || 0) + children.reduce((sum, child) => sum + child.disbursementAmount, 0);
    const closedLoanCount =
      (ownMetric?.closedLoanCount || 0) + children.reduce((sum, child) => sum + child.closedLoanCount, 0);
    const ctvCount = (ownMetric?.ctvCount || 0) + children.reduce((sum, child) => sum + child.ctvCount, 0);

    return {
      ...node,
      children,
      isTeam: Boolean(ownMetric),
      leadName: ownMetric?.leadName || '',
      bmName: ownMetric?.bmName || '',
      disbursementAmount,
      closedLoanCount,
      ctvCount,
    };
  }

  return tree.map(annotate);
}
