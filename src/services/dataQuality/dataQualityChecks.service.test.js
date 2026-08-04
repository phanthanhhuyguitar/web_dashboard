import { describe, expect, it } from 'vitest';

import { runDataQualityChecks } from './dataQualityChecks.service.js';

function getCheck(results, id) {
  return results.find((check) => check.id === id);
}

describe('runDataQualityChecks', () => {
  it('tra ve du 6 check, moi check count = 0 khi du lieu sach', () => {
    const users = [{ saleId: 'CTV001', createdAt: '2026-06-01' }];
    const loans = [{ loanId: 'L1', ownerSaleId: 'CTV001', createdAt: '2026-06-01', updatedAt: '2026-06-02' }];
    const teams = [{ orgUnitId: 'ORG1', teamName: 'Team A', lead: { saleId: 'CTV001' } }];

    const results = runDataQualityChecks({ loans, users, teams, syncFreshness: null });

    expect(results).toHaveLength(6);
    expect(results.every((check) => check.count === 0)).toBe(true);
  });

  it('loans-orphaned: don co ownerSaleId khong khop user nao thi bi tinh la loi', () => {
    const users = [{ saleId: 'CTV001' }];
    const loans = [{ loanId: 'L1', ownerSaleId: 'CTV999' }];

    const results = runDataQualityChecks({ loans, users, teams: [] });
    const check = getCheck(results, 'loans-orphaned');

    expect(check.count).toBe(1);
    expect(check.severity).toBe('error');
  });

  it('loans-orphaned: ownerSaleId khop user sau khi bo tien to DR thi khong tinh la loi', () => {
    const users = [{ saleId: 'CTV001' }];
    const loans = [{ loanId: 'L1', ownerSaleId: 'DRCTV001' }];

    const results = runDataQualityChecks({ loans, users, teams: [] });

    expect(getCheck(results, 'loans-orphaned').count).toBe(0);
  });

  it('loans-without-owner: ownerSaleId rong duoc tinh rieng, khong lan sang loans-orphaned', () => {
    const users = [{ saleId: 'CTV001' }];
    const loans = [{ loanId: 'L1', ownerSaleId: '' }];

    const results = runDataQualityChecks({ loans, users, teams: [] });

    expect(getCheck(results, 'loans-without-owner').count).toBe(1);
    expect(getCheck(results, 'loans-without-owner').severity).toBe('info');
    expect(getCheck(results, 'loans-orphaned').count).toBe(0);
  });

  it('invalid-dates: ngay khong doc duoc (loan hoac user) bi tinh la loi', () => {
    const users = [{ saleId: 'CTV001', createdAt: 'khong-phai-ngay' }];
    const loans = [
      { loanId: 'L1', ownerSaleId: 'CTV001', createdAt: 'abc', updatedAt: '2026-06-01' },
      { loanId: 'L2', ownerSaleId: 'CTV001', createdAt: '2026-06-01', updatedAt: 'xyz' },
    ];

    const results = runDataQualityChecks({ loans, users, teams: [] });
    const check = getCheck(results, 'invalid-dates');

    expect(check.count).toBe(3); // 1 loan.createdAt + 1 loan.updatedAt + 1 user.createdAt
    expect(check.severity).toBe('error');
  });

  it('team-structure: team khong co lead.saleId thi bi tinh la loi', () => {
    const teams = [{ orgUnitId: 'ORG1', teamName: 'Team A', lead: null }];

    const results = runDataQualityChecks({ loans: [], users: [], teams });
    const check = getCheck(results, 'team-structure');

    expect(check.count).toBe(1);
    expect(check.samples[0].detail).toBe('Không có quản lý');
  });

  it('team-structure: lead.saleId khong ton tai trong danh sach user thi bi tinh la loi', () => {
    const teams = [{ orgUnitId: 'ORG1', teamName: 'Team A', lead: { saleId: 'CTV999' } }];
    const users = [{ saleId: 'CTV001' }];

    const results = runDataQualityChecks({ loans: [], users, teams });
    const check = getCheck(results, 'team-structure');

    expect(check.count).toBe(1);
    expect(check.samples[0].detail).toContain('CTV999');
  });

  it('users-missing-sale-id: user khong co field saleId thi bi tinh la canh bao', () => {
    const users = [{ fullName: 'Nguyen Van A', referralCode: 'DRABC' }];

    const results = runDataQualityChecks({ loans: [], users, teams: [] });
    const check = getCheck(results, 'users-missing-sale-id');

    expect(check.count).toBe(1);
    expect(check.severity).toBe('warning');
  });

  it('sync-freshness: khong co du lieu freshness thi tra ve info, count 0', () => {
    const results = runDataQualityChecks({ loans: [], users: [], teams: [], syncFreshness: null });
    const check = getCheck(results, 'sync-freshness');

    expect(check.severity).toBe('info');
    expect(check.count).toBe(0);
  });

  it('sync-freshness: file dong bo qua cu (qua staleDays mac dinh 7 ngay) thi bi canh bao', () => {
    const staleDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const freshFreshness = {
      userDetail: { exists: true, lastModifiedAt: staleDate },
      loan: { exists: true, lastModifiedAt: new Date().toISOString() },
    };

    const results = runDataQualityChecks({ loans: [], users: [], teams: [], syncFreshness: freshFreshness });
    const check = getCheck(results, 'sync-freshness');

    expect(check.count).toBe(1); // chi userDetail qua cu, loan van moi
    expect(check.severity).toBe('warning');
  });

  it('sap xep ket qua theo do nghiem trong: error truoc warning truoc info', () => {
    const users = [{ fullName: 'X' }]; // warning: users-missing-sale-id
    const loans = [{ loanId: 'L1', ownerSaleId: 'CTV999' }]; // error: loans-orphaned

    const results = runDataQualityChecks({ loans, users, teams: [] });
    const severities = results.map((check) => check.severity);
    const errorIndex = severities.indexOf('error');
    const warningIndex = severities.indexOf('warning');
    const infoIndex = severities.indexOf('info');

    expect(errorIndex).toBeLessThan(warningIndex);
    expect(warningIndex).toBeLessThan(infoIndex);
  });
});
