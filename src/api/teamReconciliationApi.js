// API cho "Xem truoc doi soat" cua TEAM LEAD (khac voi CTV thuong - xem reconciliationListApi.js).
//
// Boi canh: user role Team Lead khong dung ten don vay nao ca nen khong bao gio xuat hien trong
// search-disbursed, nhung he thong van tu dong day file doi soat cho ho (hoa hong override tinh
// tren doanh so ca team). Module nay dung de PREVIEW truoc so lieu do:
//   1) Doanh so CA NHAN cua lead (neu co) -> dung lai search-disbursed nhu CTV thuong
//      (fetchAllReconciliationLoans), vi nguon nay da co san day du customerName/productName/...
//      de hien thi dang "file doi soat" giong CTV.
//   2) Doanh so cua TUNG THANH VIEN trong team ma lead do quan ly -> theo yeu cau nguoi dung,
//      cong tu API "loan list" (/admin/loans, dung o trang chu/dashboard) qua cot ownerSaleId +
//      approvedAmount - CHU KHONG goi search-disbursed rieng tung thanh vien.
//   3) Chi tinh nhung don giai ngan SAU ngay thanh vien do gia nhap team (theo yeu cau nguoi
//      dung) - don nao giai ngan truoc ngay gia nhap se bi loai VA bao thanh canh bao tren UI.
//   4) Tim team + xac dinh vai tro (Lead/BM) cua 1 ma sale: goi thang org-units/org-units/users
//      qua fetchManageTeamsWithUsers() (co san, dung lai nguyen - khong tu dung lai danh sach
//      dong bo local).
import { fetchManageTeamsWithUsers, runWithConcurrency } from './orgUnitsApi.js';
import { fetchAllLoans } from './loansApi.js';
import { fetchUserOrgJoinDate, fetchUserProfileById } from './usersApi.js';
import { fetchAllReconciliationLoans } from './reconciliationListApi.js';
import {
  getLeadPersonalRate,
  calculateLeadPersonalCommission,
  allocateTeamCommission,
} from '../utils/commissionFormula.js';
import { LOAN_STATUSES } from '../config/statusMap.js';
import { isDateInRange, parseDateValue } from '../utils/date.js';

const JOIN_DATE_GAP_WARNING =
  'Dữ liệu chỉ tổng hợp theo danh sách thành viên ĐANG có trong nhóm tại thời điểm xem. Hệ thống không lưu lịch sử thành viên theo thời gian, nên nếu có CTV đã rời nhóm trong kỳ đối soát này, doanh số của họ sẽ không được tính vào đây - cần đối chiếu thủ công nếu nghi ngờ thiếu số liệu.';

// saleId that khong bao gio co tien to "DR" - 1 so user chi co referralCode dang "DR028605"
// (thieu field saleId rieng). Dung chung 1 cach chuan hoa voi teamMetrics.js de khop dung
// loan.ownerSaleId.
function normalizeSaleId(value) {
  return String(value ?? '')
    .trim()
    .replace(/^DR/i, '');
}

