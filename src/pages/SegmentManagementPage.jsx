import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import ConfirmDialog from '../components/common/ConfirmDialog.jsx';
import Sidebar from '../components/layout/Sidebar.jsx';
import Topbar from '../components/layout/Topbar.jsx';
import { deleteSegment, searchSegments, updateSegment } from '../services/segmentLocalService.js';
import { formatDateTime } from '../utils/date.js';
import { clearAccessToken } from '../utils/storage.js';

function getSegmentUserCount(segment) {
  if (segment?.userCount !== undefined && segment?.userCount !== null) {
    return Number(segment.userCount) || 0;
  }

  if (Array.isArray(segment?.savedUsers)) return segment.savedUsers.length;

  if (segment?.totalUsers !== undefined && segment?.totalUsers !== null) {
    return Number(segment.totalUsers) || 0;
  }

  if (Array.isArray(segment?.recipients)) return segment.recipients.length;
  if (Array.isArray(segment?.userIds)) return segment.userIds.length;

  return 0;
}

function getApiErrorMessage(error, fallback) {
  return error?.response?.data?.message || error?.response?.data?.error || fallback;
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

function SegmentModal({ mode, segment, onClose, onSubmit, open }) {
  const [values, setValues] = useState({ name: '', description: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    setValues({
      name: segment?.name || '',
      description: segment?.description || '',
    });
    setError('');
    setSaving(false);
  }, [open, segment]);

  if (!open) return null;

  const title = mode === 'edit' ? 'Chỉnh sửa Segment' : 'Thêm mới Segment';

  const handleSave = async () => {
    const trimmedName = values.name.trim();

    if (!trimmedName) {
      setError('Vui lòng nhập tên segment.');
      return;
    }

    setSaving(true);

    try {
      await onSubmit({
        name: trimmedName,
        description: values.description.trim(),
      });
    } catch (submitError) {
      setError(submitError?.message || 'Không thể lưu segment. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="segment-modal-backdrop" role="presentation">
      <section className="segment-modal" role="dialog" aria-modal="true" aria-labelledby="segment-modal-title">
        <div className="segment-modal-header">
          <div>
            <h2 id="segment-modal-title">{title}</h2>
            <p>Thông tin cơ bản của segment.</p>
          </div>
          <button className="segment-icon-button" type="button" onClick={onClose} aria-label="Đóng">
            x
          </button>
        </div>

        <div className="segment-modal-form">
          <label className="segment-field">
            <span>
              Tên segment <strong>*</strong>
            </span>
            <input
              value={values.name}
              onChange={(event) => {
                setValues((current) => ({ ...current, name: event.target.value }));
                setError('');
              }}
              placeholder="Nhập tên segment"
              autoFocus
            />
          </label>
          {error ? <strong className="segment-field-error">{error}</strong> : null}

          <label className="segment-field">
            <span>Mô tả</span>
            <textarea
              value={values.description}
              onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))}
              placeholder="Nhập mô tả"
              rows={4}
            />
          </label>
        </div>

        <div className="segment-modal-actions">
          <button className="segment-secondary-button ds-button ds-button-secondary" type="button" onClick={onClose} disabled={saving}>
            Hủy
          </button>
          <button className="segment-primary-button ds-button ds-button-primary" type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </section>
    </div>
  );
}

