import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import ConfirmDialog from '../components/common/ConfirmDialog.jsx';
import Sidebar from '../components/layout/Sidebar.jsx';
import Topbar from '../components/layout/Topbar.jsx';
import {
  createSegment,
  deleteSegment,
  searchSegments,
  updateSegment,
} from '../services/segmentLocalService.js';
import { clearAccessToken } from '../utils/storage.js';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function formatSegmentDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '--';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');

  return `${day}/${month}/${year}\n${hour}:${minute}:${second}`;
}

function getSegmentUserCount(segment) {
  if (segment?.totalUsers !== undefined && segment?.totalUsers !== null) {
    return Number(segment.totalUsers) || 0;
  }

  if (Array.isArray(segment?.recipients)) return segment.recipients.length;
  if (Array.isArray(segment?.userIds)) return segment.userIds.length;

  return 0;
}

function SegmentModal({ mode, segment, onClose, onSubmit, open }) {
  const [values, setValues] = useState({ name: '', description: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;

    setValues({
      name: segment?.name || '',
      description: segment?.description || '',
    });
    setError('');
  }, [open, segment]);

  if (!open) return null;

  const title = mode === 'edit' ? 'Chỉnh sửa Segment' : 'Thêm mới Segment';

  const handleSave = () => {
    const trimmedName = values.name.trim();

    if (!trimmedName) {
      setError('Vui lòng nhập tên segment.');
      return;
    }

    onSubmit({
      name: trimmedName,
      description: values.description.trim(),
    });
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
            ×
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
          <button className="segment-secondary-button ds-button ds-button-secondary" type="button" onClick={onClose}>
            Hủy
          </button>
          <button className="segment-primary-button ds-button ds-button-primary" type="button" onClick={handleSave}>
            Lưu
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
  const [pageSize, setPageSize] = useState(10);
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
  const [pageJump, setPageJump] = useState('');

  const loadSegments = () => {
    setLoading(true);
    setError('');

    try {
      const nextResult = searchSegments({
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
    loadSegments();
  }, [appliedKeyword, page, pageSize]);

  const rangeText = useMemo(() => {
    if (result.totalElements === 0) return 'Hiển thị 0-0 của 0 bản ghi';

    const start = (result.page - 1) * result.pageSize + 1;
    const end = Math.min(start + result.items.length - 1, result.totalElements);

    return `Hiển thị ${start}-${end} của ${result.totalElements} bản ghi`;
  }, [result]);
  const pages = useMemo(() => {
    return Array.from({ length: result.totalPages }, (_, index) => index + 1).slice(0, 5);
  }, [result.totalPages]);
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

  const closeModal = () => {
    setModalState((current) => ({ ...current, open: false }));
  };

  const handleModalSubmit = (payload) => {
    try {
      if (modalState.mode === 'edit' && modalState.segment?.id) {
        updateSegment(modalState.segment.id, payload);
        setToastMessage({ type: 'success', text: 'Cập nhật segment thành công.' });
      } else {
        createSegment(payload);
        setToastMessage({ type: 'success', text: 'Tạo segment thành công.' });
        setPage(1);
      }

      closeModal();
      loadSegments();
    } catch {
      setToastMessage({ type: 'error', text: 'Không thể lưu segment. Vui lòng thử lại.' });
    }
  };

  const confirmDelete = () => {
    if (!deletingSegment?.id) return;

    try {
      const deleted = deleteSegment(deletingSegment.id);

      if (!deleted) {
        setToastMessage({ type: 'error', text: 'Không thể xóa segment. Vui lòng thử lại.' });
      } else {
        setToastMessage({ type: 'success', text: 'Xóa segment thành công.' });
      }

      setDeletingSegment(null);
      loadSegments();
    } catch {
      setToastMessage({ type: 'error', text: 'Không thể xóa segment. Vui lòng thử lại.' });
    }
  };

  const goToPage = (nextPage) => {
    const pageNumber = Number(nextPage);

    if (!Number.isFinite(pageNumber)) return;

    setPage(Math.min(Math.max(pageNumber, 1), result.totalPages));
  };

  const handlePageJump = () => {
    if (!pageJump.trim()) return;

    goToPage(pageJump);
    setPageJump('');
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
                            <td>{formatSegmentDate(segment.createdAt)}</td>
                            <td>{formatSegmentDate(segment.updatedAt)}</td>
                            <td>
                              <div className="segment-row-actions">
                                <button
                                  className="ds-icon-button ds-icon-button-primary"
                                  type="button"
                                  onClick={() => openEditModal(segment)}
                                  aria-label="Sửa segment"
                                >
                                  ✎
                                </button>
                                <button
                                  className="ds-icon-button ds-icon-button-danger"
                                  type="button"
                                  onClick={() => setDeletingSegment(segment)}
                                  aria-label="Xóa segment"
                                >
                                  ×
                                </button>
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
              <div className="segment-page-size">
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <option value={option} key={option}>
                      {option} bản ghi/trang
                    </option>
                  ))}
                </select>
              </div>
              <div className="segment-page-jump">
                <span>Đi đến trang</span>
                <input
                  value={pageJump}
                  onChange={(event) => setPageJump(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handlePageJump();
                  }}
                  placeholder="--"
                />
              </div>
              <div className="segment-page-buttons">
                <button type="button" onClick={() => goToPage(page - 1)} disabled={page <= 1}>
                  ‹
                </button>
                {pages.map((item) => (
                  <button
                    className={item === page ? 'is-active' : ''}
                    type="button"
                    onClick={() => goToPage(item)}
                    disabled={item === page}
                    key={item}
                  >
                    {item}
                  </button>
                ))}
                <button type="button" onClick={() => goToPage(page + 1)} disabled={page >= result.totalPages}>
                  ›
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
        <div className={`segment-toast segment-toast-${toastMessage.type || 'success'}`} role="status">
          <span>{toastMessage.text}</span>
          <button type="button" onClick={() => setToastMessage(null)} aria-label="Đóng thông báo">
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default SegmentManagementPage;