function getMonthDateRange(reportDate) {
  const match = String(reportDate || '').match(/^(\d{4})-(\d{2})$/);

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const lastDay = new Date(year, month, 0).getDate();
  const pad = (n) => String(n).padStart(2, '0');

  return {
    fromDate: `${year}-${pad(month)}-01`,
    toDate: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

// Tim team ma 1 ma sale dang la Lead hoac BM quan ly. Tra ve { team, roleUser, title } hoac null
// neu ma sale do khong quan ly team nao (tuc khong phai Team Lead/BM).
async function findManagedTeamBySaleId(saleId) {
  const targetSaleId = normalizeSaleId(saleId);

  if (!targetSaleId) return null;

  const teams = await fetchManageTeamsWithUsers();

  for (const team of teams) {
    if (team.lead && normalizeSaleId(team.lead.saleId) === targetSaleId) {
      return { team, roleUser: team.lead, title: 'Team Lead' };
    }

    if (team.bm && normalizeSaleId(team.bm.saleId) === targetSaleId) {
      return { team, roleUser: team.bm, title: 'BM' };
    }
  }

  return null;
}

// Tra ve null neu saleId khong phai Team Lead/BM dang quan ly team nao (de page quay lai trang
// thai "khong tim thay" binh thuong). Neu co, tra ve toan bo du lieu da tinh toan san de hien thi
// modal preview dang "file doi soat".
export async function fetchTeamLeadReconciliationPreview({ reportDate = '', leadSaleId = '' } = {}) {
  const managed = await findManagedTeamBySaleId(leadSaleId);

  if (!managed) return null;

  const { team, roleUser, title } = managed;
  const normalizedLeadSaleId = normalizeSaleId(leadSaleId);
  const warnings = [JOIN_DATE_GAP_WARNING];

  // 1) Doanh so ca nhan cua lead - dung lai search-disbursed nhu CTV thuong.
  const personalItems = await fetchAllReconciliationLoans({ reportDate, saleId: normalizedLeadSaleId });
  const personalRevenue = personalItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const personalRate = getLeadPersonalRate(personalRevenue);
  const personalItemsWithCommission = personalItems.map((item) => ({
    ...item,
    commission: Math.round((Number(item.amount) || 0) * personalRate),
  }));
  const personalCommission = calculateLeadPersonalCommission(personalRevenue);

  // 2) Doanh so tung thanh vien - cong tu /admin/loans (ownerSaleId + approvedAmount), loc theo
  // trang thai CLOSED + updatedAt trong ky (dung quy uoc "ngay giai ngan" nhu teamMetrics.js dang
  // dung cho dashboard).
  const range = getMonthDateRange(reportDate);
  const allLoans = await fetchAllLoans({ filter: {} });
  const closedLoansInRange = allLoans.filter(
    (loan) => loan?.status === LOAN_STATUSES.CLOSED && (!range || isDateInRange(loan?.updatedAt, range))
  );

  const members = (Array.isArray(team.users) ? team.users : []).filter(
    (user) => normalizeSaleId(user.saleId) !== normalizedLeadSaleId && normalizeSaleId(user.saleId) !== ''
  );
  const loansByMemberSaleId = new Map();

  closedLoansInRange.forEach((loan) => {
    const saleId = normalizeSaleId(loan.ownerSaleId);

    if (!saleId) return;

    if (!loansByMemberSaleId.has(saleId)) loansByMemberSaleId.set(saleId, []);
    loansByMemberSaleId.get(saleId).push(loan);
  });

  // Chi can tra cuu ngay gia nhap cho thanh vien THAT SU co don trong ky (tranh goi API thua).
  const membersWithLoans = members.filter((member) => {
    const loans = loansByMemberSaleId.get(normalizeSaleId(member.saleId));
    return Array.isArray(loans) && loans.length > 0;
  });

  const joinDatesByUserId = new Map();

  await runWithConcurrency(membersWithLoans, 5, async (member) => {
    try {
      const joinDate = await fetchUserOrgJoinDate(member.userId, team.orgUnitId);
      joinDatesByUserId.set(member.userId, joinDate);
    } catch {
      joinDatesByUserId.set(member.userId, undefined); // undefined = loi tra cuu, khac null = khong co du lieu
    }
  });

  const memberRows = members.map((member) => {
    const memberSaleId = normalizeSaleId(member.saleId);
    const loans = loansByMemberSaleId.get(memberSaleId) || [];
    const joinDateRaw = joinDatesByUserId.has(member.userId) ? joinDatesByUserId.get(member.userId) : null;
    const joinDate = joinDateRaw ? parseDateValue(joinDateRaw) : null;

    if (loans.length === 0) {
      return { saleId: memberSaleId, name: member.name, revenue: 0, loanCount: 0, note: '' };
    }

    if (joinDateRaw === undefined) {
      warnings.push(
        `Không tra cứu được ngày tham gia nhóm của ${member.name} (${memberSaleId}) - tạm tính toàn bộ ${loans.length} đơn trong kỳ, cần đối chiếu lại thủ công.`
      );
    } else if (!joinDate) {
      warnings.push(
        `Không xác định được ngày tham gia nhóm của ${member.name} (${memberSaleId}) - tạm tính toàn bộ ${loans.length} đơn trong kỳ.`
      );
    }

    const excluded = [];
    const counted = loans.filter((loan) => {
      if (!joinDate) return true;

      const disbursedAt = parseDateValue(loan.updatedAt);
      const isBeforeJoin = disbursedAt && disbursedAt < joinDate;

      if (isBeforeJoin) excluded.push(loan);

      return !isBeforeJoin;
    });

    if (excluded.length > 0) {
      const excludedAmount = excluded.reduce((sum, loan) => sum + (Number(loan.approvedAmount) || 0), 0);

      warnings.push(
        `Đã loại ${excluded.length} đơn (tổng ${excludedAmount.toLocaleString('vi-VN')}đ) của ${member.name} (${memberSaleId}) vì giải ngân trước ngày tham gia nhóm (${joinDateRaw}).`
      );
    }

    return {
      saleId: memberSaleId,
      name: member.name,
      revenue: counted.reduce((sum, loan) => sum + (Number(loan.approvedAmount) || 0), 0),
      loanCount: counted.length,
      note: excluded.length > 0 ? 'Có đơn bị loại do giải ngân trước ngày tham gia nhóm' : '',
    };
  });

  const commissionByMember = allocateTeamCommission(
    memberRows.map((member) => ({ key: member.saleId, revenue: member.revenue }))
  );
  const teamResult = {
    totalRevenue: memberRows.reduce((sum, member) => sum + member.revenue, 0),
    members: memberRows.map((member) => ({
      ...member,
      commission: commissionByMember.get(member.saleId) || 0,
    })),
  };

  teamResult.totalCommission = teamResult.members.reduce((sum, member) => sum + member.commission, 0);

  // Thong tin hien thi o chan file (STK nhan tien) - lay tu profile chi tiet (danh sach thanh
  // vien org-units/users khong co so tai khoan).
  let bankAccountNumber = '';

  try {
    const profile = await fetchUserProfileById(roleUser.userId);
    bankAccountNumber = profile?.bankAccountNumber || '';
  } catch {
    bankAccountNumber = '';
  }

  return {
    isTeamLead: true,
    lead: {
      saleId: normalizedLeadSaleId,
      name: roleUser.name,
      title,
      bankAccountNumber,
      taxCode: '',
    },
    personal: {
      items: personalItemsWithCommission,
      totalRevenue: personalRevenue,
      totalCommission: personalCommission,
    },
    team: teamResult,
    totalIncome: personalCommission + teamResult.totalCommission,
    warnings,
  };
}
