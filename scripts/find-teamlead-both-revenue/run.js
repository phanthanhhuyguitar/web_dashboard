// Tim 1 Team Lead (hoac BM) vua co doanh so CA NHAN vua co doanh so TEAM (thanh vien co don) trong
// 1 thang cu the, qua API THAT. Chi doc du lieu, khong thay doi gi tren he thong.
//
// Thuat toan 2 pha de gioi han so API call:
//   Pha 1: quet tat ca don vi ORG_MANAGE (dung dung dinh nghia "team" cua app that - type ===
//          'ORG_MANAGE', KHONG tinh don vi con - xem fetchManageTeamsWithUsers trong
//          src/api/orgUnitsApi.js), voi moi team lay lead/BM va kiem tra doanh so CA NHAN cua
//          lead do (1 goi API moi team) - vi da biet da so team lead KHONG co don rieng nen day
//          la buoc loc re nhat truoc.
//   Pha 2: voi cac team ma lead CO doanh so ca nhan (thuong rat it), kiem tra tiep tung thanh
//          vien trong team (dung lai) xem co it nhat 1 nguoi co don trong thang khong - dung lai
//          (short-circuit) ngay khi gap 1 nguoi co don, khong can quet het ca team.
//
// Cach dung:
//   1. Dan Bearer token vao bien TOKEN ben duoi.
//   2. Sua YEAR/MONTH neu can.
//   3. Chay: node scripts/find-teamlead-both-revenue/run.js
// ===== CAU HINH =====
const TOKEN = ''; // <-- token nguoi dung gui
const YEAR = 2026;
const MONTH = 9;
const DELAY_MS = 200; // web nay chi 1 nguoi dung, giam delay de chay nhanh hon cac script truoc
const PAGE_SIZE_MEMBERS = 50;
const MAX_PAGES_MEMBERS = 30;
const MAX_MEMBERS_TO_CHECK_PER_TEAM = 25; // gioi han so thanh vien kiem tra o pha 2, tranh 1 team qua lon lam cham toan bo
// ====================

const BASE_URL = 'https://api-gw-ds.tnex.com.vn';
const ORG_UNITS_PATH = '/digital-sale-admin/api/v1/admin/org-units';
const ORG_UNIT_USERS_PATH = '/digital-sale-admin/api/v1/admin/org-units/users';
const SEARCH_DISBURSED_PATH = '/digital-sale-admin/api/v1/admin/search-disbursed';
const ORG_MANAGE_TYPE = 'ORG_MANAGE';
const LEAD_ROLE_NAMES = ['lead', 'bm'];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSaleId(value) {
  return String(value ?? '')
    .trim()
    .replace(/^DR/i, '');
}

async function callApi(path, { method = 'GET', body } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    headers: {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json',
      authorization: `Bearer ${TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} khi goi ${path}: ${data?.message || data?.error || 'khong ro loi'}`);
  }

  return data;
}

function extractOrgUnits(payload) {
  const list = payload?.data ?? payload;

  return Array.isArray(list) ? list : [];
}

function extractUsersPage(payload) {
  const users =
    payload?.data?.users ??
    payload?.data?.content ??
    payload?.data?.items ??
    payload?.data?.records ??
    payload?.users ??
    payload?.content ??
    [];
  const pagination = payload?.data?.pagination ?? payload?.pagination ?? {};

  return {
    users: Array.isArray(users) ? users : [],
    totalPages: Number(pagination.totalPages) || 0,
  };
}

async function fetchAllMembers(orgUnitId) {
  const members = [];

  for (let page = 0; page < MAX_PAGES_MEMBERS; page += 1) {
    const payload = await callApi(ORG_UNIT_USERS_PATH, {
      method: 'POST',
      body: {
        filter: { orgUnitId, userId: '', saleId: '', name: '', phone: '', roleName: '' },
        page,
        size: PAGE_SIZE_MEMBERS,
      },
    });
    const { users, totalPages } = extractUsersPage(payload);

    members.push(...users);

    if (users.length === 0) break;
    if (totalPages && page + 1 >= totalPages) break;
    if (users.length < PAGE_SIZE_MEMBERS) break;

    await sleep(DELAY_MS);
  }

  return members;
}

