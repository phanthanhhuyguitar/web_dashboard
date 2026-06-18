import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import DashboardNote from '../components/dashboard/DashboardNote.jsx';
import FunnelCard from '../components/dashboard/FunnelCard.jsx';
import KpiCard from '../components/dashboard/KpiCard.jsx';
import ProductPerformanceChart from '../components/dashboard/ProductPerformanceChart.jsx';
import ProductStructureCard from '../components/dashboard/ProductStructureCard.jsx';
import TopTeamCard from '../components/dashboard/TopTeamCard.jsx';
import TopTeamLeadCard from '../components/dashboard/TopTeamLeadCard.jsx';
import Sidebar from '../components/layout/Sidebar.jsx';
import Topbar from '../components/layout/Topbar.jsx';
import { DEFAULT_DASHBOARD_RANGE, DEFAULT_MONTH } from '../config/constants.js';
import { useDashboardData } from '../hooks/useDashboardData.js';
import { clearAccessToken } from '../utils/storage.js';

const monthOptions = [
  'Tháng 1',
  'Tháng 2',
  'Tháng 3',
  'Tháng 4',
  'Tháng 5',
  'Tháng 6',
  'Tháng 7',
  'Tháng 8',
  'Tháng 9',
  'Tháng 10',
  'Tháng 11',
  'Tháng 12',
];

function getYearOptions(selectedYear) {
  const currentYear = new Date().getFullYear();
  const years = new Set([selectedYear]);

  for (let year = currentYear - 3; year <= currentYear + 2; year++) {
    years.add(year);
  }

  return Array.from(years).sort((a, b) => b - a);
}

function formatDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}

function toDateValue(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

function getMonthDateRange(monthValue) {
  if (monthValue === DEFAULT_MONTH) {
    return DEFAULT_DASHBOARD_RANGE;
  }

  const [year, month] = monthValue.split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  return {
    fromDate: toDateValue(startDate),
    toDate: toDateValue(endDate),
  };
}

function getMonthRangeLabel(monthValue) {
  const { fromDate, toDate } = getMonthDateRange(monthValue);
  const startDate = new Date(`${fromDate}T00:00:00`);
  const endDate = new Date(`${toDate}T00:00:00`);
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const labelPrefix = monthValue === currentMonth ? 'Tháng này' : 'Tháng đã chọn';

  return `${labelPrefix}: ${formatDate(startDate)} - ${formatDate(endDate)}`;
}

function DashboardPage() {
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth] = useState(DEFAULT_MONTH);
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(Number(DEFAULT_MONTH.slice(0, 4)));
  const range = useMemo(() => getMonthDateRange(selectedMonth), [selectedMonth]);
  const {
    data: dashboardData,
    loading,
    refreshing,
    error,
    refresh,
  } = useDashboardData(range);

  const handleMonthSelect = (monthIndex) => {
    const month = String(monthIndex + 1).padStart(2, '0');

    setSelectedMonth(`${pickerYear}-${month}`);
    setIsMonthPickerOpen(false);
  };

  const handleLogout = () => {
    clearAccessToken();
    navigate('/login', { replace: true });
  };

  if (!dashboardData) {
    return (
      <div className="dashboard-loading">
        <span />
        <p>Đang tải dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <Sidebar />

      <div className="dashboard-main">
        <Topbar isRefreshing={loading || refreshing} onRefresh={refresh} onLogout={handleLogout} />

        <main className="dashboard-content">
          <div className="dashboard-heading-row">
            <div>
              <h1>Dashboard tổng quan</h1>
              <p>Theo dõi hiệu suất bán hàng, đơn vay, sản phẩm, đội ngũ và đối soát TNEX Partner.</p>
            </div>

            <div className="period-picker-wrap">
              <button
                className="period-picker"
                type="button"
                onClick={() => setIsMonthPickerOpen((current) => !current)}
                aria-expanded={isMonthPickerOpen}
                aria-haspopup="dialog"
              >
                <span>{getMonthRangeLabel(selectedMonth)}</span>
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="m5.5 7.5 4.5 4.5 4.5-4.5" />
                </svg>
              </button>

              {isMonthPickerOpen ? (
                <div className="month-picker-popover" role="dialog" aria-label="Chọn tháng dashboard">
                  <div className="month-picker-header">
                    <span>Chọn tháng</span>
                    <select
                      value={pickerYear}
                      onChange={(event) => setPickerYear(Number(event.target.value))}
                      aria-label="Chọn năm"
                    >
                      {getYearOptions(pickerYear).map((year) => (
                        <option value={year} key={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="month-picker-grid">
                    {monthOptions.map((label, index) => {
                      const monthValue = `${pickerYear}-${String(index + 1).padStart(2, '0')}`;
                      const isSelected = monthValue === selectedMonth;

                      return (
                        <button
                          className={`month-picker-option${isSelected ? ' is-selected' : ''}`}
                          type="button"
                          onClick={() => handleMonthSelect(index)}
                          key={label}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {error.loans ? <div className="dashboard-warning-note">{error.loans}</div> : null}
          {error.users ? <div className="dashboard-warning-note">{error.users}</div> : null}

          <section className="kpi-grid" aria-label="Dashboard KPI">
            {dashboardData.kpis.map((item) => (
              <KpiCard item={item} key={item.id} />
            ))}
          </section>

          <section className="dashboard-grid-primary">
            <ProductPerformanceChart data={dashboardData.performance} status={dashboardData.performanceStatus} />
            <ProductStructureCard
              metrics={dashboardData.productStructureMetrics}
              status={dashboardData.productStructureStatus}
            />
          </section>

          <section className="dashboard-grid-secondary">
            <FunnelCard data={dashboardData.funnel} status={dashboardData.funnelStatus} />
            <TopTeamLeadCard data={dashboardData.topCtvByRevenue} status={dashboardData.topCtvStatus} />
            <TopTeamCard data={dashboardData.topTeamsByDisbursement} status={dashboardData.topTeamStatus} />
          </section>

          <DashboardNote text={dashboardData.note} />
        </main>
      </div>
    </div>
  );
}

export default DashboardPage;
