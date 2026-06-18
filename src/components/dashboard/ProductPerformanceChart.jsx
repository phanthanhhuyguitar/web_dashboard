import { memo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import EmptyState from '../common/EmptyState.jsx';
import ErrorState from '../common/ErrorState.jsx';
import LoadingState from '../common/LoadingState.jsx';

const tooltipFormatter = (value, name) => {
  const labels = {
    consumerLoan: 'Vay tiêu dùng',
    mortgageLoan: 'Vay trên dư nợ',
    closed: 'Closed',
  };

  return [`${value} đơn`, labels[name] || name];
};

const tooltipLabelFormatter = (label) => `Ngày ${label}`;

function ProductPerformanceChart({ data = [], status = 'ready' }) {
  const isLoading = status === 'loading';
  const isError = status === 'error';
  const isEmpty = !isLoading && !isError && data.length === 0;

  return (
    <section className="dashboard-card performance-card">
      <div className="card-header-row">
        <div>
          <h2>Hiệu suất theo sản phẩm</h2>
          <p>So sánh số đơn phát sinh hằng ngày: Vay tiêu dùng và Vay trên dư nợ/BĐS</p>
        </div>
        <div className="pill-legend">
          <span className="pill pill-blue">Vay tiêu dùng</span>
          <span className="pill pill-orange">Vay trên dư nợ</span>
          <span className="pill pill-green">Closed</span>
        </div>
      </div>

      <div className="chart-wrap">
        {isLoading ? <LoadingState className="chart-state" text="Đang tải dữ liệu hiệu suất..." /> : null}
        {isError ? <ErrorState className="chart-state" text="Không tải được dữ liệu hiệu suất sản phẩm" /> : null}
        {isEmpty ? <EmptyState className="chart-state" text="Không có dữ liệu phát sinh trong kỳ đã chọn" /> : null}
        {!isLoading && !isError && !isEmpty ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 18, right: 18, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="#e7edf6" vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: '#90a1bb', fontSize: 12 }} />
              <YAxis hide allowDecimals={false} domain={[0, 'dataMax + 2']} />
              <Tooltip
                formatter={tooltipFormatter}
                labelFormatter={tooltipLabelFormatter}
                contentStyle={{
                  border: '1px solid #dce7f5',
                  borderRadius: 12,
                  boxShadow: '0 12px 30px rgba(15, 23, 42, 0.12)',
                }}
              />
              <Line type="monotone" dataKey="consumerLoan" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="mortgageLoan" stroke="#f97316" strokeWidth={3} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="closed" stroke="#059669" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </section>
  );
}

export default memo(ProductPerformanceChart);
