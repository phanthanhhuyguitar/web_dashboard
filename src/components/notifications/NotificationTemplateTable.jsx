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

function NotificationTemplateTable({
  error,
  hasActiveFilter,
  items,
  loading,
  onCreate,
  onEdit,
  onNext,
  onPrevious,
  page,
  totalElements,
  totalPages,
}) {
  const pageCount = totalPages > 0 ? totalPages : 1;

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

          <div className="notification-pagination">
            <span>
              Trang {page + 1}/{pageCount}
            </span>
            <div>
              <button type="button" onClick={onPrevious} disabled={page <= 0 || loading}>
                Trước
              </button>
              <button type="button" onClick={onNext} disabled={page >= pageCount - 1 || loading}>
                Sau
              </button>
            </div>
          </div>
          <span>{totalElements.toLocaleString('vi-VN')} bản ghi</span>
        </>
      ) : null}
    </section>
  );
}

export default NotificationTemplateTable;
