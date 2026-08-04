import { COMMISSION_RULES } from '../../config/commissionRules.js';
import { LOAN_STATUSES } from '../../config/statusMap.js';
import { isDateInRange, parseDateValue } from '../../utils/date.js';

const CGY_PREFIX_REGEX = new RegExp(`^${COMMISSION_RULES.cgyPrefix}`, 'i');

function toSafeAmount(value) {
  const amount = Number(value || 0);

  return Number.isFinite(amount) ? amount : 0;
}

function normalizeSaleId(value) {
  return String(value ?? '').trim().replace(/^DR/i, '');
}

function isCgySaleId(saleId) {
  return CGY_PREFIX_REGEX.test(saleId);
}

// Chon tier CAO NHAT co minAmount <= amount (toan bo so tien tinh theo 1 muc, khong luy tien).
function resolveTierRate(amount, tiers) {
  let rate = 0;

  tiers.forEach((tier) => {
    if (amount >= tier.minAmount) {
      rate = tier.rate;
    }
  });

  return rate;
}

// Don CLOSED trong ky, gop theo saleId (giu tung don rieng, chua sum) - dung ngay CLOSED
// (updatedAt) giong cac chi so doanh so khac cua dashboard, khong dung ngay tao don. Giu rieng
// tung don (khong sum ngay) vi rule (1) can loc theo ngay CLOSED cua TUNG don khi tinh doanh so
// nhom, khong the loc duoc sau khi da cong don.
function buildClosedLoansBySaleId(loans, range) {
  const bySaleId = new Map();

  loans.forEach((loan) => {
    if (loan.status !== LOAN_STATUSES.CLOSED) return;
    if (!isDateInRange(loan.updatedAt, range)) return;

    const saleId = normalizeSaleId(loan.ownerSaleId);

    if (!saleId) return;

    if (!bySaleId.has(saleId)) bySaleId.set(saleId, []);

    bySaleId.get(saleId).push({
      amount: toSafeAmount(loan.approvedAmount),
      closedAt: parseDateValue(loan.updatedAt),
    });
  });

  return bySaleId;
}

function sumLoanAmount(loanEntries) {
  return loanEntries.reduce((sum, entry) => sum + entry.amount, 0);
}

// LUU Y QUAN TRONG: API danh sach user (search-users, dung cho ca dashboard) chi tra ve field
// "role" voi 3 gia tri CTV/RM/rong - KHONG phan biet duoc Employee hay Lead (da kiem chung:
// 1 nguoi la Lead thuc te van tra ve role="CTV"). Vi vay KHONG dung field nay de xac dinh vai
// tro. Nguon dang tin cay duy nhat de biet ai la Lead la du lieu "teams" (team.lead.saleId) -
// da duoc dung on dinh cho Top Team/Team risk alert tu truoc.
function buildTeamContextByLeadSaleId(teams) {
  const map = new Map();

  teams.forEach((team) => {
    const leadSaleId = normalizeSaleId(team?.lead?.saleId);

    if (!leadSaleId) return;

    const memberSaleIds = (Array.isArray(team.users) ? team.users : [])
      .map((user) => normalizeSaleId(user?.saleId))
      .filter((saleId) => saleId && saleId !== leadSaleId);

    map.set(leadSaleId, {
      leadName: team.lead?.name || '',
      orgUnitId: team.orgUnitId,
      memberSaleIds,
    });
  });

  return map;
}

function buildFullNameBySaleId(users) {
  const map = new Map();

  users.forEach((user) => {
    const saleId = normalizeSaleId(user?.saleId);
    const fullName = user?.fullName || user?.name || '';

    if (saleId && fullName && !map.has(saleId)) {
      map.set(saleId, fullName);
    }
  });

  return map;
}

// Rule (2): CTV chi duoc tinh doanh so vao doanh so nhom cua Lead neu tai khoan dang ACTIVE.
// Field "status" nay co san trong API danh sach dang dung, khong ton them API nao.
function buildActiveSaleIdSet(users) {
  const set = new Set();

  users.forEach((user) => {
    const saleId = normalizeSaleId(user?.saleId);

    if (saleId && String(user?.status ?? '').trim().toUpperCase() === 'ACTIVE') {
      set.add(saleId);
    }
  });

  return set;
}

// Rule (1): ngay join to chuc (orgInfos[].createdAt) - CHI co o API detail tung user, khong co
// o API danh sach dashboard dang goi. Lay qua endpoint local /api/commission/org-join-info
// (doc tu file da dong bo san, khong goi them API that - xem server/modules/commissionOrgInfo.cjs).
// Neu khong co du lieu (endpoint loi/chua sync) thi KHONG loc (fail open), tranh lam gian doan
// ca tinh nang chi vi thieu 1 rule bo sung.
function getJoinDateForOrg(saleId, orgUnitId, orgJoinInfoBySaleId) {
  const entries = orgJoinInfoBySaleId?.[saleId];

  if (!Array.isArray(entries) || !orgUnitId) return null;

  const match = entries.find((entry) => String(entry.orgId) === String(orgUnitId));

  return match ? parseDateValue(match.createdAt) : null;
}

function calculateEmployeeCommission({ saleId, disbursementAmount }) {
  const rate = isCgySaleId(saleId)
    ? COMMISSION_RULES.cgyEmployeeRate
    : resolveTierRate(disbursementAmount, COMMISSION_RULES.employeeTiers);

  return disbursementAmount * rate;
}

