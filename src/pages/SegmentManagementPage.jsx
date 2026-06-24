import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import ConfirmDialog from '../components/common/ConfirmDialog.jsx';
import Sidebar from '../components/layout/Sidebar.jsx';
import Topbar from '../components/layout/Topbar.jsx';
import {
  cancelSyncLoanDetailList,
  cancelSyncLoanList,
  cancelSyncUserDetailList,
  cancelSyncUserList,
  createSegment,
  deleteSegment,
  getSyncLoanDetailListStatus,
  getSyncLoanListStatus,
  getSyncUserDetailListStatus,
  getSyncUserListStatus,
  pauseSyncLoanDetailList,
  pauseSyncLoanList,
  pauseSyncUserDetailList,
  pauseSyncUserList,
  resumeSyncLoanDetailList,
  resumeSyncLoanList,
  resumeSyncUserDetailList,
  resumeSyncUserList,
  searchSegments,
  syncLoanDetailList,
  syncLoanList,
  syncUserDetailList,
  syncUserList,
  updateSegment,
} from '../services/segmentLocalService.js';
import { clearAccessToken } from '../utils/storage.js';

const SYNC_POLL_INTERVAL_MS = 1000;

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

function isActiveSyncStatus(status) {
  return status === 'RUNNING' || status === 'PAUSED';
}

function getSyncToastText(job, fallbackType = 'completed') {
  const failedCount = Number(job?.failedCount) || 0;
  const isLoanJob = job?.type === 'LOAN';
  const isLoanDetailJob = job?.type === 'LOAN_DETAIL';

  if (fallbackType === 'started') return 'Bắt đầu đồng bộ dữ liệu.';
  if (fallbackType === 'paused') return 'Đã tạm dừng đồng bộ.';
  if (fallbackType === 'resumed') return 'Tiếp tục đồng bộ dữ liệu.';
  if (fallbackType === 'cancelled') return 'Đã hủy đồng bộ.';
  if (fallbackType === 'failed' && isLoanDetailJob) return 'Đồng bộ chi tiết DS đơn vay thất bại. Vui lòng kiểm tra log.';
  if (fallbackType === 'failed') return isLoanJob ? 'Đồng bộ đơn vay thất bại. Vui lòng kiểm tra log.' : 'Đồng bộ thất bại. Vui lòng kiểm tra log.';
  if (isLoanDetailJob) {
    return failedCount > 0
      ? `Đồng bộ chi tiết DS đơn vay hoàn tất, có ${failedCount} đơn lỗi.`
      : 'Đồng bộ chi tiết DS đơn vay hoàn tất.';
  }
  if (isLoanJob) return 'Đồng bộ đơn vay hoàn tất.';

  return failedCount > 0 ? `Đồng bộ hoàn tất, có ${failedCount} user lỗi.` : 'Đồng bộ hoàn tất.';
}

