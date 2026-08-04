// File cau hinh duy nhat cho rule tinh hoa hong - doi ty le/nguong chi can sua o day,
// khong dung vao logic tinh (commissionMetrics.service.js). Cac moc "minAmount" la nguong
// ">=", tier duoc chon la tier CAO NHAT co minAmount <= so tien dang xet (khong luy tien).
export const COMMISSION_RULES = {
  // saleId bat dau bang tien to nay (khong phan biet hoa/thuong) thuoc "nhom CGY".
  // Moi saleId khac (CTV, DCH, hoac khong co tien to) deu roi vao nhom con lai.
  cgyPrefix: 'CGY',

  // Nhom KHONG phai CGY, role Employee: % tren doanh so ca nhan (toan bo theo 1 muc).
  employeeTiers: [
    { minAmount: 0, rate: 0.02 },
    { minAmount: 150_000_000, rate: 0.022 },
  ],

  // Nhom KHONG phai CGY, role Lead - phan (1): % tren doanh so CA NHOM (khong tinh doanh so
  // cua chinh Lead), toan bo theo 1 muc. Duoi 200tr = khong co hoa hong phan nay (rate 0).
  leadTeamTiers: [
    { minAmount: 200_000_000, rate: 0.005 },
    { minAmount: 500_000_000, rate: 0.007 },
    { minAmount: 1_000_000_000, rate: 0.008 },
  ],

  // Nhom CGY, role Employee: % flat tren doanh so ca nhan, khong chia muc.
  cgyEmployeeRate: 0.01,

  // Nhom CGY, role Lead: % flat tren (doanh so ca nhom + doanh so ca nhan cua chinh Lead).
  cgyLeadRate: 0.02,
};
