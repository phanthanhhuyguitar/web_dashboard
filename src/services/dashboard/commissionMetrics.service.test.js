import { describe, expect, it } from 'vitest';

import { calculateCommissionMetrics } from './commissionMetrics.service.js';

const RANGE = { fromDate: '2026-06-01', toDate: '2026-06-30' };

function makeLoan({ status = 'CLOSED', ownerSaleId, approvedAmount = 0, updatedAt = '2026-06-15', createdAt = '2026-06-15' }) {
  return { status, ownerSaleId, approvedAmount, updatedAt, createdAt };
}

function makeUser({ saleId, status = 'ACTIVE', fullName = '' }) {
  return { saleId, status, fullName };
}

describe('calculateCommissionMetrics', () => {
  it('tra ve 0 khi thieu range', () => {
    expect(calculateCommissionMetrics({ loans: [], users: [], teams: [] })).toEqual({
      totalCommission: 0,
      breakdown: [],
    });
  });

  it('Employee non-CGY tier 1 (< 150tr): rate 0.02', () => {
    const loans = [makeLoan({ ownerSaleId: 'CTV001', approvedAmount: 100_000_000 })];
    const users = [makeUser({ saleId: 'CTV001' })];

    const { totalCommission, breakdown } = calculateCommissionMetrics({ loans, users, teams: [], range: RANGE });

    expect(totalCommission).toBe(2_000_000);
    expect(breakdown[0]).toMatchObject({ saleId: 'CTV001', role: 'Employee', commission: 2_000_000 });
  });

  it('Employee non-CGY tier 2 (>= 150tr): rate 0.022', () => {
    const loans = [makeLoan({ ownerSaleId: 'CTV002', approvedAmount: 200_000_000 })];
    const users = [makeUser({ saleId: 'CTV002' })];

    const { totalCommission } = calculateCommissionMetrics({ loans, users, teams: [], range: RANGE });

    expect(totalCommission).toBe(4_400_000);
  });

  it('chi tinh don CLOSED - don o trang thai khac bi bo qua hoan toan (khong duoc cong don vao doanh so)', () => {
    const loans = [
      makeLoan({ ownerSaleId: 'CTV003', approvedAmount: 100_000_000, status: 'CLOSED' }),
      makeLoan({ ownerSaleId: 'CTV003', approvedAmount: 500_000_000, status: 'APPROVAL' }),
    ];
    const users = [makeUser({ saleId: 'CTV003' })];

    const { breakdown } = calculateCommissionMetrics({ loans, users, teams: [], range: RANGE });

    expect(breakdown[0].disbursementAmount).toBe(100_000_000);
  });

  it('loc theo ngay CLOSED (updatedAt), khong phai ngay tao don (createdAt)', () => {
    const loans = [
      // Tao trong ky nhung CLOSED ngoai ky -> phai bi loai.
      makeLoan({ ownerSaleId: 'CTV004', approvedAmount: 100_000_000, createdAt: '2026-06-10', updatedAt: '2026-07-05' }),
      // Tao ngoai ky nhung CLOSED trong ky -> phai duoc tinh.
      makeLoan({ ownerSaleId: 'CTV004', approvedAmount: 50_000_000, createdAt: '2026-05-01', updatedAt: '2026-06-20' }),
    ];
    const users = [makeUser({ saleId: 'CTV004' })];

    const { breakdown } = calculateCommissionMetrics({ loans, users, teams: [], range: RANGE });

    expect(breakdown[0].disbursementAmount).toBe(50_000_000);
  });

  it('Nhom CGY dung rate flat, khong theo tier (bo qua nguong 150tr cua Employee thuong)', () => {
    const loans = [makeLoan({ ownerSaleId: 'CGY001', approvedAmount: 500_000_000 })];
    const users = [makeUser({ saleId: 'CGY001' })];

    const { totalCommission } = calculateCommissionMetrics({ loans, users, teams: [], range: RANGE });

    expect(totalCommission).toBe(5_000_000); // 500tr * 1% flat, khong phai 500tr * 2.2%
  });

  it('Lead: doanh so nhom = tong don CLOSED cua member ACTIVE, cong voi doanh so ca nhan Lead', () => {
    const teams = [{ orgUnitId: 'ORG1', lead: { saleId: 'LEAD1', name: 'Lead 1' }, users: [{ saleId: 'CTV1' }] }];
    const loans = [
      makeLoan({ ownerSaleId: 'CTV1', approvedAmount: 300_000_000 }),
      makeLoan({ ownerSaleId: 'LEAD1', approvedAmount: 50_000_000 }),
    ];
    const users = [makeUser({ saleId: 'CTV1' }), makeUser({ saleId: 'LEAD1' })];

    const { breakdown } = calculateCommissionMetrics({ loans, users, teams, range: RANGE });
    const leadRow = breakdown.find((item) => item.saleId === 'LEAD1');

    expect(leadRow.teamDisbursementAmount).toBe(300_000_000);
    // teamRate (300tr, tier 200tr-500tr) = 0.005 ; ownRate (50tr, tier < 150tr) = 0.02
    expect(leadRow.commission).toBe(300_000_000 * 0.005 + 50_000_000 * 0.02);
  });

  it('Rule 2: member khong ACTIVE thi khong duoc cong vao doanh so nhom cua Lead', () => {
    const teams = [{ orgUnitId: 'ORG1', lead: { saleId: 'LEAD2', name: 'Lead 2' }, users: [{ saleId: 'CTV2' }] }];
    const loans = [
      makeLoan({ ownerSaleId: 'CTV2', approvedAmount: 300_000_000 }),
      // Lead can co doanh so ca nhan de van xuat hien trong breakdown du team = 0.
      makeLoan({ ownerSaleId: 'LEAD2', approvedAmount: 10_000_000 }),
    ];
    const users = [makeUser({ saleId: 'CTV2', status: 'INACTIVE' }), makeUser({ saleId: 'LEAD2' })];

    const { breakdown } = calculateCommissionMetrics({ loans, users, teams, range: RANGE });
    const leadRow = breakdown.find((item) => item.saleId === 'LEAD2');

    expect(leadRow.teamDisbursementAmount).toBe(0);
  });

  it('Rule 1: chi tinh don CLOSED cua member sau ngay member do join dung team (neu co du lieu ngay join)', () => {
    const teams = [{ orgUnitId: 'ORG1', lead: { saleId: 'LEAD3', name: 'Lead 3' }, users: [{ saleId: 'CTV3' }] }];
    const loans = [
      makeLoan({ ownerSaleId: 'CTV3', approvedAmount: 100_000_000, updatedAt: '2026-06-01' }), // truoc ngay join
      makeLoan({ ownerSaleId: 'CTV3', approvedAmount: 200_000_000, updatedAt: '2026-06-20' }), // sau ngay join
    ];
    const users = [makeUser({ saleId: 'CTV3' }), makeUser({ saleId: 'LEAD3' })];
    const orgJoinInfoBySaleId = { CTV3: [{ orgId: 'ORG1', createdAt: '2026-06-15' }] };

    const { breakdown } = calculateCommissionMetrics({ loans, users, teams, orgJoinInfoBySaleId, range: RANGE });
    const leadRow = breakdown.find((item) => item.saleId === 'LEAD3');

    expect(leadRow.teamDisbursementAmount).toBe(200_000_000);
  });

  it('normalizeSaleId bo tien to DR de khop ownerSaleId cua don voi saleId cua user', () => {
    const loans = [makeLoan({ ownerSaleId: 'DRCTV005', approvedAmount: 100_000_000 })];
    const users = [makeUser({ saleId: 'CTV005' })];

    const { breakdown } = calculateCommissionMetrics({ loans, users, teams: [], range: RANGE });

    expect(breakdown).toHaveLength(1);
    expect(breakdown[0].saleId).toBe('CTV005');
  });
});