function SegmentManagementPage() {
  const navigate = useNavigate();
  const [filterValue, setFilterValue] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState({
    items: [],
    page: 1,
    pageSize: 10,
    totalElements: 0,
    totalPages: 1,
  });
  const [modalState, setModalState] = useState({ open: false, mode: 'create', segment: null });
  const [deletingSegment, setDeletingSegment] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const loadSegments = async () => {
    setLoading(true);
    setError('');

    try {
      const nextResult = await searchSegments({
        keyword: appliedKeyword,
        page,
        size: pageSize,
      });

      setResult(nextResult);

      if (nextResult.page !== page) {
        setPage(nextResult.page);
      }
    } catch {
      setError('Không thể tải danh sách segment. Vui lòng thử lại.');
      setResult((current) => ({ ...current, items: [], totalElements: 0, totalPages: 1 }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError('');

      try {
        const nextResult = await searchSegments({
          keyword: appliedKeyword,
          page,
          size: pageSize,
        });

        if (cancelled) return;

        setResult(nextResult);

        if (nextResult.page !== page) {
          setPage(nextResult.page);
        }
      } catch {
        if (cancelled) return;

        setError('Không thể tải danh sách segment. Vui lòng thử lại.');
        setResult((current) => ({ ...current, items: [], totalElements: 0, totalPages: 1 }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [appliedKeyword, page, pageSize]);

  const rangeText = useMemo(
    () => `Tổng số ${result.totalElements.toLocaleString('vi-VN')} bản ghi`,
    [result.totalElements]
  );
  const pages = useMemo(() => getPaginationItems(page, result.totalPages), [page, result.totalPages]);
  const isFiltered = appliedKeyword.trim() !== '';
  const emptyText = isFiltered ? 'Không tìm thấy segment phù hợp.' : 'Chưa có segment nào.';

  const handleLogout = () => {
    clearAccessToken();
    navigate('/login', { replace: true });
  };

  const applyFilter = () => {
    setAppliedKeyword(filterValue.trim());
    setPage(1);
  };

  const openCreateModal = () => {
    setModalState({ open: true, mode: 'create', segment: null });
  };

  const openEditModal = (segment) => {
    setModalState({ open: true, mode: 'edit', segment });
  };

  const openDetailPage = (segment) => {
    navigate(`/segments/${encodeURIComponent(segment.id)}/detail`, {
      state: { segment },
    });
  };

  const closeModal = () => {
    setModalState((current) => ({ ...current, open: false }));
  };

  const handleModalSubmit = async (payload) => {
    try {
      if (modalState.mode === 'edit' && modalState.segment?.id) {
        await updateSegment(modalState.segment.id, payload);
        setToastMessage({ type: 'success', text: 'Cập nhật segment thành công.' });
        closeModal();
        await loadSegments();
        return;
      } else {
        // KHONG goi createSegment o day nua - segment chi thuc su duoc tao (va bao "thanh cong")
        // sau khi admin cau hinh xong bo loc va bam "Luu danh sach" o buoc tiep theo. Truoc day
        // goi createSegment ngay tai day khien segment "da tao thanh cong" du chua co bo loc/user
        // nao ca - gay hieu lam da xong (xem SegmentUserConfigPage.jsx).
        closeModal();
        navigate('/segments/new/users', {
          state: {
            pendingSegment: { name: payload.name, description: payload.description },
          },
        });
        return;
      }
    } catch (error) {
      const message = getApiErrorMessage(error, 'Không thể lưu segment. Vui lòng thử lại.');
      setToastMessage({ type: 'error', text: message });
      throw new Error(message);
    }
  };

  const confirmDelete = async () => {
    if (!deletingSegment?.id) return;

    try {
      const deleted = await deleteSegment(deletingSegment.id);

      if (!deleted) {
        setToastMessage({ type: 'error', text: 'Không thể xóa segment. Vui lòng thử lại.' });
      } else {
        setToastMessage({ type: 'success', text: 'Xóa segment thành công.' });
      }

      setDeletingSegment(null);
      await loadSegments();
    } catch {
      setToastMessage({ type: 'error', text: 'Không thể xóa segment. Vui lòng thử lại.' });
    }
  };

  const goToPage = (nextPage) => {
    const pageNumber = Number(nextPage);

    if (!Number.isFinite(pageNumber)) return;

    setPage(Math.min(Math.max(pageNumber, 1), result.totalPages));
  };

  return (
    <div className="dashboard-shell">
      <Sidebar />

      <div className="dashboard-main">
        <Topbar
          breadcrumbs={['Hệ thống quản trị', 'Trung tâm thông báo', 'Quản lý Segment']}
          isRefreshing={loading}
          onLogout={handleLogout}
          onRefresh={loadSegments}
        />

        <main className="dashboard-content segment-page">
          <div className="dashboard-heading-row segment-heading-row">
            <div>
              <h1>Quản lý Segment</h1>
              <p>Quản lý danh sách segment người dùng phục vụ gửi thông báo.</p>
            </div>
          </div>

          <section className="segment-filter-card">
            <div className="segment-card-header">
              <div>
                <h2>Bộ lọc Segment</h2>
                <p>Lọc theo tên segment trước khi tìm kiếm.</p>
              </div>
            </div>

            <div className="segment-filter-grid">
              <label className="segment-field segment-filter-field">
                <span>Tên segment</span>
                <input
                  value={filterValue}
                  onChange={(event) => setFilterValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') applyFilter();
                  }}
                  placeholder="Tìm kiếm"
                />
              </label>
              <button className="segment-outline-button ds-button ds-button-primary" type="button" onClick={applyFilter}>
                Áp dụng
              </button>
            </div>
          </section>

          <section className="segment-table-card">
            <div className="segment-card-header segment-table-header">
              <div>
                <h2>Danh sách Segment</h2>
                <p>Quản lý danh sách phân khúc người dùng.</p>
              </div>
              <button className="segment-primary-button ds-button ds-button-primary" type="button" onClick={openCreateModal}>
                + Thêm mới
              </button>
            </div>

              <div className="segment-table-wrap">
                <table className="segment-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Tên</th>
                      <th>Người tạo</th>
                      <th>Số người</th>
                      <th>Ngày tạo</th>
                      <th>Ngày cập nhật</th>
                      <th>Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="segment-table-state">
                          Đang tải danh sách segment...
                        </td>
                      </tr>
                    ) : null}
                    {!loading && error ? (
                      <tr>
                        <td colSpan={7} className="segment-table-state segment-table-error">
                          {error}
                        </td>
                      </tr>
                    ) : null}
                    {!loading && !error && result.items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="segment-table-state">
                          {emptyText}
                        </td>
                      </tr>
                    ) : null}
                    {!loading && !error
                      ? result.items.map((segment, index) => (
                          <tr key={segment.id}>
                            <td>{(result.page - 1) * result.pageSize + index + 1}</td>
                            <td>{segment.name || '--'}</td>
                            <td>{segment.createdBy || '--'}</td>
                            <td>{getSegmentUserCount(segment)}</td>
                            <td>{formatDateTime(segment.createdAt)}</td>
                            <td>{formatDateTime(segment.updatedAt)}</td>
                            <td>
                              <div className="segment-row-actions">
                                <button
                                  className="ds-icon-button ds-icon-button-primary segment-action-edit"
                                  type="button"
                                  onClick={() => openDetailPage(segment)}
                                  aria-label="Xem chi tiết"
                                  title="Xem chi tiết"
                                />
                                <button
                                  className="ds-icon-button ds-icon-button-danger segment-action-delete"
                                  type="button"
                                  onClick={() => setDeletingSegment(segment)}
                                  aria-label="Xóa segment"
                                />
                              </div>
                            </td>
                          </tr>
                        ))
                      : null}
                  </tbody>
                </table>
              </div>

            <div className="segment-pagination">
              <span>{rangeText}</span>
              <div className="segment-page-buttons">
                <button type="button" onClick={() => goToPage(page - 1)} disabled={page <= 1}>
                  ← Trước
                </button>
                {pages.map((item) =>
                  typeof item === 'number' ? (
                    <button
                      className={`segment-page-number${item === page ? ' is-active' : ''}`}
                      type="button"
                      onClick={() => goToPage(item)}
                      disabled={item === page}
                      aria-current={item === page ? 'page' : undefined}
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
                <button type="button" onClick={() => goToPage(page + 1)} disabled={page >= result.totalPages}>
                  Sau →
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>

      <SegmentModal
        mode={modalState.mode}
        segment={modalState.segment}
        onClose={closeModal}
        onSubmit={handleModalSubmit}
        open={modalState.open}
      />

      <ConfirmDialog
        cancelText="Hủy"
        confirmText="Xóa"
        loading={false}
        message={`Bạn có chắc chắn muốn xóa segment "${deletingSegment?.name || ''}" không?`}
        open={Boolean(deletingSegment)}
        title="Xác nhận xóa Segment"
        variant="danger"
        onCancel={() => setDeletingSegment(null)}
        onConfirm={confirmDelete}
      />

      {toastMessage?.text ? (
        <div className={`segment-toast segment-toast-${toastMessage.type || 'success'}`} role="status" aria-live="polite">
          <span>{toastMessage.text}</span>
          <button type="button" onClick={() => setToastMessage(null)} aria-label="Đóng thông báo">
            x
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default SegmentManagementPage;
