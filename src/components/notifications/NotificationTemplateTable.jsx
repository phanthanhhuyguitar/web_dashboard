import EmptyState from '../common/EmptyState.jsx';
import ErrorState from '../common/ErrorState.jsx';
import LoadingState from '../common/LoadingState.jsx';
import { formatDateTime } from '../../utils/date.js';

function getTemplateId(item) {
  return item.id ?? item.templateId ?? '--';
}

function getTemplateCode(item) {
  return item.code ?? item.templateCode ?? '--';
}

function getPaginationItems(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const firstPages = [1, 2, 3, 4, 5];

  if (currentPage <= 5) {
    return [...firstPages, 'end-ellipsis', totalPages];
  }

  if (currentPage >= totalPages - 4) {
    return [1, 'start-ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, 2, 'start-ellipsis', currentPage - 1, currentPage, currentPage + 1, 'end-ellipsis', totalPages];
}

function NotificationTemplateTable({
  error,
  hasActiveFilter,
  items,
  loading,
  onCreate,
  onEdit,
  onGoToPage,
  page,
  totalElements,
  totalPages,
}) {
  const pageCount = totalPages > 0 ? totalPages : 1;
  const currentPage = page + 1;
  const paginationItems = getPaginationItems(currentPage, pageCount);

  return (
    <section className="dashboard-card notification-table-card">
      <div className="card-header-row notification-table-header">
        <div>
          <h2>Danh sách nội dung thông báo</h2>
          <p>Quản lý template hiển thị trên ứng dụng.</p>
        </div>
        <button className="notification-primary-button" type="button" onClick={onCreate}>
          + Tạo nội dung
        </button>
        
      </div>

      {loading ? <LoadingState text="Đang tải danh sách nội dung thông báo..." /> : null}

      {!loading && error ? <ErrorState text={error} /> : null}

      {!loading && !error && items.length === 0 ? (
        <EmptyState
          text={
            hasActiveFilter
              ? 'Không tìm thấy nội dung thông báo phù hợp với điều kiện lọc'
              : 'Không có nội dung thông báo nào'
          }
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <>
          <div className="notification-table-wrap">
            <table className="notification-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Mã thông báo</th>
                  <th>Tiêu đề</th>
                  <th>Nội dung</th>
                  <th>Ngày tạo</th>
                  <th>Ngày cập nhật</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={`${getTemplateId(item)}-${getTemplateCode(item)}`}>
                    <td>{getTemplateId(item)}</td>
                    <td>
                      <strong>{getTemplateCode(item)}</strong>
                    </td>
                    <td>
                      <span className="notification-text-cell">{item.titleTemplate || '--'}</span>
                    </td>
                    <td>
                      <span className="notification-text-cell">{item.bodyTemplate || '--'}</span>
                    </td>
                    <td>{formatDateTime(item.createdAt)}</td>
                    <td>{formatDateTime(item.updatedAt)}</td>
                    <td>
                      <button className="notification-table-action" type="button" onClick={() => onEdit(item)}>
                        Chỉnh sửa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="segment-pagination">
            <span>Tổng số {totalElements.toLocaleString('vi-VN')} bản ghi</span>
            <div className="segment-page-buttons">
              <button type="button" onClick={() => onGoToPage(currentPage - 1)} disabled={currentPage <= 1 || loading}>
                ← Trước
              </button>
              {paginationItems.map((item) =>
                typeof item === 'number' ? (
                  <button
                    className={`segment-page-number${item === currentPage ? ' is-active' : ''}`}
                    type="button"
                    onClick={() => onGoToPage(item)}
                    disabled={loading || item === currentPage}
                    aria-current={item === currentPage ? 'page' : undefined}
                    key={item}
                  >
                    {item}
                  </button>
                ) : (
                  <span className="segment-page-ellipsis" key={item}>
                    ...
                  </span>
                ),
              )}
              <button type="button" onClick={() => onGoToPage(currentPage + 1)} disabled={currentPage >= pageCount || loading}>
                Sau →
              </button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

export default NotificationTemplateTable;
