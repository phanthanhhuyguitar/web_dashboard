import { memo, useEffect, useMemo, useState } from 'react';

import EmptyState from '../common/EmptyState.jsx';
import ErrorState from '../common/ErrorState.jsx';
import LoadingState from '../common/LoadingState.jsx';
import { normalizeSearchText } from './OrgRevenueTree.jsx';
import { calculateFunnelStatusCtvList } from '../../services/dashboard/loanMetrics.service.js';
import { formatDateTime } from '../../utils/date.js';
import { formatNumber } from '../../utils/formatNumber.js';

function FunnelCard({ data = [], status = 'ready', loans = [], users = [], range }) {
  const [detailStatus, setDetailStatus] = useState(null);
  const [searchValue, setSearchValue] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const isLoading = status === 'loading';
  const isError = status === 'error';
  const canOpenDetail = !isLoading && !isError;
  const isModalOpen = Boolean(detailStatus);

  const ctvList = useMemo(
    () => (detailStatus && range ? calculateFunnelStatusCtvList(loans, users, detailStatus.status, range) : []),
    [detailStatus, loans, users, range]
  );
  const filteredCtvList = useMemo(() => {
    const keyword = normalizeSearchText(searchValue);

    if (!keyword) return ctvList;

    return ctvList.filter((item) => {
      const searchableText = [item.displayName, item.ownerSaleId].map(normalizeSearchText).join(' ');

      return searchableText.includes(keyword);
    });
  }, [ctvList, searchValue]);

  useEffect(() => {
    if (!isModalOpen) return undefined;

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setDetailStatus(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModalOpen]);

  const openModal = (item) => {
    setSearchValue('');
    setCopyMessage('');
    setDetailStatus(item);
  };

  const closeModal = () => setDetailStatus(null);

  const copyText = async (text, message) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage(message);
    } catch {
      setCopyMessage('Không copy được - trình duyệt chặn quyền truy cập clipboard.');
    }

    window.setTimeout(() => setCopyMessage(''), 2500);
  };

  const copyOneUserId = (item) => {
    if (!item.userId) {
      setCopyMessage(`${item.displayName} chưa tra được userId.`);
      window.setTimeout(() => setCopyMessage(''), 2500);
      return;
    }

    copyText(item.userId, `Đã copy userId của ${item.displayName}.`);
  };

  const copyAllUserIds = () => {
    const userIds = filteredCtvList.map((item) => item.userId).filter(Boolean);

    if (userIds.length === 0) {
      setCopyMessage('Không có userId nào để copy.');
      window.setTimeout(() => setCopyMessage(''), 2500);
      return;
    }

    // Dinh dang giong 1 mang JS (moi dong bao ngoac kep + dau phay cuoi dong) de dan thang
    // vao code/JSON thay vi phai tu sua lai tung dong.
    const formatted = userIds.map((userId) => `"${userId}",`).join('\n');

    copyText(formatted, `Đã copy ${userIds.length} userId.`);
  };

  return (
    <>
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
                    {total > 0 ? (
                      <button
                        className="funnel-detail-link"
                        type="button"
                        onClick={() => openModal(item)}
                        disabled={!canOpenDetail}
                      >
                        Chi tiết
                      </button>
                    ) : null}
                  </p>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      {isModalOpen ? (
        <div className="top-team-modal-backdrop" role="presentation" onMouseDown={closeModal}>
          <section
            className="top-team-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="funnel-detail-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="top-team-modal-header">
              <div>
                <h2 id="funnel-detail-modal-title">Chi tiết {detailStatus?.label}</h2>
                <p>Danh sách CTV đang có đơn ở trạng thái này trong kỳ đang chọn, tính theo thời điểm đổi trạng thái gần nhất.</p>
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
              <button className="ds-button ds-button-secondary" type="button" onClick={copyAllUserIds}>
                Copy tất cả userId
              </button>
            </div>

            {copyMessage ? <p className="funnel-copy-message">{copyMessage}</p> : null}

            {ctvList.length === 0 ? (
              <EmptyState className="chart-state top-team-modal-state" text="Không có CTV nào ở trạng thái này trong kỳ đang chọn" />
            ) : null}

            {ctvList.length > 0 && filteredCtvList.length === 0 ? (
              <EmptyState className="chart-state top-team-modal-state" text="Không tìm thấy CTV phù hợp" />
            ) : null}

            {filteredCtvList.length > 0 ? (
              <div className="top-team-table-wrap">
                <table className="top-team-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>CTV</th>
                      <th>UserId</th>
                      <th>Số đơn</th>
                      <th>Cập nhật gần nhất</th>
                      <th>Copy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCtvList.map((item) => (
                      <tr key={item.ownerSaleId}>
                        <td>{item.rank}</td>
                        <td>
                          <strong>{item.displayLabel}</strong>
                        </td>
                        <td className="funnel-userid-cell" title={item.userId || ''}>
                          {item.userId || '--'}
                        </td>
                        <td>{formatNumber(item.loanCount)} đơn</td>
                        <td>{formatDateTime(item.latestUpdatedAt)}</td>
                        <td>
                          <button
                            className="ds-button ds-button-secondary funnel-copy-row-button"
                            type="button"
                            onClick={() => copyOneUserId(item)}
                            disabled={!item.userId}
                          >
                            Copy
                          </button>
                        </td>
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

export default memo(FunnelCard);