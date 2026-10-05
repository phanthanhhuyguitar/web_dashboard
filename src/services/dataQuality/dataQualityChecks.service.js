import { parseDateValue } from '../../utils/date.js';

function normalizeSaleId(value) {
  return String(value ?? '').trim().replace(/^DR/i, '');
}

function extractUserSaleId(user) {
  const direct = user?.saleId;

  return direct !== undefined && direct !== null && String(direct).trim() !== '' ? normalizeSaleId(direct) : '';
}

// A. User khong co field saleId rieng (chi co referralCode) - van tinh duoc nho fallback sang
// referralCode o cac cho khac cua he thong, nhung nen ra soat nguon du lieu goc.
function checkUsersMissingSaleId(users) {
  const affected = users.filter((user) => {
    const hasSaleId = user?.saleId !== undefined && user?.saleId !== null && String(user.saleId).trim() !== '';

    return !hasSaleId;
  });

  return {
    id: 'users-missing-sale-id',
    title: 'User thiếu saleId',
    description: 'Chỉ có referralCode, không có field saleId riêng - hệ thống vẫn tính được nhờ dùng referralCode (bỏ tiền tố "DR") thay thế, nhưng nên rà soát nguồn dữ liệu gốc.',
    severity: 'warning',
    count: affected.length,
    samples: affected.map((user) => ({
      label: user?.fullName || user?.name || user?.phoneNumber || '(không tên)',
      detail: `SĐT: ${user?.phoneNumber || '--'} • ID: ${user?.id || user?.userId || '--'} • referralCode: ${user?.referralCode || '--'}`,
    })),
  };
}

// B. Don vay khong co sale phu trach (ownerSaleId rong) - theo dung nghia cua API, don nay
// khong thuoc ve sale nao ca. La thong tin, khong han la loi du lieu.
function checkLoansWithoutOwner(loans) {
  const affected = loans.filter((loan) => !normalizeSaleId(loan?.ownerSaleId));

  return {
    id: 'loans-without-owner',
    title: 'Đơn vay không có sale phụ trách',
    description: 'ownerSaleId rỗng - theo API, đơn này không thuộc về sale nào (không phải lỗi, chỉ để biết số lượng).',
    severity: 'info',
    count: affected.length,
    samples: affected.map((loan) => ({
      label: loan?.loanId || loan?.id || '(không có mã đơn)',
      detail: `Trạng thái: ${loan?.status || '--'}`,
    })),
  };
}

// C. Don vay CO ownerSaleId nhung khong khop bat ky user nao dang co - day moi la truong hop
// dang nghi (user bi xoa, doi ma, hoac du lieu lech that su).
function checkOrphanedLoans(loans, users) {
  const knownSaleIds = new Set(users.map(extractUserSaleId).filter(Boolean));
  const affected = loans.filter((loan) => {
    const saleId = normalizeSaleId(loan?.ownerSaleId);

    return saleId && !knownSaleIds.has(saleId);
  });

  return {
    id: 'loans-orphaned',
    title: 'Đơn vay có mã sale không tồn tại',
    description: 'ownerSaleId có giá trị nhưng không khớp với bất kỳ user nào đang có trong hệ thống.',
    severity: 'error',
    count: affected.length,
    samples: affected.map((loan) => ({
      label: loan?.loanId || loan?.id || '(không có mã đơn)',
      detail: `Mã sale: ${loan?.ownerSaleId}`,
    })),
  };
}

// D. Ngay thang loi dinh dang - cac record nay se bi am tham loai khoi cac phep tinh theo
// thang/ky (KPI, hoa hong...) neu khong phat hien som.
function checkInvalidDates(loans, users) {
  const invalidLoanCreated = loans.filter((loan) => loan?.createdAt && !parseDateValue(loan.createdAt));
  const invalidLoanUpdated = loans.filter((loan) => loan?.updatedAt && !parseDateValue(loan.updatedAt));
  const invalidUsers = users.filter((user) => user?.createdAt && !parseDateValue(user.createdAt));
  const count = invalidLoanCreated.length + invalidLoanUpdated.length + invalidUsers.length;

  const samples = [
    ...invalidLoanCreated.map((loan) => ({
      label: loan?.loanId || '(đơn vay)',
      detail: `createdAt không đọc được: "${loan.createdAt}"`,
    })),
    ...invalidLoanUpdated.map((loan) => ({
      label: loan?.loanId || '(đơn vay)',
      detail: `updatedAt không đọc được: "${loan.updatedAt}"`,
    })),
    ...invalidUsers.map((user) => ({
      label: user?.fullName || user?.saleId || '(user)',
      detail: `createdAt không đọc được: "${user.createdAt}"`,
    })),
  ];

  return {
    id: 'invalid-dates',
    title: 'Ngày tháng lỗi định dạng',
    description: 'Các record này có ngày tháng không đọc được, sẽ bị loại khỏi các phép tính theo tháng/kỳ (KPI, hoa hồng...).',
    severity: count > 0 ? 'error' : 'info',
    count,
    samples,
  };
}

