import { memo } from 'react';

import EmptyState from '../common/EmptyState.jsx';
import ErrorState from '../common/ErrorState.jsx';
import LoadingState from '../common/LoadingState.jsx';
import { formatNumber, formatVndCompact } from '../../utils/formatNumber.js';

function TopTeamLeadCard({ data = [], status = 'ready' }) {
  const isLoading = status === 'loading';
  const isError = status === 'error';

  return (
    <section className="dashboard-card compact-card">
      <div className="card-header">
        <h2>Top CTV theo doanh số</h2>
        <p>Xếp hạng theo giải ngân và tỷ lệ active CTV</p>
      </div>

      {isLoading ? <LoadingState className="chart-state leader-state" text="Đang tải Top CTV..." /> : null}

      {isError ? <ErrorState className="chart-state leader-state" text="Không tải được dữ liệu Top CTV" /> : null}

      {!isLoading && !isError && data.length === 0 ? (
        <EmptyState
          className="chart-state leader-state"
          text="Chưa có CTV phát sinh doanh số giải ngân trong kỳ đã chọn"
        />
      ) : null}

      {!isLoading && !isError && data.length > 0 ? (
        <div className="leader-list">
          {data.map((item, index) => (
            <div className="leader-row" key={item.ownerSaleId}>
              <span className={`rank-badge rank-${index + 1}`}>{index + 1}</span>
              <div className="leader-main">
                <strong>{item.displayLabel || item.ownerSaleId}</strong>
                <p>{formatNumber(item.closedLoanCount)} đơn giải ngân</p>
              </div>
              <span>{formatVndCompact(item.disbursementAmount)}</span>
              <p>{item.productLabel}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default memo(TopTeamLeadCard);
