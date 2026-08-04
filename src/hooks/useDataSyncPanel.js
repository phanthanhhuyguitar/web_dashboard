import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import {
  cancelSyncLoanDetailList,
  cancelSyncLoanList,
  cancelSyncUserDetailList,
  cancelSyncUserList,
  getCurrentSyncJob,
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
  syncLoanDetailList,
  syncLoanList,
  syncUserDetailList,
  syncUserList,
} from '../services/segmentLocalService.js';

const SYNC_POLL_INTERVAL_MS = 1000;

// Dung chung cho ca vong poll tien trinh lan hydrate tu thong bao (NotificationBell) - map
// dung API status theo tung loai job.
function getStatusFetcher(jobType) {
  if (jobType === 'LOAN_DETAIL') return getSyncLoanDetailListStatus;
  if (jobType === 'LOAN') return getSyncLoanListStatus;
  if (jobType === 'USER_DETAIL') return getSyncUserDetailListStatus;

  return getSyncUserListStatus;
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

function getSyncJobName(jobOrType) {
  const type = typeof jobOrType === 'string' ? jobOrType : jobOrType?.type;
  const labels = {
    USER_LIST: 'Đồng bộ DS user',
    USER_DETAIL: 'Đồng bộ chi tiết DS user',
    LOAN: 'Đồng bộ đơn vay',
    LOAN_DETAIL: 'Đồng bộ chi tiết DS đơn vay',
  };

  return labels[type] || 'Đồng bộ dữ liệu';
}

function normalizeSyncJob(job, fallbackType = 'USER_LIST') {
  if (!job) return null;

  return {
    ...job,
    type: job.type || fallbackType,
    status: job.status || 'RUNNING',
    progress: Number(job.progress) || 0,
    progressIndeterminate: Boolean(job.progressIndeterminate),
  };
}

export { getStatusLabel };

// Toan bo state/logic cua panel "Dong bo du lieu" (nut + dropdown + progress card + dialog xac
// nhan + toast) - tach thanh 1 hook dung chung de trang nao can cung mount deu duoc, khong phu
// thuoc vao state cua trang chua no (segment list, data quality checks, ...).
export function useDataSyncPanel() {
  const location = useLocation();
  const syncProgressRef = useRef(null);
  const pendingScrollRef = useRef(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [syncMenuOpen, setSyncMenuOpen] = useState(false);
  const [syncingAction, setSyncingAction] = useState('');
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const [syncConfirmType, setSyncConfirmType] = useState('list');
  const [syncJob, setSyncJob] = useState(null);
  const [cancelSyncConfirmOpen, setCancelSyncConfirmOpen] = useState(false);
  const [syncControlLoading, setSyncControlLoading] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadCurrentJob = async () => {
      try {
        const currentSyncJob = await getCurrentSyncJob();
        const normalizedJob = normalizeSyncJob(currentSyncJob);

        if (cancelled || !normalizedJob || !isActiveSyncStatus(normalizedJob.status)) return;

        setSyncJob(normalizedJob);
      } catch {
        // The progress card is a convenience; failing to hydrate it should not block the page.
      }
    };

    loadCurrentJob();

    return () => {
      cancelled = true;
    };
  }, []);

  // Duoc dieu huong toi tu NotificationBell (bam vao thong bao dong bo) - hydrate dung job do
  // (ke ca job dang chay thuoc nhom USER, vi getCurrentSyncJob() o tren chi bao phu nhom LOAN)
  // va cuon toi panel tien trinh. Dua vao location.key de van chay lai ke ca bam nhieu lan
  // thong bao khac nhau trong khi da dang dung san o trang nay (React Router doi key moi lan
  // navigate, ke ca navigate ve cung 1 route).
  useEffect(() => {
    const focusJobId = location.state?.focusJobId;
    const focusJobType = location.state?.focusJobType;

    if (!focusJobId) return undefined;

    let cancelled = false;

    (async () => {
      try {
        const requestStatus = getStatusFetcher(focusJobType);
        const job = await requestStatus(focusJobId);

        if (cancelled) return;

        setSyncJob(normalizeSyncJob(job, focusJobType));
        pendingScrollRef.current = true;
      } catch {
        // Job co the da xong tu lau va het trong bo nho server sau restart - bo qua yen lang.
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  // syncJob vua duoc set o effect tren la async (React batch) nen ref cua section chi gan sau khi
  // render xong - cuon o day (chay sau commit) thay vi ngay trong effect fetch, neu khong ref se
  // con null luc component moi mount lan dau (truong hop tu trang khac bam vao thong bao).
  useEffect(() => {
    if (pendingScrollRef.current && syncProgressRef.current) {
      syncProgressRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      pendingScrollRef.current = false;
    }
  }, [syncJob]);

  useEffect(() => {
    if (!syncJob?.jobId || !isActiveSyncStatus(syncJob.status)) return undefined;

    let cancelled = false;
    const pollStatus = async () => {
      try {
        const requestStatus = getStatusFetcher(syncJob.type);
        const nextJob = await requestStatus(syncJob.jobId);

        if (cancelled) return;

        setSyncJob(normalizeSyncJob(nextJob, syncJob.type));

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

  const syncConfirmContent = useMemo(() => {
    if (syncConfirmType === 'loanDetail') {
      return {
        title: 'Xác nhận đồng bộ chi tiết DS đơn vay',
        message:
          'Hệ thống sẽ đọc output/loans/list_loan_all.txt, gọi API chi tiết theo loanId và customerPhoneNumber, sau đó ghi vào output/loans/list_loan_detail_all.txt. Bạn có chắc chắn muốn bắt đầu?',
      };
    }

    if (syncConfirmType === 'loan') {
      return {
        title: 'Xác nhận đồng bộ đơn vay',
        message:
          'Hệ thống sẽ gọi API đơn vay theo từng trang, đồng bộ tất cả sản phẩm và ghi dữ liệu vào output/loans/list_loan_all.txt. Bạn có chắc chắn muốn bắt đầu?',
      };
    }

    if (syncConfirmType === 'detail') {
      return {
        title: 'Xác nhận đồng bộ chi tiết DS user',
        message:
          'Hệ thống sẽ đọc file danh sách user mới nhất trong thư mục output/users và gọi API để lấy chi tiết từng user. Quá trình này có thể mất vài phút tùy số lượng user. Bạn có chắc chắn muốn tiếp tục không?',
      };
    }

    return {
      title: 'Xác nhận đồng bộ DS User',
      message: 'Hệ thống sẽ gọi API Tnex Partner để đồng bộ danh sách user theo từng trang và ghi file vào output/users. Bạn có chắc chắn muốn bắt đầu?',
    };
  }, [syncConfirmType]);

  const syncProgressTitle = useMemo(() => {
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
  }, [syncJob?.status, isLoanDetailSyncJob, isLoanSyncJob, isDetailSyncJob]);

  const handleSyncAction = (type) => {
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

      const fallbackJobType =
        nextSyncType === 'loanDetail' ? 'LOAN_DETAIL' : nextSyncType === 'loan' ? 'LOAN' : nextSyncType === 'detail' ? 'USER_DETAIL' : 'USER_LIST';
      setSyncJob(normalizeSyncJob(job, fallbackJobType));
      setSyncConfirmOpen(false);
      setToastMessage({
        type: 'success',
        text: getSyncToastText(job, 'started'),
      });
      // Bao chuong thong bao lam moi ngay - khong doi den vong poll dinh ky (15s) moi thay
      // thong bao "Bat dau dong bo" ma server vua tao.
      window.dispatchEvent(new Event('tnex:notifications-refresh'));
    } catch (syncError) {
      const activeJob = normalizeSyncJob(syncError?.response?.data?.job);

      if (activeJob && isActiveSyncStatus(activeJob.status)) {
        setSyncJob(activeJob);
      }

      setToastMessage({
        type: 'error',
        text: activeJob
          ? `Đang chạy: ${getSyncJobName(activeJob)}. Progress đã được mở lại bên dưới.`
          : getApiErrorMessage(
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

      setSyncJob(normalizeSyncJob(normalizedJob, syncJob.type));

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
  const toggleSyncMenu = () => setSyncMenuOpen((current) => !current);

  return {
    syncProgressRef,
    toastMessage,
    setToastMessage,
    syncMenuOpen,
    toggleSyncMenu,
    syncingAction,
    syncConfirmOpen,
    setSyncConfirmOpen,
    syncJob,
    cancelSyncConfirmOpen,
    setCancelSyncConfirmOpen,
    syncControlLoading,
    isSyncRunning,
    isSyncPaused,
    canPauseSync,
    canResumeSync,
    canCancelSync,
    syncProgress,
    isDetailSyncJob,
    isLoanSyncJob,
    isLoanDetailSyncJob,
    loanPageText,
    syncConfirmContent,
    syncProgressTitle,
    handleSyncAction,
    handleStartSyncUsers,
    handlePauseSync,
    handleResumeSync,
    handleCancelSync,
    requestCancelSync,
    isActiveSyncStatus,
    getStatusLabel,
  };
}