// E. Team lech cau truc - khong co Lead, hoac Lead khong con ton tai trong danh sach user.
function checkTeamStructure(teams, users) {
  const knownSaleIds = new Set(users.map(extractUserSaleId).filter(Boolean));
  const noLead = teams.filter((team) => !team?.lead?.saleId);
  const leadNotFound = teams.filter((team) => {
    const leadSaleId = normalizeSaleId(team?.lead?.saleId);

    return leadSaleId && !knownSaleIds.has(leadSaleId);
  });
  const count = noLead.length + leadNotFound.length;

  const samples = [
    ...noLead.map((team) => ({
      label: team?.teamName || String(team?.orgUnitId ?? ''),
      detail: 'Không có quản lý',
    })),
    ...leadNotFound.map((team) => ({
      label: team?.teamName || String(team?.orgUnitId ?? ''),
      detail: `Quản lý saleId "${team?.lead?.saleId}" không có trong danh sách user hiện tại`,
    })),
  ];

  return {
    id: 'team-structure',
    title: 'Team lệch cấu trúc',
    description: 'Team không có quản lý, hoặc quản lý của team không tồn tại trong danh sách user hiện tại.',
    severity: count > 0 ? 'warning' : 'info',
    count,
    samples,
  };
}

// E2. Team thieu hoac trung vai tro quan ly - khong ai giu Lead/BM, hoac >=2 nguoi cung giu
// vai tro quan ly (Lead/BM) trong cung 1 to chuc. Dung lai du lieu teams (da co san tu
// fetchManageTeamsWithUsers), khong goi them API.
const MANAGEMENT_ROLE_NAMES = new Set(['Lead', 'BM']);

function checkTeamManagementRoles(teams) {
  const missing = [];
  const duplicated = [];

  teams.forEach((team) => {
    const managers = (team?.users || []).filter((user) => MANAGEMENT_ROLE_NAMES.has(user?.roleName));

    if (managers.length === 0) {
      missing.push(team);
    } else if (managers.length >= 2) {
      duplicated.push({ team, managers });
    }
  });

  const count = missing.length + duplicated.length;

  const samples = [
    ...missing.map((team) => ({
      label: team?.teamName || String(team?.orgUnitId ?? ''),
      detail: 'Không có ai giữ vai trò Lead hoặc BM',
    })),
    ...duplicated.map(({ team, managers }) => ({
      label: team?.teamName || String(team?.orgUnitId ?? ''),
      detail: `${managers.length} người cùng giữ vai trò quản lý: ${managers
        .map((manager) => `${manager.name || manager.phoneNumber || '(không tên)'} (${manager.roleName})`)
        .join(', ')}`,
    })),
  ];

  return {
    id: 'team-management-roles',
    title: 'Team thiếu hoặc trùng vai trò quản lý',
    description: 'Team không có ai giữ vai trò Lead/BM, hoặc có từ 2 người trở lên cùng giữ vai trò quản lý (Lead/BM) trong cùng một tổ chức.',
    severity: count > 0 ? 'warning' : 'info',
    count,
    samples,
  };
}

// F. Du lieu dong bo local (Segment) qua cu - dua tren thoi gian sua file lay tu
// /api/data-quality/sync-freshness (server/modules/dataQualityStatus.cjs).
function checkSyncFreshness(freshness, { staleDays = 7 } = {}) {
  if (!freshness) {
    return {
      id: 'sync-freshness',
      title: 'Độ mới dữ liệu đồng bộ local',
      description: 'Không kiểm tra được (chưa từng chạy đồng bộ, hoặc endpoint local chưa sẵn sàng).',
      severity: 'info',
      count: 0,
      samples: [],
    };
  }

  const now = Date.now();
  const entries = [
    { label: 'User detail', info: freshness.userDetail },
    { label: 'Đơn vay', info: freshness.loan },
  ];

  const staleEntries = entries.filter(({ info }) => {
    if (!info?.exists || !info.lastModifiedAt) return true;

    const ageDays = (now - new Date(info.lastModifiedAt).getTime()) / (24 * 60 * 60 * 1000);

    return ageDays > staleDays;
  });

  return {
    id: 'sync-freshness',
    title: 'Độ mới dữ liệu đồng bộ local',
    description: `Cảnh báo nếu file dữ liệu đồng bộ local (dùng cho tính năng Segment) chưa cập nhật trong ${staleDays} ngày gần nhất.`,
    severity: staleEntries.length > 0 ? 'warning' : 'info',
    count: staleEntries.length,
    samples: staleEntries.map(({ label, info }) => ({
      label,
      detail: info?.exists ? `Cập nhật lần cuối: ${new Date(info.lastModifiedAt).toLocaleString('vi-VN')}` : 'Chưa từng đồng bộ',
    })),
  };
}

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

export function runDataQualityChecks({ loans = [], users = [], teams = [], syncFreshness = null, staleDays = 7 }) {
  const results = [
    checkOrphanedLoans(loans, users),
    checkInvalidDates(loans, users),
    checkTeamStructure(teams, users),
    checkTeamManagementRoles(teams),
    checkUsersMissingSaleId(users),
    checkLoansWithoutOwner(loans),
    checkSyncFreshness(syncFreshness, { staleDays }),
  ];

  return results.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
