import { memo, useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';

import ErrorState from '../common/ErrorState.jsx';
import LoadingState from '../common/LoadingState.jsx';
import { formatNumber, formatPercentRounded, formatVndCompact } from '../../utils/formatNumber.js';

const emptyMetrics = {
  consumerTotal: 0,
  mortgageTotal: 0,
  totalProductLoans: 0,
  consumerClosed: 0,
  mortgageClosed: 0,
  consumerRevenue: 0,
  mortgageRevenue: 0,
  totalRevenue: 0,
  consumerPercent: 0,
  mortgagePercent: 0,
};

function ProductStructureCard({ metrics = emptyMetrics, status = 'ready' }) {
  const isLoading = status === 'loading';
  const isError = status === 'error';
  const resolvedMetrics = metrics || emptyMetrics;
  const consumerPercent = formatPercentRounded(resolvedMetrics.consumerPercent);
  const totalPercent = resolvedMetrics.totalProductLoans > 0 ? '100%' : '0%';
  const donutData = useMemo(
    () => [
      { name: 'Vay tiêu dùng', value: resolvedMetrics.consumerTotal, color: '#2563eb' },
      { name: 'Vay trên dư nợ/BĐS', value: resolvedMetrics.mortgageTotal, color: '#f97316' },
    ],
    [resolvedMetrics.consumerTotal, resolvedMetrics.mortgageTotal]
  );

  return (
    <section className="dashboard-card structure-card">
      <div className="card-header">
        <h2>Cơ cấu sản phẩm</h2>
        <p>So sánh nhanh giữa Vay tiêu dùng và Vay trên dư nợ/BĐS trong kỳ hiện tại.</p>
      </div>

      {isLoading ? (
        <LoadingState className="chart-state structure-state" text="Đang tải dữ liệu cơ cấu sản phẩm..." />
      ) : null}
      {isError ? (
        <ErrorState className="chart-state structure-state" text="Không tải được dữ liệu cơ cấu sản phẩm" />
      ) : null}

      {!isLoading && !isError ? (
        <div className="structure-content">
          <div className="donut-column">
            <div className="donut-box">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    innerRadius="62%"
                    outerRadius="88%"
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                  >
                    {donutData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-center">
                <strong>{consumerPercent}</strong>
                <span>Vay tiêu dùng</span>
              </div>
            </div>

            <div className="structure-legends">
              <div className="structure-legend">
                <span style={{ background: '#2563eb' }} />
                <p>
                  Vay tiêu dùng: <strong>{formatNumber(resolvedMetrics.consumerTotal)} đơn</strong>
                </p>
              </div>
              <div className="structure-legend">
                <span style={{ background: '#f97316' }} />
                <p>
                  Vay trên dư nợ/BĐS: <strong>{formatNumber(resolvedMetrics.mortgageTotal)} đơn</strong>
                </p>
              </div>
            </div>
          </div>

          <div className="structure-detail">
            <div className="structure-summary-grid">
              <article className="structure-summary summary-blue">
                <h3>Vay tiêu dùng</h3>
                <p>Volume đơn lớn, xử lý nhanh theo funnel.</p>
                <strong>{formatNumber(resolvedMetrics.consumerTotal)}</strong>
                <span>Tổng đơn • Giải ngân {formatNumber(resolvedMetrics.consumerClosed)}</span>
              </article>
              <article className="structure-summary summary-orange">
                <h3>Vay trên dư nợ/BĐS</h3>
                <p>Ticket size cao, cần theo dõi chất lượng lead.</p>
                <strong>{formatNumber(resolvedMetrics.mortgageTotal)}</strong>
                <span>Tổng đơn • Giải ngân {formatNumber(resolvedMetrics.mortgageClosed)}</span>
              </article>
            </div>

            <table className="structure-table">
              <thead>
                <tr>
                  <th>Chỉ số</th>
                  <th>Tiêu dùng</th>
                  <th>Dư nợ/BĐS</th>
                  <th>Tổng</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Tỷ trọng đơn</td>
                  <td className="text-blue">{formatPercentRounded(resolvedMetrics.consumerPercent)}</td>
                  <td className="text-orange">{formatPercentRounded(resolvedMetrics.mortgagePercent)}</td>
                  <td>{totalPercent}</td>
                </tr>
                <tr>
                  <td>Doanh số</td>
                  <td className="text-blue">{formatVndCompact(resolvedMetrics.consumerRevenue)}</td>
                  <td className="text-orange">{formatVndCompact(resolvedMetrics.mortgageRevenue)}</td>
                  <td>{formatVndCompact(resolvedMetrics.totalRevenue)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default memo(ProductStructureCard);