function calculateLeadCommission({ saleId, disbursementAmount, teamDisbursementAmount }) {
  if (isCgySaleId(saleId)) {
    return (teamDisbursementAmount + disbursementAmount) * COMMISSION_RULES.cgyLeadRate;
  }

  const teamRate = resolveTierRate(teamDisbursementAmount, COMMISSION_RULES.leadTeamTiers);
  const ownRate = resolveTierRate(disbursementAmount, COMMISSION_RULES.employeeTiers);

  return teamDisbursementAmount * teamRate + disbursementAmount * ownRate;
}

// Doanh so nhom cua 1 Lead: chi cong don cua member dang ACTIVE (rule 2), va chi tinh don CLOSED
// tu sau ngay member do join DUNG team nay (rule 1, neu co du lieu ngay join).
function calculateTeamDisbursement({ teamContext, closedLoansBySaleId, activeSaleIdSet, orgJoinInfoBySaleId }) {
  return teamContext.memberSaleIds.reduce((sum, memberSaleId) => {
    if (!activeSaleIdSet.has(memberSaleId)) return sum;

    const entries = closedLoansBySaleId.get(memberSaleId) || [];
    const joinDate = getJoinDateForOrg(memberSaleId, teamContext.orgUnitId, orgJoinInfoBySaleId);
    const eligibleEntries = joinDate
      ? entries.filter((entry) => !entry.closedAt || entry.closedAt >= joinDate)
      : entries;

    return sum + sumLoanAmount(eligibleEntries);
  }, 0);
}

// Tinh hoa hong tam tinh cho toan bo user, thuan tuy tren du lieu da co san (loans/users/teams
// dashboard da fetch cho cac chi so khac, + ngay join to chuc lay tu local sync khong qua API
// that) - KHONG goi them API that nao ca.
export function calculateCommissionMetrics({ loans = [], users = [], teams = [], orgJoinInfoBySaleId = {}, range }) {
  if (!range?.fromDate || !range?.toDate) {
    return { totalCommission: 0, breakdown: [] };
  }

  const closedLoansBySaleId = buildClosedLoansBySaleId(loans, range);
  const disbursementBySaleId = new Map();

  closedLoansBySaleId.forEach((entries, saleId) => {
    disbursementBySaleId.set(saleId, sumLoanAmount(entries));
  });

  const teamContextByLeadSaleId = buildTeamContextByLeadSaleId(teams);
  const fullNameBySaleId = buildFullNameBySaleId(users);
  const activeSaleIdSet = buildActiveSaleIdSet(users);

  // Danh sach can xet = moi saleId co doanh so trong ky, HOP voi moi saleId dang la Lead cua
  // 1 team (ke ca khi ban than Lead do khong tu ban duoc dong nao trong ky - van co the co
  // hoa hong phan (1) tu doanh so team).
  const saleIdsToEvaluate = new Set([...disbursementBySaleId.keys(), ...teamContextByLeadSaleId.keys()]);

  const breakdown = Array.from(saleIdsToEvaluate)
    .map((saleId) => {
      const teamContext = teamContextByLeadSaleId.get(saleId);
      const isLead = Boolean(teamContext);
      const disbursementAmount = disbursementBySaleId.get(saleId) || 0;
      let teamDisbursementAmount = 0;
      let commission;

      if (isLead) {
        teamDisbursementAmount = calculateTeamDisbursement({
          teamContext,
          closedLoansBySaleId,
          activeSaleIdSet,
          orgJoinInfoBySaleId,
        });
        commission = calculateLeadCommission({ saleId, disbursementAmount, teamDisbursementAmount });
      } else {
        commission = calculateEmployeeCommission({ saleId, disbursementAmount });
      }

      if (commission <= 0 && disbursementAmount <= 0 && teamDisbursementAmount <= 0) return null;

      return {
        saleId,
        fullName: (isLead && teamContext.leadName) || fullNameBySaleId.get(saleId) || '',
        role: isLead ? 'Lead' : 'Employee',
        isCgy: isCgySaleId(saleId),
        disbursementAmount,
        teamDisbursementAmount,
        commission,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.commission - a.commission);

  const totalCommission = breakdown.reduce((sum, item) => sum + item.commission, 0);

  return { totalCommission, breakdown };
}

function getMonthRange(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();

  return {
    fromDate: `${monthKey}-01`,
    toDate: `${monthKey}-${String(lastDay).padStart(2, '0')}`,
  };
}

// Tong hoa hong tam tinh theo tung thang (toi da monthsLimit thang gan nhat co du lieu don
// CLOSED) - dung cho bieu do xu huong, chay lai calculateCommissionMetrics cho tung thang.
// Van thuan tuy tinh tren du lieu da co san, khong goi them API nao.
export function buildCommissionAmountByMonth({ loans = [], users = [], teams = [], orgJoinInfoBySaleId = {}, monthsLimit = 12 }) {
  const monthKeys = new Set();

  loans.forEach((loan) => {
    if (loan.status !== LOAN_STATUSES.CLOSED) return;

    const closedAt = parseDateValue(loan.updatedAt);

    if (!closedAt) return;

    monthKeys.add(`${closedAt.getFullYear()}-${String(closedAt.getMonth() + 1).padStart(2, '0')}`);
  });

  const sortedMonthKeys = Array.from(monthKeys).sort().slice(-monthsLimit);

  return sortedMonthKeys.map((monthKey) => {
    const [year, month] = monthKey.split('-');
    const { totalCommission } = calculateCommissionMetrics({
      loans,
      users,
      teams,
      orgJoinInfoBySaleId,
      range: getMonthRange(monthKey),
    });

    return {
      month: monthKey,
      label: `T${Number(month)}/${year}`,
      commissionAmount: totalCommission,
    };
  });
}