// Chi can biet CO don hay khong (khong can lay het), nen xin size=1 cho nhanh/nhe.
async function hasDisbursedRevenue(saleId) {
  const targetSaleId = normalizeSaleId(saleId);

  if (!targetSaleId) return false;

  const payload = await callApi(SEARCH_DISBURSED_PATH, {
    method: 'POST',
    body: { filter: { month: MONTH, year: YEAR, saleId: targetSaleId }, page: 0, size: 1 },
  });
  const data = payload?.data ?? payload;
  const totalElements = Number(data?.pagination?.totalElements) || 0;

  return totalElements > 0;
}

async function main() {
  if (!TOKEN) {
    console.error('Chua dien TOKEN trong run.js. Dan Bearer token vao bien TOKEN roi chay lai.');
    process.exitCode = 1;
    return;
  }

  console.log(`Dang tim Team Lead vua co doanh so ca nhan vua co doanh so team, thang ${MONTH}/${YEAR}...\n`);

  const orgUnits = extractOrgUnits(await callApi(ORG_UNITS_PATH));
  const manageOrgs = orgUnits.filter((org) => org?.type === ORG_MANAGE_TYPE);

  console.log(
    `Tim thay ${manageOrgs.length} don vi ${ORG_MANAGE_TYPE} (team).\n--- PHA 1: loc lead co doanh so ca nhan ---\n`
  );

  const candidateTeams = [];

  for (let i = 0; i < manageOrgs.length; i += 1) {
    const org = manageOrgs[i];
    const label = `[${i + 1}/${manageOrgs.length}] ${org.name || org.code || org.id}`;

    try {
      const members = await fetchAllMembers(org.id);
      const lead = members.find((member) =>
        LEAD_ROLE_NAMES.includes(
          String(member?.roleName ?? '')
            .trim()
            .toLowerCase()
        )
      );

      if (!lead || !lead.saleId) {
        console.log(`${label} -> khong co lead/BM ro rang, bo qua.`);
        await sleep(DELAY_MS);
        continue;
      }

      await sleep(DELAY_MS);

      const leadHasRevenue = await hasDisbursedRevenue(lead.saleId);

      console.log(
        `${label} -> lead ${lead.name} (${lead.saleId}) - doanh so ca nhan: ${leadHasRevenue ? 'CO' : 'khong'}`
      );

      if (leadHasRevenue) {
        candidateTeams.push({ org, lead, members });
      }
    } catch (error) {
      console.log(`${label} -> LOI: ${error.message}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(
    `\nPha 1 xong: ${candidateTeams.length} team co lead/BM co doanh so ca nhan.\n--- PHA 2: kiem tra doanh so team ---\n`
  );

  for (const candidate of candidateTeams) {
    const { org, lead, members } = candidate;
    const otherMembers = members.filter((member) => normalizeSaleId(member.saleId) !== normalizeSaleId(lead.saleId));
    const toCheck = otherMembers.slice(0, MAX_MEMBERS_TO_CHECK_PER_TEAM);

    console.log(
      `Kiem tra team "${org.name || org.id}" (lead ${lead.name}, ${toCheck.length}/${otherMembers.length} thanh vien se kiem tra)...`
    );

    for (const member of toCheck) {
      if (!member.saleId) continue;

      try {
        const memberHasRevenue = await hasDisbursedRevenue(member.saleId);

        if (memberHasRevenue) {
          console.log(`\n===== TIM THAY =====`);
          console.log(`Team: ${org.name || org.id} (orgUnitId: ${org.id})`);
          console.log(
            `Lead/BM: ${lead.name} | Mã sale: ${lead.saleId} | SĐT: ${lead.phoneNumber || lead.phone || '--'} | userId: ${lead.userId || lead.id || '--'}`
          );
          console.log(`Thành viên có đơn: ${member.name} | Mã sale: ${member.saleId}`);
          console.log(`\n=> Dung lead nay de xuat file doi soat (vua co doanh so ca nhan, vua co doanh so team).`);
          return;
        }
      } catch (error) {
        console.log(`  Lỗi kiểm tra ${member.saleId}: ${error.message}`);
      }

      await sleep(DELAY_MS);
    }

    console.log(`  -> Team nay khong co thanh vien nao co don trong ${toCheck.length} nguoi da kiem tra.\n`);
  }

  console.log(
    '\nKhong tim thay team nao thoa dieu kien (lead co doanh so ca nhan VA team co doanh so) trong pham vi da quet.'
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
