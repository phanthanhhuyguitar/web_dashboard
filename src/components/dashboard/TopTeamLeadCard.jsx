import { memo, useEffect, useMemo, useState } from 'react';

import EmptyState from '../common/EmptyState.jsx';
import ErrorState from '../common/ErrorState.jsx';
import LoadingState from '../common/LoadingState.jsx';
import { normalizeSearchText } from './OrgRevenueTree.jsx';
import { calculateCtvOrdersCreatedInRange } from '../../services/dashboard/loanMetrics.service.js';
import { formatDateTime } from '../../utils/date.js';
import { formatNumber, formatVndCompact } from '../../utils/formatNumber.js';

function TopTeamLeadCard({ data = [], status = 'ready', loans = [], users = [], range }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const isLoading = status === 'loading';
  const isError = status === 'error';
  const canOpenDetail = !isLoading && !isError;

  const ctvOrders = useMemo(
    () => (range ? calculateCtvOrdersCreatedInRange(loans, users, range) : []),
    [loans, users, range]
  );
  const filteredCtvOrders = useMemo(() => {
    const keyword = normalizeSearchText(searchValue);

    if (!keyword) return ctvOrders;

    return ctvOrders.filter((item) => {
      const searchableText = [item.displayName, item.ownerSaleId].map(normalizeSearchText).join(' ');

      return searchableText.includes(keyword);
    });
  }, [ctvOrders, searchValue]);

  useEffect(() => {
    if (!isModalOpen) return undefined;

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsModalOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModalOpen]);

  const openModal = () => {
    setSearchValue('');
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  return (
    <>
      <section className="dashboard-card compact-card">
        <div className="card-header-row top-team-card-header">
          <div>
            <h2>Top CTV theo doanh số</h2>
            <p>Xếp hạng theo giải ngân và tỷ lệ active CTV</p>
          </div>
          <div className="top-team-tabs">
            <div className="top-team-tabs-row">
              <button className="top-team-tab-link" type="button" onClick={openModal} disabled={!canOpenDetail}>
                Chi tiết
              </button>
            </div>
          </div>
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

      {isModalOpen ? (
        <div className="top-team-modal-backdrop" role="presentation" onMouseDown={closeModal}>
          <section
            className="top-team-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="top-ctv-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="top-team-modal-header">
              <div>
                <h2 id="top-ctv-modal-title">Chi tiết CTV có đơn trong tháng</h2>
                <p>Danh sách CTV có đơn phát sinh trong tháng hiện tại, tính theo ngày tạo đơn</p>
              </div>
              <div className="top-team-modal-header-actions">
                <button className="top-team-modal-close" type="button" onClick={closeModal} aria-label="Đóng modal">
                  ×
                </button>
              </div>
            </div>

            <div className="top-team-modal-toolbar">
              <input
                type="search"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Tìm kiếm theo tên hoặc mã sale..."
                aria-label="Tìm kiếm"
              />
            </div>

            {ctvOrders.length === 0 ? (
              <EmptyState className="chart-state top-team-modal-state" text="Không có CTV nào phát sinh đơn trong tháng hiện tại" />
            ) : null}

            {ctvOrders.length > 0 && filteredCtvOrders.length === 0 ? (
              <EmptyState className="chart-state top-team-modal-state" text="Không tìm thấy CTV phù hợp" />
            ) : null}

            {filteredCtvOrders.length > 0 ? (
              <div className="top-team-table-wrap">
                <table className="top-team-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>CTV</th>
                      <th>Số đơn tạo trong tháng</th>
                      <th>Ngày tạo gần nhất</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCtvOrders.map((item) => (
                      <tr key={item.ownerSaleId}>
                        <td>{item.rank}</td>
                        <td>
                          <strong>{item.displayLabel}</strong>
                        </td>
                        <td>{formatNumber(item.orderCount)} đơn</td>
                        <td>{formatDateTime(item.latestCreatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}

export default memo(TopTeamLeadCard);
