import { memo, useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import EmptyState from '../common/EmptyState.jsx';
import ErrorState from '../common/ErrorState.jsx';
import LoadingState from '../common/LoadingState.jsx';
import { useTheme } from '../../hooks/useTheme.js';
import { formatDateTime } from '../../utils/date.js';
import { formatNumber, formatVndCompact } from '../../utils/formatNumber.js';

function normalizeSearchText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function KpiOverviewModal({
  open,
  data = [],
  status = 'ready',
  title,
  description,
  metricLabel,
  dataKey = 'value',
  valueFormatter = formatNumber,
  yAxisLabel = 'Số đơn',
  loans = null,
  onClose,
}) {
  const { isDark } = useTheme();
  const [viewMode, setViewMode] = useState('chart');
  const [searchValue, setSearchValue] = useState('');
  const canDrillDown = Array.isArray(loans);

  useEffect(() => {
    if (open) {
      setViewMode('chart');
      setSearchValue('');
    }
  }, [open]);

  const filteredLoans = useMemo(() => {
    if (!canDrillDown) return [];

    const keyword = normalizeSearchText(searchValue);

    if (!keyword) return loans;

    return loans.filter((loan) => {
      const searchableText = [loan.loanId, loan.id, loan.ownerSaleId].map(normalizeSearchText).join(' ');

      return searchableText.includes(keyword);
    });
  }, [loans, searchValue, canDrillDown]);

  if (!open) return null;

  const isLoading = status === 'loading';
  const isError = status === 'error';
  const isEmpty = !isLoading && !isError && data.length === 0;
  const tooltipFormatter = (value) => [valueFormatter(value), metricLabel];
  const gridStroke = isDark ? '#2a2a2a' : '#e7edf6';
  const tickFill = isDark ? '#93a3bd' : '#90a1bb';
  const pointLabelFill = isDark ? '#f1f5f9' : '#111827';

  function renderPointLabel({ x, y, value }) {
    return (
      <text x={x} y={y - 12} textAnchor="middle" fill={pointLabelFill} fontSize={12} fontWeight={700}>
        {valueFormatter(value)}
      </text>
    );
  }

  return (
    <div className="top-team-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="top-team-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kpi-overview-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="top-team-modal-header">
          <div>
            <h2 id="kpi-overview-title">{title}</h2>
            <p>{description}</p>
          </div>
          <div className="top-team-modal-header-actions">
            {canDrillDown ? (
              <div className="kpi-overview-view-toggle" role="tablist">
                <button
                  className={`kpi-overview-view-tab${viewMode === 'chart' ? ' is-active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'chart'}
                  onClick={() => setViewMode('chart')}
                >
                  Biểu đồ
                </button>
                <button
                  className={`kpi-overview-view-tab${viewMode === 'list' ? ' is-active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'list'}
                  onClick={() => setViewMode('list')}
                >
                  Danh sách đơn ({loans.length.toLocaleString('vi-VN')})
                </button>
              </div>
            ) : null}
            <button className="top-team-modal-close" type="button" onClick={onClose} aria-label="Đóng modal">
              ×
            </button>
          </div>
        </div>

        {viewMode === 'chart' ? (
          <div className="kpi-overview-chart-wrap">
            {isLoading ? (
              <LoadingState className="chart-state top-team-modal-state" text="Đang tải dữ liệu..." />
            ) : null}

            {isError ? (
              <ErrorState className="chart-state top-team-modal-state" text="Không tải được dữ liệu" />
            ) : null}

            {isEmpty ? <EmptyState className="chart-state top-team-modal-state" text="Chưa có dữ liệu" /> : null}

            {!isLoading && !isError && !isEmpty ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 28, right: 24, bottom: 0, left: 4 }}>
                  <CartesianGrid stroke={gridStroke} strokeOpacity={0.55} vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: tickFill, fontSize: 12 }} />
                  <YAxis
                    allowDecimals={false}
                    domain={[0, (dataMax) => Math.ceil(dataMax * 1.15)]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: tickFill, fontSize: 12 }}
                    tickFormatter={valueFormatter}
                    label={{ value: yAxisLabel, angle: -90, position: 'insideLeft', fill: tickFill, fontSize: 12 }}
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
                    dataKey={dataKey}
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

        {viewMode === 'list' && canDrillDown ? (
          <>
            <div className="top-team-modal-toolbar">
              <input
                type="search"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Tìm theo mã đơn hoặc mã sale..."
                aria-label="Tìm kiếm"
              />
            </div>

            {loans.length === 0 ? (
              <EmptyState className="chart-state top-team-modal-state" text="Không có đơn nào trong kỳ đã chọn" />
            ) : null}

            {loans.length > 0 && filteredLoans.length === 0 ? (
              <EmptyState className="chart-state top-team-modal-state" text="Không tìm thấy đơn phù hợp" />
            ) : null}

            {filteredLoans.length > 0 ? (
              <div className="top-team-table-wrap">
                <table className="kpi-loan-table">
                  <thead>
                    <tr>
                      <th>Mã đơn</th>
                      <th>Mã sale</th>
                      <th>Trạng thái</th>
                      <th>Số tiền</th>
                      <th>Ngày tạo</th>
                      <th>Cập nhật gần nhất</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLoans.map((loan, index) => (
                      <tr key={loan.loanId || loan.id || index}>
                        <td>
                          <strong>{loan.loanId || loan.id || '--'}</strong>
                        </td>
                        <td>{loan.ownerSaleId || '--'}</td>
                        <td>{loan.status || '--'}</td>
                        <td>{formatVndCompact(loan.approvedAmount)}</td>
                        <td>{formatDateTime(loan.createdAt)}</td>
                        <td>{formatDateTime(loan.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}

export default memo(KpiOverviewModal);
