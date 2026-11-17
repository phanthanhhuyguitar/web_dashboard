// Cong thuc tinh hoa hong doi soat - lay nguyen theo cau hinh that nguoi dung cung cap:
//
// {"member":{"personal":{"tiers":[{"from":0,"to":150000000,"rate":0.02},{"from":150000000,"rate":0.022}]}},
//  "lead":{"personal":{"tiers":[{"from":0,"to":150000000,"rate":0.02},{"from":150000000,"rate":0.022}]},
//          "team":{"tiers":[{"from":200000000,"to":500000000,"rate":0.005},
//                            {"from":500000000,"to":1000000000,"rate":0.007},
//                            {"from":1000000000,"rate":0.008}],
//                   "revenueSource":["MEMBERS"]}}}
//
// - member.personal / lead.personal: hoa hong tren DSGN CA NHAN, tinh luy tien theo tung bac
//   (vd 70,510,000 ca nhan -> nam het trong bac 0-150tr -> 70,510,000 * 2% = 1,410,200, dung khop
//   file mau "ctv.pdf").
// - lead.team: "quy hoa hong team" tinh luy tien tren TONG doanh so ca team (cong tat ca thanh
//   vien, khong tinh doanh so cua chinh lead - xem revenueSource: MEMBERS), sau do chia lai cho
//   tung thanh vien theo ty trong dong gop doanh so cua ho trong tong team. Da verify khop file
//   mau "file teamlead.pdf": tong team 271,310,000 nam tron trong bac 200tr-500tr (0.5%) nen moi
//   dong = doanh so rieng * 0.5% (vd Vo Phi Cat 70,510,000 * 0.5% = 352,550, dung khop).
export const COMMISSION_FORMULA = {
  member: {
    personal: {
      tiers: [
        { from: 0, to: 150000000, rate: 0.02 },
        { from: 150000000, rate: 0.022 },
      ],
    },
  },
  lead: {
    personal: {
      tiers: [
        { from: 0, to: 150000000, rate: 0.02 },
        { from: 150000000, rate: 0.022 },
      ],
    },
    team: {
      tiers: [
        { from: 200000000, to: 500000000, rate: 0.005 },
        { from: 500000000, to: 1000000000, rate: 0.007 },
        { from: 1000000000, rate: 0.008 },
      ],
      revenueSource: ['MEMBERS'],
    },
  },
};

// Tim rate cua bac [from, to) chua "amount" (khong nhan san voi amount) - dung khi can tach rieng
// rate ra de ap cho tung dong con (vd tung don vay rieng le cua 1 CTV) thay vi chi ra 1 tong duy
// nhat. Bac khong co "to" nghia la khong gioi han tren. Amount nho hon "from" cua bac thap nhat
// (vd duoi 200tr o lead.team) thi khong khop bac nao -> rate = 0.
export function getRateForAmount(amount, tiers) {
  const safeAmount = Number(amount) || 0;

  if (safeAmount <= 0 || !Array.isArray(tiers) || tiers.length === 0) return 0;

  const matchedTier = tiers.find((tier) => {
    const from = Number(tier?.from) || 0;
    const to = tier?.to === undefined || tier?.to === null ? Infinity : Number(tier.to);

    return safeAmount >= from && safeAmount < to;
  });

  return matchedTier ? Number(matchedTier.rate) || 0 : 0;
}

// Tim bac [from, to) chua "amount", ap THANG rate cua bac do cho TOAN BO so tien (khong phai
// luy tien tung bac kieu thue thu nhap). Da xac nhan qua file mau "file teamlead.pdf": tong doanh
// so team 271,310,000 nam trong bac 200tr-500tr (rate 0.5%) -> hoa hong = 271,310,000 * 0.5% =
// 1,356,550 (dung bang tong cot "Thu nhap" trong file mau), KHONG PHAI (271,310,000-200,000,000)
// * 0.5% hay cong don tung bac.
export function calculateTieredAmount(amount, tiers) {
  const safeAmount = Number(amount) || 0;

  return safeAmount * getRateForAmount(safeAmount, tiers);
}

export function calculateMemberPersonalCommission(revenue) {
  return calculateTieredAmount(revenue, COMMISSION_FORMULA.member.personal.tiers);
}

export function calculateLeadPersonalCommission(revenue) {
  return calculateTieredAmount(revenue, COMMISSION_FORMULA.lead.personal.tiers);
}

// Rate ca nhan (CTV thuong) ung voi TONG doanh so ca ky - dung de ap cho tung don rieng le trong
// file preview (moi don = so tien don do * rate nay), thay vi chi tinh ra 1 tong duy nhat.
export function getMemberPersonalRate(totalRevenue) {
  return getRateForAmount(totalRevenue, COMMISSION_FORMULA.member.personal.tiers);
}

export function getLeadPersonalRate(totalRevenue) {
  return getRateForAmount(totalRevenue, COMMISSION_FORMULA.lead.personal.tiers);
}

// "Quy" hoa hong cua ca team, tinh luy tien tren tong doanh so cac THANH VIEN (khong gom doanh so
// rieng cua lead - dung theo revenueSource: MEMBERS).
export function calculateTeamCommissionPool(teamRevenue) {
  return calculateTieredAmount(teamRevenue, COMMISSION_FORMULA.lead.team.tiers);
}

// Thue TNCN: theo yeu cau nguoi dung - tong thu nhap (hoa hong) tu 2,000,000d tro len thi khau
// tru 10% TREN TOAN BO thu nhap (khong phai chi tren phan vuot 2tr) - dung quy uoc khau tru 10%
// cho ca nhan khong ky HDLD/HDLD duoi 3 thang theo Thong tu 111/2013/TT-BTC (chi tra tu 2tr/lan
// tro len moi khau tru). Duoi 2,000,000d thi khong tinh thue.
const PIT_THRESHOLD = 2000000;
const PIT_RATE = 0.1;

export function calculatePersonalIncomeTax(totalIncome) {
  const safeIncome = Number(totalIncome) || 0;

  if (safeIncome < PIT_THRESHOLD) return 0;

  return Math.round(safeIncome * PIT_RATE);
}

export function calculateNetIncome(totalIncome) {
  const safeIncome = Number(totalIncome) || 0;

  return safeIncome - calculatePersonalIncomeTax(safeIncome);
}

// Chia lai "quy" hoa hong team cho tung thanh vien theo ty trong doanh so dong gop. members:
// [{ key, revenue }]. Tra ve Map(key -> hoa hong duoc chia), da lam tron so cuoi cung de tong cac
// phan chia khop chinh xac voi quy (tranh lech lam tron o dong cuoi).
export function allocateTeamCommission(members) {
  const safeMembers = Array.isArray(members) ? members.filter((member) => (Number(member?.revenue) || 0) > 0) : [];
  const teamRevenue = safeMembers.reduce((sum, member) => sum + (Number(member.revenue) || 0), 0);
  const pool = calculateTeamCommissionPool(teamRevenue);
  const result = new Map();

  if (teamRevenue <= 0 || pool <= 0 || safeMembers.length === 0) {
    safeMembers.forEach((member) => result.set(member.key, 0));
    return result;
  }

  let allocated = 0;

  safeMembers.forEach((member, index) => {
    const isLast = index === safeMembers.length - 1;
    const share = isLast ? pool - allocated : Math.round((pool * (Number(member.revenue) || 0)) / teamRevenue);

    result.set(member.key, share);
    allocated += share;
  });

  return result;
}