function getStatusLabel(status) {
  const labels = {
    RUNNING: 'Đang chạy',
    PAUSED: 'Đang tạm dừng',
    CANCELLED: 'Đã hủy',
    COMPLETED: 'Hoàn tất',
    FAILED: 'Lỗi hệ thống',
  };

  return labels[status] || 'Chưa chạy';
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

function SyncMetric({ label, value, tone = '' }) {
  return (
    <div className={`segment-sync-metric${tone ? ` segment-sync-metric-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SyncFileItem({ label, value, warning = false }) {
  if (!value) return null;

  return (
    <div className={`segment-sync-file${warning ? ' segment-sync-file-warning' : ''}`} title={value}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
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
  const [syncMenuOpen, setSyncMenuOpen] = useState(false);
  const [syncingAction, setSyncingAction] = useState('');
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const [syncConfirmType, setSyncConfirmType] = useState('list');
  const [syncJob, setSyncJob] = useState(null);
  const [cancelSyncConfirmOpen, setCancelSyncConfirmOpen] = useState(false);
  const [syncControlLoading, setSyncControlLoading] = useState('');

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

  useEffect(() => {
    if (!syncJob?.jobId || !isActiveSyncStatus(syncJob.status)) return undefined;

    let cancelled = false;
    const pollStatus = async () => {
      try {
        const requestStatus =
          syncJob.type === 'LOAN_DETAIL'
            ? getSyncLoanDetailListStatus
            : syncJob.type === 'LOAN'
            ? getSyncLoanListStatus
            : syncJob.type === 'USER_DETAIL'
              ? getSyncUserDetailListStatus
              : getSyncUserListStatus;
        const nextJob = await requestStatus(syncJob.jobId);

        if (cancelled) return;

        setSyncJob(nextJob);

        if (nextJob.status === 'COMPLETED') {
          setToastMessage({
            type: 'success',
            text: getSyncToastText(nextJob, 'completed'),
          });
        }

        if (nextJob.status === 'FAILED') {
          setToastMessage({
            type: 'error',
            text: getSyncToastText(nextJob, 'failed'),
          });
        }

        if (nextJob.status === 'CANCELLED') {
          setToastMessage({
            type: 'warning',
            text: getSyncToastText(nextJob, 'cancelled'),
          });
        }
      } catch (pollError) {
        if (cancelled) return;

        const message = getApiErrorMessage(
          pollError,
          syncJob.type === 'LOAN_DETAIL'
            ? 'Không thể lấy trạng thái đồng bộ chi tiết DS đơn vay.'
            : syncJob.type === 'LOAN'
            ? 'Không thể lấy trạng thái đồng bộ đơn vay.'
            : 'Không thể lấy trạng thái đồng bộ danh sách user.',
        );
        setSyncJob((current) =>
          current
            ? {
                ...current,
                status: 'FAILED',
                progress: 100,
                errorMessage: message,
              }
            : current,
        );
        setToastMessage({
          type: 'error',
          text: message,
        });
      }
    };

    const intervalId = window.setInterval(pollStatus, SYNC_POLL_INTERVAL_MS);
    pollStatus();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [syncJob?.jobId, syncJob?.status, syncJob?.type]);

  const rangeText = useMemo(() => {
    if (result.totalElements === 0) return 'Hiển thị 0-0 của 0 bản ghi';

    const start = (result.page - 1) * result.pageSize + 1;
    const end = Math.min(start + result.items.length - 1, result.totalElements);

    return `Hiển thị ${start}-${end} của ${result.totalElements} bản ghi`;
  }, [result]);
  const pages = useMemo(() => getPaginationItems(page, result.totalPages), [page, result.totalPages]);
  const isFiltered = appliedKeyword.trim() !== '';
  const emptyText = isFiltered ? 'Không tìm thấy segment phù hợp.' : 'Chưa có segment nào.';
  const isSyncRunning = isActiveSyncStatus(syncJob?.status) || Boolean(syncingAction);
  const isSyncPaused = syncJob?.status === 'PAUSED';
  const canPauseSync = syncJob?.status === 'RUNNING' && !syncControlLoading;
  const canResumeSync = isSyncPaused && !syncControlLoading;
  const canCancelSync = isActiveSyncStatus(syncJob?.status) && !syncControlLoading;
  const syncProgress = Math.min(Math.max(Number(syncJob?.progress) || 0, 0), 100);
  const isDetailSyncJob = syncJob?.type === 'USER_DETAIL';
  const isLoanSyncJob = syncJob?.type === 'LOAN';
  const isLoanDetailSyncJob = syncJob?.type === 'LOAN_DETAIL';
  const loanPageText = syncJob?.totalPages ? `${syncJob.currentPage ?? 0} / ${syncJob.totalPages}` : syncJob?.currentPage ?? '--';
  const syncConfirmContent =
    syncConfirmType === 'loanDetail'
      ? {
          title: 'Xác nhận đồng bộ chi tiết DS đơn vay',
          message:
            'Hệ thống sẽ đọc output/loans/list_loan_all.txt, gọi API chi tiết theo loanId và customerPhoneNumber, sau đó ghi vào output/loans/list_loan_detail_all.txt. Bạn có chắc chắn muốn bắt đầu?',
        }
      : syncConfirmType === 'loan'
      ? {
          title: 'Xác nhận đồng bộ đơn vay',
          message:
            'Hệ thống sẽ gọi API đơn vay theo từng trang, đồng bộ tất cả sản phẩm và ghi dữ liệu vào output/loans/list_loan_all.txt. Bạn có chắc chắn muốn bắt đầu?',
        }
      : syncConfirmType === 'detail'
      ? {
          title: 'Xác nhận đồng bộ chi tiết DS user',
          message:
            'Hệ thống sẽ đọc file danh sách user mới nhất trong thư mục output/users và gọi API để lấy chi tiết từng user. Quá trình này có thể mất vài phút tùy số lượng user. Bạn có chắc chắn muốn tiếp tục không?',
        }
      : {
          title: 'Xác nhận đồng bộ DS User',
          message:
            'Hệ thống sẽ gọi API Tnex Partner để đồng bộ danh sách user theo từng trang và ghi file vào output/users. Bạn có chắc chắn muốn bắt đầu?',
        };
  const syncProgressTitle = (() => {
    if (syncJob?.status === 'COMPLETED') {
      if (isLoanDetailSyncJob) return 'Đồng bộ chi tiết DS đơn vay hoàn tất';
      if (isLoanSyncJob) return 'Đồng bộ đơn vay hoàn tất';
      return isDetailSyncJob ? 'Đồng bộ chi tiết DS user hoàn tất' : 'Đồng bộ DS user hoàn tất';
    }

    if (syncJob?.status === 'CANCELLED') return 'Đã hủy đồng bộ';
    if (syncJob?.status === 'PAUSED') return 'Đang tạm dừng đồng bộ';

    if (syncJob?.status === 'FAILED') {
      if (isLoanDetailSyncJob) return 'Đồng bộ chi tiết DS đơn vay thất bại';
      if (isLoanSyncJob) return 'Đồng bộ đơn vay thất bại';
      return isDetailSyncJob ? 'Đồng bộ chi tiết DS user thất bại' : 'Đồng bộ DS user thất bại';
    }

    if (isLoanDetailSyncJob) return 'Đang đồng bộ chi tiết DS đơn vay';
    if (isLoanSyncJob) return 'Đang đồng bộ đơn vay';
    return isDetailSyncJob ? 'Đang đồng bộ chi tiết DS user' : 'Đang đồng bộ DS user';
  })();

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
        const createdSegment = await createSegment(payload);
        closeModal();
        navigate(`/segments/${encodeURIComponent(createdSegment.id)}/users`, {
          state: {
            segment: createdSegment,
            segmentName: createdSegment.name,
            toastMessage: { type: 'success', text: 'Tạo segment thành công.' },
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

  const handleSyncAction = async (type) => {
    setSyncMenuOpen(false);

    if (isSyncRunning) {
      setToastMessage({
        type: 'error',
        text: 'Đang có tiến trình đồng bộ chạy. Vui lòng hoàn tất hoặc hủy trước khi chạy tiến trình mới.',
      });
      return;
    }

    setSyncConfirmType(type === 'loanDetail' ? 'loanDetail' : type === 'loan' ? 'loan' : type === 'detail' ? 'detail' : 'list');
    setSyncConfirmOpen(true);
  };

  const handleStartSyncUsers = async () => {
    if (isSyncRunning) {
      setToastMessage({
        type: 'error',
        text: 'Đang có tiến trình đồng bộ chạy. Vui lòng hoàn tất hoặc hủy trước khi chạy tiến trình mới.',
      });
      return;
    }

    const nextSyncType =
      syncConfirmType === 'loanDetail' ? 'loanDetail' : syncConfirmType === 'loan' ? 'loan' : syncConfirmType === 'detail' ? 'detail' : 'list';

    setSyncingAction(nextSyncType);

    try {
      const job =
        nextSyncType === 'loanDetail'
          ? await syncLoanDetailList()
          : nextSyncType === 'loan'
          ? await syncLoanList()
          : nextSyncType === 'detail'
          ? await syncUserDetailList()
          : await syncUserList();

      setSyncJob({
        ...job,
        type:
          job.type ||
          (nextSyncType === 'loanDetail' ? 'LOAN_DETAIL' : nextSyncType === 'loan' ? 'LOAN' : nextSyncType === 'detail' ? 'USER_DETAIL' : 'USER_LIST'),
        status: job.status || 'RUNNING',
        progress: job.progress || 0,
      });
      setSyncConfirmOpen(false);
      setToastMessage({
        type: 'success',
        text: getSyncToastText(job, 'started'),
      });
    } catch (syncError) {
      setToastMessage({
        type: 'error',
        text: getApiErrorMessage(
          syncError,
          nextSyncType === 'loanDetail'
            ? 'Không thể bắt đầu đồng bộ chi tiết DS đơn vay.'
            : nextSyncType === 'loan'
            ? 'Không thể bắt đầu đồng bộ đơn vay.'
            : nextSyncType === 'detail'
            ? 'Không thể bắt đầu đồng bộ chi tiết DS user.'
            : 'Không thể bắt đầu đồng bộ danh sách user.',
        ),
      });
    } finally {
      setSyncingAction('');
    }
  };

  const runSyncControl = async (action) => {
    if (!syncJob?.jobId || syncControlLoading) return;

    const serviceByAction = {
      pause: isLoanDetailSyncJob
        ? pauseSyncLoanDetailList
        : isLoanSyncJob
        ? pauseSyncLoanList
        : isDetailSyncJob
        ? pauseSyncUserDetailList
        : pauseSyncUserList,
      resume: isLoanDetailSyncJob
        ? resumeSyncLoanDetailList
        : isLoanSyncJob
        ? resumeSyncLoanList
        : isDetailSyncJob
        ? resumeSyncUserDetailList
        : resumeSyncUserList,
      cancel: isLoanDetailSyncJob
        ? cancelSyncLoanDetailList
        : isLoanSyncJob
        ? cancelSyncLoanList
        : isDetailSyncJob
        ? cancelSyncUserDetailList
        : cancelSyncUserList,
    };
    const nextService = serviceByAction[action];

    if (!nextService) return;

    setSyncControlLoading(action);

    try {
      const nextJob = await nextService(syncJob.jobId);
      const normalizedJob = nextJob.job ? nextJob.job : nextJob;

      setSyncJob(normalizedJob);

      if (action === 'pause') {
        setToastMessage({ type: 'warning', text: getSyncToastText(normalizedJob, 'paused') });
      }

      if (action === 'resume') {
        setToastMessage({ type: 'success', text: getSyncToastText(normalizedJob, 'resumed') });
      }

      if (action === 'cancel') {
        setCancelSyncConfirmOpen(false);
        setToastMessage({ type: 'warning', text: getSyncToastText(normalizedJob, 'cancelled') });
      }
    } catch (controlError) {
      setToastMessage({
        type: 'error',
        text: getApiErrorMessage(controlError, 'Không thể điều khiển tiến trình đồng bộ. Vui lòng thử lại.'),
      });
    } finally {
      setSyncControlLoading('');
    }
  };

  const handlePauseSync = () => runSyncControl('pause');
  const handleResumeSync = () => runSyncControl('resume');
  const handleCancelSync = () => runSyncControl('cancel');
  const requestCancelSync = () => setCancelSyncConfirmOpen(true);

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
            <div className="segment-sync-action">
              <button
                className="segment-sync-button ds-button ds-button-primary"
                type="button"
                onClick={() => setSyncMenuOpen((current) => !current)}
                disabled={isSyncRunning}
                aria-expanded={syncMenuOpen}
                aria-haspopup="menu"
              >
                {isSyncRunning ? 'Đang đồng bộ...' : 'Đồng bộ dữ liệu'}
                <span>v</span>
              </button>
              {syncMenuOpen ? (
                <div className="segment-sync-menu" role="menu">
                  <button type="button" onClick={() => handleSyncAction('list')} disabled={isSyncRunning}>
                    {isSyncRunning ? 'Đang đồng bộ DS user...' : 'Đồng bộ DS user'}
                  </button>
                  <button type="button" onClick={() => handleSyncAction('detail')} disabled={isSyncRunning}>
                    Đồng bộ chi tiết DS user
                  </button>
                  <button type="button" onClick={() => handleSyncAction('loan')} disabled={isSyncRunning}>
                    Đồng bộ đơn vay
                  </button>
                  <button type="button" onClick={() => handleSyncAction('loanDetail')} disabled={isSyncRunning}>
                    Đồng bộ chi tiết DS đơn vay
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {syncJob ? (
            <section className={`segment-sync-progress segment-sync-progress-${String(syncJob.status || 'running').toLowerCase()}`}>
              <div className="segment-sync-progress-header">
                <div>
                  <div className="segment-sync-title-row">
                    <h2>{syncProgressTitle}</h2>
                    <span>{getStatusLabel(syncJob.status)}</span>
                  </div>
                  <p>
                    {(syncJob.status === 'FAILED' ? syncJob.errorMessage || syncJob.currentMessage : syncJob.currentMessage || syncJob.errorMessage) ||
                      (isLoanDetailSyncJob
                        ? 'Hệ thống đang lấy chi tiết đơn vay theo từng record.'
                        : isLoanSyncJob
                        ? 'Hệ thống đang lấy dữ liệu đơn vay theo từng trang.'
                        : 'Hệ thống đang lấy dữ liệu user theo từng trang.')}
                  </p>
                  {(isDetailSyncJob || isLoanSyncJob || isLoanDetailSyncJob) && Number(syncJob.failedCount) > 0 ? (
                    <p className="segment-sync-warning">
                      Có {syncJob.failedCount} {isLoanDetailSyncJob ? 'đơn vay' : isLoanSyncJob ? 'page/record' : 'user'} lỗi, vui lòng kiểm tra failed file.
                    </p>
                  ) : null}
                </div>
                <strong>{syncProgress}%</strong>
              </div>
              <div className="segment-sync-progress-track" aria-hidden="true">
                <span style={{ width: `${syncProgress}%` }} />
              </div>
              <div className="segment-sync-metrics">
                {isLoanDetailSyncJob ? (
                  <>
                    <SyncMetric label="Tổng input loan" value={`${syncJob.totalInput || 0} loan`} />
                    <SyncMetric label="Đã có trong file tổng detail" value={syncJob.alreadyProcessed || 0} />
                    <SyncMetric label="Cần đồng bộ" value={syncJob.totalNeedSync || 0} />
                    <SyncMetric label="Đã xử lý" value={syncJob.done || 0} />
                    <SyncMetric label="Thành công" value={syncJob.successCount || 0} tone="success" />
                    <SyncMetric label="Lỗi" value={syncJob.failedCount || 0} tone={Number(syncJob.failedCount) > 0 ? 'warning' : ''} />
                    <SyncMetric label="Bỏ qua thiếu field" value={syncJob.skippedMissingCount || 0} tone={Number(syncJob.skippedMissingCount) > 0 ? 'warning' : ''} />
                    <SyncMetric label="Tổng trong file master" value={syncJob.totalInMaster || 0} />
                    <SyncMetric label="Tốc độ" value={`${syncJob.speed || 0} req/s`} />
                  </>
                ) : isLoanSyncJob ? (
                  <>
                    <SyncMetric label="Tổng đơn từ API" value={syncJob.totalFromApi ?? 0} />
                    <SyncMetric label="Đã xử lý" value={syncJob.processed || 0} />
                    <SyncMetric label="Thêm mới" value={syncJob.inserted || 0} tone="success" />
                    <SyncMetric label="Cập nhật/trùng" value={syncJob.updated || 0} />
                    <SyncMetric label="Lỗi" value={syncJob.failedCount || 0} tone={Number(syncJob.failedCount) > 0 ? 'warning' : ''} />
                    <SyncMetric label="Page hiện tại" value={loanPageText} />
                    <SyncMetric label="Tốc độ" value={`${syncJob.speed || 0} req/s`} />
                  </>
                ) : isDetailSyncJob ? (
                  <>
                    <SyncMetric label="Tổng input" value={`${syncJob.totalInput || 0} user`} />
                    <SyncMetric label="Đã có trong file tổng" value={syncJob.alreadyProcessed || 0} />
                    <SyncMetric label="Cần đồng bộ" value={syncJob.totalNeedSync || 0} />
                    <SyncMetric label="Đã xử lý" value={syncJob.done || 0} />
                    <SyncMetric label="Thành công" value={syncJob.successCount || 0} tone="success" />
                    <SyncMetric label="Lỗi" value={syncJob.failedCount || 0} tone={Number(syncJob.failedCount) > 0 ? 'warning' : ''} />
                    <SyncMetric label="Tốc độ" value={`${syncJob.speed || 0} req/s`} />
                  </>
                ) : (
                  <>
                    <SyncMetric label="Page hiện tại" value={syncJob.currentPage ?? '--'} />
                    <SyncMetric label="Đã ghi" value={`${syncJob.totalWritten || 0} user`} />
                  </>
                )}
              </div>
              <div className="segment-sync-files">
                {isLoanDetailSyncJob ? (
                  <>
                    <SyncFileItem label="Input file" value={syncJob.inputFile} />
                    <SyncFileItem label="File tổng" value={syncJob.masterFile} />
                    <SyncFileItem label="Snapshot file" value={syncJob.snapshotFile} />
                    <SyncFileItem label="Failed file" value={syncJob.failedFile} warning={Number(syncJob.failedCount) > 0 || Number(syncJob.skippedMissingCount) > 0} />
                  </>
                ) : isLoanSyncJob ? (
                  <>
                    <SyncFileItem label="File tổng" value={syncJob.masterFile} />
                    <SyncFileItem label="Snapshot file" value={syncJob.snapshotFile} />
                    <SyncFileItem label="Latest file" value={syncJob.latestFile} />
                    <SyncFileItem label="Failed file" value={syncJob.failedFile} warning={Number(syncJob.failedCount) > 0} />
                  </>
                ) : isDetailSyncJob ? (
                  <>
                    <SyncFileItem label="Input file" value={syncJob.inputFile} />
                    <SyncFileItem label="Master file" value={syncJob.masterFile} />
                    <SyncFileItem label="Snapshot file" value={syncJob.snapshotFile} />
                    <SyncFileItem label="Failed file" value={syncJob.failedFile} warning={Number(syncJob.failedCount) > 0} />
                  </>
                ) : (
                  <>
                    <SyncFileItem label="Output file" value={syncJob.outputFile} />
                    <SyncFileItem label="Latest file" value={syncJob.latestFile} />
                  </>
                )}
                <SyncFileItem label="Log file" value={syncJob.logFile} />
              </div>
              {isActiveSyncStatus(syncJob.status) ? (
                <div className="segment-sync-controls">
                  <button
                    className="segment-secondary-button ds-button ds-button-secondary"
                    type="button"
                    onClick={handlePauseSync}
                    disabled={!canPauseSync}
                  >
                    {syncControlLoading === 'pause' ? 'Đang tạm dừng...' : 'Tạm dừng đồng bộ'}
                  </button>
                  <button
                    className="segment-secondary-button ds-button ds-button-secondary"
                    type="button"
                    onClick={handleResumeSync}
                    disabled={!canResumeSync}
                  >
                    {syncControlLoading === 'resume' ? 'Đang tiếp tục...' : 'Tiếp tục đồng bộ'}
                  </button>
                  <button className="segment-danger-button" type="button" onClick={requestCancelSync} disabled={!canCancelSync}>
                    Hủy thao tác
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}

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

      <ConfirmDialog
        cancelText="Hủy"
        confirmText="Đồng bộ"
        loading={Boolean(syncingAction)}
        message={syncConfirmContent.message}
        open={syncConfirmOpen}
        title={syncConfirmContent.title}
        onCancel={() => setSyncConfirmOpen(false)}
        onConfirm={handleStartSyncUsers}
      />

      <ConfirmDialog
        cancelText="Không"
        confirmText="Hủy đồng bộ"
        loading={syncControlLoading === 'cancel'}
        message="Tiến trình đồng bộ hiện tại sẽ dừng lại. Các dữ liệu đã ghi file trước đó vẫn được giữ nguyên."
        open={cancelSyncConfirmOpen}
        title="Hủy đồng bộ?"
        variant="danger"
        onCancel={() => setCancelSyncConfirmOpen(false)}
        onConfirm={handleCancelSync}
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
