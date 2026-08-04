import { memo, useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import EmptyState from '../common/EmptyState.jsx';
import ErrorState from '../common/ErrorState.jsx';
import LoadingState from '../common/LoadingState.jsx';
import { useTheme } from '../../hooks/useTheme.js';
import { formatVndCompact } from '../../utils/formatNumber.js';

function formatVndExact(value) {
  return `${Math.round(Number(value) || 0).toLocaleString('vi-VN')} đ`;
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

const ROLE_LABELS = {
  Employee: 'Nhân viên',
  Lead: 'Quản lý',
};

function CommissionDetailModal({ open, onClose, breakdown = [], status = 'ready', monthlyData = [] }) {
  const { isDark } = useTheme();
  const [searchValue, setSearchValue] = useState('');
  const [viewMode, setViewMode] = useState('table');

  useEffect(() => {
    if (open) {
      setViewMode('table');
      setSearchValue('');
    }
  }, [open]);

  const filteredBreakdown = useMemo(() => {
    const keyword = normalizeSearchText(searchValue);

    if (!keyword) return breakdown;

    return breakdown.filter((item) => {
      const searchableText = [item.saleId, item.fullName].map(normalizeSearchText).join(' ');

      return searchableText.includes(keyword);
    });
  }, [breakdown, searchValue]);

  if (!open) return null;

  const isLoading = status === 'loading';
  const isError = status === 'error';
  const totalCommission = breakdown.reduce((sum, item) => sum + item.commission, 0);
  const isChartEmpty = !isLoading && !isError && monthlyData.length === 0;
  const tooltipFormatter = (value) => [formatVndCompact(value), 'Hoa hồng'];
  const gridStroke = isDark ? '#2a2a2a' : '#e7edf6';
  const tickFill = isDark ? '#93a3bd' : '#90a1bb';
  const pointLabelFill = isDark ? '#f1f5f9' : '#111827';

  function renderPointLabel({ x, y, value }) {
    return (
      <text x={x} y={y - 12} textAnchor="middle" fill={pointLabelFill} fontSize={12} fontWeight={700}>
        {formatVndCompact(value)}
      </text>
    );
  }

  return (
    <div className="top-team-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="top-team-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="commission-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="top-team-modal-header">
          <div>
            <h2 id="commission-modal-title">Chi tiết hoa hồng theo CTV</h2>
            <p>
              Ước tính theo rule hoa hồng hiện hành, tính trên đơn giải ngân (CLOSED)
              {!isLoading && !isError ? ` • Tổng kỳ đang chọn: ${formatVndCompact(totalCommission)}` : ''}
            </p>
          </div>
          <div className="top-team-modal-header-actions">
            <div className="kpi-overview-view-toggle" role="tablist">
              <button
                className={`kpi-overview-view-tab${viewMode === 'table' ? ' is-active' : ''}`}
                type="button"
                role="tab"
                aria-selected={viewMode === 'table'}
                onClick={() => setViewMode('table')}
              >
                Chi tiết theo CTV
              </button>
              <button
                className={`kpi-overview-view-tab${viewMode === 'chart' ? ' is-active' : ''}`}
                type="button"
                role="tab"
                aria-selected={viewMode === 'chart'}
                onClick={() => setViewMode('chart')}
              >
                Xu hướng theo tháng
              </button>
            </div>
            <button className="top-team-modal-close" type="button" onClick={onClose} aria-label="Đóng modal">
              ×
            </button>
          </div>
        </div>

        {viewMode === 'table' ? (
          <>
            {!isLoading && !isError ? (
              <div className="top-team-modal-toolbar">
                <input
                  type="search"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Tìm theo mã sale hoặc tên..."
                  aria-label="Tìm kiếm"
                />
              </div>
            ) : null}

            {isLoading ? <LoadingState className="chart-state top-team-modal-state" text="Đang tính hoa hồng..." /> : null}

            {isError ? (
              <ErrorState
                className="chart-state top-team-modal-state"
                text="Chưa đủ dữ liệu đơn vay/user/team để tính hoa hồng. Vui lòng thử làm mới dữ liệu."
              />
            ) : null}

            {!isLoading && !isError && breakdown.length === 0 ? (
              <EmptyState className="chart-state top-team-modal-state" text="Chưa có ai phát sinh hoa hồng trong kỳ đã chọn" />
            ) : null}

            {!isLoading && !isError && breakdown.length > 0 && filteredBreakdown.length === 0 ? (
              <EmptyState className="chart-state top-team-modal-state" text="Không tìm thấy CTV phù hợp" />
            ) : null}

            {!isLoading && !isError && filteredBreakdown.length > 0 ? (
              <div className="top-team-table-wrap">
                <table className="commission-table">
                  <thead>
                    <tr>
                      <th>Mã Sale</th>
                      <th>Họ tên</th>
                      <th>Vai trò</th>
                      <th>Doanh số cá nhân</th>
                      <th>Doanh số nhóm</th>
                      <th>Hoa hồng ước tính</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBreakdown.map((item) => (
                      <tr key={item.saleId}>
                        <td>
                          <strong>{item.saleId}</strong>
                        </td>
                        <td>{item.fullName || '--'}</td>
                        <td>{ROLE_LABELS[item.role] || item.role}</td>
                        <td>{formatVndExact(item.disbursementAmount)}</td>
                        <td>{item.role === 'Lead' ? formatVndExact(item.teamDisbursementAmount) : '--'}</td>
                        <td>{formatVndExact(item.commission)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : null}

        {viewMode === 'chart' ? (
          <div className="kpi-overview-chart-wrap">
            {isLoading ? (
              <LoadingState className="chart-state top-team-modal-state" text="Đang tính hoa hồng..." />
            ) : null}

            {isError ? (
              <ErrorState className="chart-state top-team-modal-state" text="Không tải được dữ liệu" />
            ) : null}

            {isChartEmpty ? <EmptyState className="chart-state top-team-modal-state" text="Chưa có dữ liệu" /> : null}

            {!isLoading && !isError && !isChartEmpty ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyData} margin={{ top: 28, right: 24, bottom: 0, left: 4 }}>
                  <CartesianGrid stroke={gridStroke} strokeOpacity={0.55} vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: tickFill, fontSize: 12 }} />
                  <YAxis
                    allowDecimals={false}
                    domain={[0, (dataMax) => Math.ceil(dataMax * 1.15)]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: tickFill, fontSize: 12 }}
                    tickFormatter={formatVndCompact}
                    label={{ value: 'Hoa hồng', angle: -90, position: 'insideLeft', fill: tickFill, fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={tooltipFormatter}
                    contentStyle={{
                      border: `1px solid ${isDark ? '#333333' : '#dce7f5'}`,
                      borderRadius: 12,
                      background: isDark ? '#1a1a1a' : '#ffffff',
                      boxShadow: isDark ? '0 12px 30px rgba(0, 0, 0, 0.45)' : '0 12px 30px rgba(15, 23, 42, 0.12)',
                    }}
                    labelStyle={{ color: isDark ? '#f1f5f9' : '#111827' }}
                    itemStyle={{ color: isDark ? '#dbe4f3' : '#1f2937' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="commissionAmount"
                    stroke={isDark ? '#60a5fa' : '#2563eb'}
                    strokeWidth={3}
                    dot={{ r: 4 }}
                    label={renderPointLabel}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default memo(CommissionDetailModal);
