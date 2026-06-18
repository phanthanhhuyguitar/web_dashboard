import { memo } from 'react';

import ErrorState from '../common/ErrorState.jsx';
import LoadingState from '../common/LoadingState.jsx';
import { formatNumber } from '../../utils/formatNumber.js';

function FunnelCard({ data = [], status = 'ready' }) {
  const isLoading = status === 'loading';
  const isError = status === 'error';

  return (
    <section className="dashboard-card compact-card funnel-card">
      <div className="card-header-row">
        <div>
          <h2>Funnel theo sản phẩm</h2>
          <p>Theo dõi trạng thái chính của 2 sản phẩm</p>
        </div>
        <div className="mini-legend">
          <span className="text-blue">Vay tiêu dùng</span>
          <span className="text-orange">Dư nợ/BĐS</span>
        </div>
      </div>

      {isLoading ? <LoadingState className="chart-state funnel-state" text="Đang tải dữ liệu funnel..." /> : null}

      {isError ? <ErrorState className="chart-state funnel-state" text="Không tải được dữ liệu funnel" /> : null}

      {!isLoading && !isError ? (
        <div className="funnel-list">
          {data.map((item) => {
            const total = item.total;
            const consumerWidth = total > 0 ? `${(item.consumerCount / total) * 100}%` : '0%';
            const mortgageWidth = total > 0 ? `${(item.mortgageCount / total) * 100}%` : '0%';

            return (
              <div className="funnel-row" key={item.key}>
                <div className="funnel-meta">
                  <strong>{item.label}</strong>
                  <span>{formatNumber(total)}</span>
                </div>
                <div className="funnel-track">
                  {total > 0 ? (
                    <>
                      <span className="funnel-consumer" style={{ width: consumerWidth }} />
                      <span className="funnel-mortgage" style={{ width: mortgageWidth }} />
                    </>
                  ) : null}
                </div>
                <p>
                  Tiêu dùng {formatNumber(item.consumerCount)} • Dư nợ/BĐS {formatNumber(item.mortgageCount)}
                </p>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

export default memo(FunnelCard);
