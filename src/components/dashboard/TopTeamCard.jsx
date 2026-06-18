import { memo } from 'react';

import EmptyState from '../common/EmptyState.jsx';
import ErrorState from '../common/ErrorState.jsx';
import LoadingState from '../common/LoadingState.jsx';
import { formatNumber, formatVndCompact } from '../../utils/formatNumber.js';

function TopTeamCard({ data = [], status = 'ready' }) {
  const isLoading = status === 'loading';
  const isError = status === 'error';

  return (
    <section className="dashboard-card compact-card">
      <div className="card-header">
        <h2>Top Team theo doanh số giải ngân</h2>
        <p>Xếp hạng team theo số tiền giải ngân trong tháng đã chọn</p>
      </div>

      {isLoading ? <LoadingState className="chart-state leader-state" text="Đang tải dữ liệu team..." /> : null}

      {isError ? <ErrorState className="chart-state leader-state" text="Không tải được dữ liệu Top Team" /> : null}

      {!isLoading && !isError && data.length === 0 ? (
        <EmptyState
          className="chart-state leader-state"
          text="Chưa có team phát sinh doanh số giải ngân trong kỳ đã chọn"
        />
      ) : null}

      {!isLoading && !isError && data.length > 0 ? (
        <div className="team-list">
          {data.map((item, index) => (
            <div className="team-row" key={item.orgUnitId}>
              <span className={`rank-badge rank-${index + 1}`}>{index + 1}</span>
              <div className="team-main">
                <strong>
                  {item.teamName} / {item.teamCode || '--'}
                </strong>
                <p>
                  Lead: {item.leadName} • {formatNumber(item.ctvCount)} CTV •{' '}
                  {formatNumber(item.closedLoanCount)} đơn
                </p>
              </div>
              <span>{formatVndCompact(item.disbursementAmount)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default memo(TopTeamCard);
