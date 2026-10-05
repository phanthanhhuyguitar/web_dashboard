import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { fetchAllReconciliationHistory, fetchReconciliationHistory } from '../api/reconciliationsApi.js';
import { fetchUserIdBySaleId, fetchUserProfileById } from '../api/usersApi.js';
import ConfirmDialog from '../components/common/ConfirmDialog.jsx';
import MonthPicker from '../components/common/MonthPicker.jsx';
import ThemedSelect from '../components/common/ThemedSelect.jsx';
import Sidebar from '../components/layout/Sidebar.jsx';
import Topbar from '../components/layout/Topbar.jsx';
import { useAppSettings } from '../context/AppSettingsContext.jsx';
import { formatDateTime } from '../utils/date.js';
import { exportReconciliationHistoryToExcel } from '../utils/reconciliationExport.js';
import { runRateLimitedQueue } from '../utils/rateLimitedQueue.js';
import { clearAccessToken } from '../utils/storage.js';

const PAGE_SIZE = 10;

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'FILE_CREATED', label: 'Đã tạo' },
  { value: 'PAYMENT_CONFIRMED', label: 'Đã xác nhận' },
  { value: 'UPDATED_SUCCESS', label: 'Đã cập nhật' },
  { value: 'AUTO_CONFIRMED', label: 'Tự động xác nhận' },
];

const STATUS_LABELS = {
  FILE_CREATED: 'Đã tạo',
  PAYMENT_CONFIRMED: 'Đã xác nhận',
  UPDATED_SUCCESS: 'Đã cập nhật',
  AUTO_CONFIRMED: 'Tự động xác nhận',
};

const STATUS_BADGE_CLASSES = {
  FILE_CREATED: 'recon-status-created',
  PAYMENT_CONFIRMED: 'recon-status-confirmed',
  UPDATED_SUCCESS: 'recon-status-updated',
  AUTO_CONFIRMED: 'recon-status-auto-confirmed',
};

function getPreviousMonthValue() {
  const now = new Date();
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  return `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}`;
}

const DEFAULT_FILTERS = {
  saleId: '',
  reportDate: getPreviousMonthValue(),
  status: '',
};

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

function getApiErrorMessage(error, fallback) {
  return error?.response?.data?.message || error?.response?.data?.error || error?.message || fallback;
}

function formatReportMonth(reportDate) {
  const match = String(reportDate || '').match(/^(\d{4})-(\d{2})/);

  if (!match) return reportDate || '--';

  return `Tháng ${Number(match[2])}/${match[1]}`;
}

function getStatusLabel(status) {
  return STATUS_LABELS[status] || status || '--';
}

function StatusBadge({ status }) {
  const badgeClass = STATUS_BADGE_CLASSES[status] || 'recon-status-default';

  return <span className={`recon-status-badge ${badgeClass}`}>{getStatusLabel(status)}</span>;
}

function ExportMetric({ label, value }) {
  return (
    <div className="segment-sync-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReconciliationHistoryPage() {
  const navigate = useNavigate();
  const { settings } = useAppSettings();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  // Doc trong worker cua runRateLimitedQueue (dang chay ben trong 1 Promise cu) - phai dung ref,
  // state React thuong se bi "dong bang" gia tri cu do closure, khong thay duoc lan bam nut sau.
  const exportPausedRef = useRef(false);
  const exportCancelledRef = useRef(false);

  const runSearch = async (nextPage = 1) => {
    setLoading(true);
    setError('');

    try {
      const result = await fetchReconciliationHistory({
        saleId: filters.saleId.trim(),
        reportDate: filters.reportDate,
        status: filters.status,
        page: nextPage - 1,
        size: PAGE_SIZE,
      });

      setItems(result.items);
      setPage(nextPage);
      setTotalPages(result.totalPages);
      setTotalElements(result.totalElements);
    } catch (requestError) {
      setItems([]);
      setTotalPages(1);
      setTotalElements(0);
      setError(getApiErrorMessage(requestError, 'Không thể tải lịch sử đối soát. Vui lòng thử lại.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runSearch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateFilter = (name, value) => {
    setFilters((current) => ({ ...current, [name]: value }));
  };

  const applyFilters = () => {
    runSearch(1);
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    runSearch(1);
  };

  const handleLogout = () => {
    clearAccessToken();
    navigate('/login', { replace: true });
  };

  const goToPage = (nextPage) => {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) return;

    runSearch(nextPage);
  };

  const openExportModal = () => {
    if (exporting || totalElements === 0) return;

    setExportModalOpen(true);
  };

  const closeExportModal = () => {
    if (exporting) return;

    setExportModalOpen(false);
  };

  const handleTogglePauseExport = () => {
    exportPausedRef.current = !exportPausedRef.current;
    setExportProgress((current) => (current ? { ...current, status: exportPausedRef.current ? 'PAUSED' : 'RUNNING' } : current));
  };

  const handleCancelExport = () => {
    exportCancelledRef.current = true;
    exportPausedRef.current = false;
    setExportProgress((current) => (current ? { ...current, status: 'RUNNING', cancelling: true } : current));
  };

  const confirmExport = async () => {
    setExportModalOpen(false);
    setExporting(true);
    exportPausedRef.current = false;
    exportCancelledRef.current = false;
    setExportProgress({
      phase: 'FETCH',
      status: 'RUNNING',
      fetchedCount: 0,
      totalElements,
      currentPage: 0,
      totalPages: 0,
      enrichedCount: 0,
      enrichTotal: 0,
    });

    try {
      const result = await fetchAllReconciliationHistory(
        {
          saleId: filters.saleId.trim(),
          reportDate: filters.reportDate,
          status: filters.status,
        },
        {
          onProgress: (progress) => {
            setExportProgress((current) => ({ ...current, ...progress, status: 'RUNNING' }));
          },
        },
      );

      if (exportCancelledRef.current) {
        setExportProgress(null);
        setToastMessage({ type: 'warning', text: 'Đã dừng xuất file theo yêu cầu.' });
        return;
      }

      // Tra thong tin CTV (so tai khoan, CCCD, trang thai hop dong) TRUC TIEP tu API that theo
      // saleId -> userId -> profile, KHONG dung du lieu dong bo local - tranh rui ro mã sale da
      // doi sang nguoi khac ma local chua kip cap nhat (lay nham so tai khoan chuyen tien).
      const uniqueSaleIds = Array.from(new Set(result.items.map((item) => item.saleId).filter(Boolean)));
      const contractStatusBySaleId = {};
      const userDetailFieldsBySaleId = {};

      if (uniqueSaleIds.length > 0) {
        setExportProgress((current) => ({
          ...current,
          phase: 'ENRICH',
          status: 'RUNNING',
          enrichedCount: 0,
          enrichTotal: uniqueSaleIds.length,
        }));

        const enrichResults = await runRateLimitedQueue(uniqueSaleIds, {
          concurrency: settings.exportEnrichConcurrency,
          delayMs: settings.exportEnrichDelayMs,
          isPaused: () => exportPausedRef.current,
          isCancelled: () => exportCancelledRef.current,
          onProgress: (done, total) => {
            setExportProgress((current) => (current ? { ...current, enrichedCount: done, enrichTotal: total } : current));
          },
          taskFn: async (saleId) => {
            // QUAN TRONG: phan biet ro "khong tra duoc user" (loi tim kiem/khong khop) voi
            // "tra duoc user nhung chua ky hop dong" - 2 truong hop nay KHONG duoc hien thi
            // giong nhau, neu khong se khong biet duoc khi nao du lieu dang sai do loi tra cuu.
            const idInfo = await fetchUserIdBySaleId(saleId).catch(() => null);

            if (!idInfo?.userId) {
              return { saleId, lookupFailed: true, contractStatus: null, bankAccountNumber: '', identityNumber: '' };
            }

            const profile = await fetchUserProfileById(idInfo.userId).catch(() => null);

            return {
              saleId,
              lookupFailed: false,
              profileFailed: !profile,
              contractStatus: idInfo.contractStatus,
              bankAccountNumber: profile?.bankAccountNumber || '',
              identityNumber: profile?.identityNumber || '',
            };
          },
        });

        enrichResults.forEach(({ value }) => {
          if (!value) return;

          if (value.lookupFailed) {
            contractStatusBySaleId[value.saleId] = 'LOOKUP_FAILED';
            userDetailFieldsBySaleId[value.saleId] = { bankAccountNumber: 'Không tra được', identityNumber: 'Không tra được' };
            return;
          }

          contractStatusBySaleId[value.saleId] = value.contractStatus || 'NOT_SIGNED';
          userDetailFieldsBySaleId[value.saleId] = {
            bankAccountNumber: value.profileFailed ? 'Lỗi tra cứu' : value.bankAccountNumber,
            identityNumber: value.profileFailed ? 'Lỗi tra cứu' : value.identityNumber,
          };
        });
      }

      if (exportCancelledRef.current) {
        setExportProgress(null);
        setToastMessage({
          type: 'warning',
          text: `Đã dừng xuất file theo yêu cầu - chưa tạo file Excel (đã tra được ${Object.keys(userDetailFieldsBySaleId).length}/${uniqueSaleIds.length} CTV).`,
        });
        return;
      }

      setExportProgress((current) => (current ? { ...current, phase: 'BUILD', status: 'RUNNING' } : current));

      await exportReconciliationHistoryToExcel({
        items: result.items,
        getStatusLabel,
        formatReportMonth,
        fileNameSuffix: filters.reportDate || undefined,
        contractStatusBySaleId,
        userDetailFieldsBySaleId,
      });

      setExportProgress((current) => (current ? { ...current, status: 'COMPLETED' } : current));
      setToastMessage({ type: 'success', text: `Đã xuất ${result.items.length} bản ghi ra file Excel.` });

      window.setTimeout(() => {
        setExportProgress(null);
      }, 2500);
    } catch (exportError) {
      setExportProgress((current) => (current ? { ...current, status: 'FAILED' } : current));
      setToastMessage({
        type: 'error',
        text: getApiErrorMessage(exportError, 'Xuất file Excel thất bại. Vui lòng thử lại.'),
      });
    } finally {
      setExporting(false);
    }
  };

  const paginationItems = getPaginationItems(page, totalPages);
  const totalElementsLabel = totalElements.toLocaleString('vi-VN');
  const isEnrichPhase = exportProgress?.phase === 'ENRICH';
  const exportPercent = isEnrichPhase
    ? exportProgress?.enrichTotal
      ? Math.min(Math.round((exportProgress.enrichedCount / exportProgress.enrichTotal) * 100), 100)
      : 0
    : exportProgress?.totalElements
      ? Math.min(Math.round((exportProgress.fetchedCount / exportProgress.totalElements) * 100), 100)
      : 0;
  const exportProgressTitle =
    exportProgress?.status === 'COMPLETED'
      ? 'Xuất file Excel hoàn tất'
      : exportProgress?.status === 'FAILED'
        ? 'Xuất file Excel thất bại'
        : exportProgress?.status === 'PAUSED'
          ? 'Đã tạm dừng tra cứu CTV'
          : exportProgress?.cancelling
            ? 'Đang dừng lại...'
            : isEnrichPhase
              ? 'Đang tra cứu thông tin CTV (API thật)...'
              : exportProgress?.phase === 'BUILD'
                ? 'Đang tạo file Excel...'
                : 'Đang tải dữ liệu đối soát...';
  // Nut Tam dung/Dung lai chi hien o pha tra cuu CTV - day la pha goi API that theo tung nguoi,
  // noi nguoi dung can chu dong can thiep neu thay bat thuong (khac pha tai danh sach doi soat
  // ban dau, von da an toan tu truoc).
  const showEnrichControls = exporting && isEnrichPhase && !['COMPLETED', 'FAILED'].includes(exportProgress?.status);

  return (
    <div className="dashboard-shell">
      <Sidebar />
      <div className="dashboard-main">
        <Topbar
          breadcrumbs={['Hệ thống quản trị', 'Quản lý đối soát', 'Lịch sử đối soát']}
          isRefreshing={loading}
          onLogout={handleLogout}
          onRefresh={() => runSearch(page)}
        />

        <main className="dashboard-content segment-page">
          <div className="dashboard-heading-row">
            <div>
              <h1>Lịch sử đối soát</h1>
              <p>Theo dõi kết quả đối soát hoa hồng theo mã sale và tháng đối soát.</p>
            </div>
          </div>

          <section className="segment-filter-card">
            <div className="segment-card-header">
              <h2>Bộ lọc</h2>
            </div>
            <div className="recon-filter-grid">
              <label className="segment-field">
                <span>Nhập mã sale</span>
                <input
                  type="text"
                  value={filters.saleId}
                  onChange={(event) => updateFilter('saleId', event.target.value)}
                  placeholder="Nhập mã sale"
                />
              </label>
              <label className="segment-field">
                <span>Tháng</span>
                <div className="recon-month-picker">
                  <MonthPicker
                    value={filters.reportDate}
                    onChange={(value) => updateFilter('reportDate', value)}
                    label={filters.reportDate ? formatReportMonth(filters.reportDate) : ''}
                    placeholder="Chọn tháng đối soát"
                    ariaLabel="Chọn tháng đối soát"
                  />
                </div>
              </label>
              <label className="segment-field">
                <span>Trạng thái</span>
                <ThemedSelect
                  value={filters.status}
                  options={STATUS_OPTIONS}
                  onChange={(event) => updateFilter('status', event.target.value)}
                />
              </label>
            </div>
            <div className="segment-filter-actions">
              <button className="segment-primary-button ds-button ds-button-primary" type="button" onClick={applyFilters} disabled={loading}>
                Áp dụng
              </button>
              <button className="segment-secondary-button ds-button ds-button-secondary" type="button" onClick={resetFilters} disabled={loading}>
                Đặt lại
              </button>
            </div>
          </section>

          <section className="segment-table-card">
            <div className="segment-card-header segment-table-header">
              <div>
                <h2>Danh sách đối soát</h2>
                <p>Kết quả đối soát theo bộ lọc hiện tại.</p>
              </div>
              <button
                className="segment-primary-button ds-button ds-button-primary"
                type="button"
                onClick={openExportModal}
                disabled={exporting || loading || totalElements === 0}
              >
                {exporting ? 'Đang xuất...' : 'Xuất file'}
              </button>
            </div>

            {exportProgress ? (
              <section className={`segment-sync-progress segment-sync-progress-${String(exportProgress.status || 'running').toLowerCase()}`}>
                <div className="segment-sync-progress-header">
                  <div>
                    <div className="segment-sync-title-row">
                      <h2>{exportProgressTitle}</h2>
                    </div>
                    <p>
                      {isEnrichPhase
                        ? 'Đang gọi API thật lấy thông tin từng CTV (không dùng dữ liệu đồng bộ local) - có thể tạm dừng hoặc dừng hẳn bất kỳ lúc nào.'
                        : exportProgress.phase === 'BUILD'
                          ? 'Đang dựng file Excel trên trình duyệt.'
                          : 'Hệ thống đang tải dữ liệu theo từng trang (50 bản ghi/lần) để tránh quá tải server.'}
                    </p>
                  </div>
                  <strong>{exportPercent}%</strong>
                </div>
                <div className="segment-sync-progress-track" aria-hidden="true">
                  <span style={{ width: `${exportPercent}%` }} />
                </div>
                <div className="segment-sync-metrics">
                  {isEnrichPhase ? (
                    <>
                      <ExportMetric label="Đã tra cứu CTV" value={`${exportProgress.enrichedCount || 0} / ${exportProgress.enrichTotal || 0}`} />
                      <ExportMetric label="Số luồng" value={settings.exportEnrichConcurrency} />
                      <ExportMetric label="Delay/luồng" value={`${settings.exportEnrichDelayMs}ms`} />
                    </>
                  ) : (
                    <>
                      <ExportMetric label="Đã tải" value={`${exportProgress.fetchedCount || 0} / ${exportProgress.totalElements || 0} bản ghi`} />
                      <ExportMetric label="Trang hiện tại" value={exportProgress.currentPage || 0} />
                    </>
                  )}
                </div>

                {showEnrichControls ? (
                  <div className="segment-sync-controls">
                    <button
                      className="segment-secondary-button ds-button ds-button-secondary"
                      type="button"
                      onClick={handleTogglePauseExport}
                    >
                      {exportProgress.status === 'PAUSED' ? 'Tiếp tục tra cứu' : 'Tạm dừng tra cứu'}
                    </button>
                    <button className="segment-danger-button" type="button" onClick={handleCancelExport} disabled={exportProgress.cancelling}>
                      {exportProgress.cancelling ? 'Đang dừng...' : 'Dừng lại'}
                    </button>
                  </div>
                ) : null}
              </section>
            ) : null}

            <div className="segment-table-wrap">
              <table className="segment-table recon-history-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Mã sale</th>
                    <th>Tháng đối soát</th>
                    <th>File</th>
                    <th>Trạng thái</th>
                    <th>Ngày tạo</th>
                    <th>Ngày cập nhật</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td className="segment-table-state" colSpan={7}>
                        Đang tải dữ liệu...
                      </td>
                    </tr>
                  ) : null}

                  {!loading && error ? (
                    <tr>
                      <td className="segment-table-state segment-table-error" colSpan={7}>
                        {error}
                      </td>
                    </tr>
                  ) : null}

                  {!loading && !error && items.length === 0 ? (
                    <tr>
                      <td className="segment-table-state" colSpan={7}>
                        Không tìm thấy bản ghi đối soát phù hợp.
                      </td>
                    </tr>
                  ) : null}

                  {!loading && !error
                    ? items.map((item, index) => (
                        <tr key={item.paymentId || index}>
                          <td>{(page - 1) * PAGE_SIZE + index + 1}</td>
                          <td>{item.saleId || '--'}</td>
                          <td>{formatReportMonth(item.reportDate)}</td>
                          <td>
                            {item.reconciliationFile ? (
                              <a href={item.reconciliationFile} target="_blank" rel="noopener noreferrer">
                                File đối soát
                              </a>
                            ) : (
                              '--'
                            )}
                          </td>
                          <td>
                            <StatusBadge status={item.status} />
                          </td>
                          <td>{formatDateTime(item.createdAt)}</td>
                          <td>{formatDateTime(item.updatedAt)}</td>
                        </tr>
                      ))
                    : null}
                </tbody>
              </table>
            </div>

            <div className="segment-pagination">
              <span>Tổng số {totalElementsLabel} bản ghi</span>
              <div className="segment-page-buttons">
                <button type="button" onClick={() => goToPage(page - 1)} disabled={page <= 1 || loading}>
                  ← Trước
                </button>
                {paginationItems.map((item) =>
                  typeof item === 'number' ? (
                    <button
                      className={`segment-page-number${item === page ? ' is-active' : ''}`}
                      type="button"
                      onClick={() => goToPage(item)}
                      disabled={loading || item === page}
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
                <button type="button" onClick={() => goToPage(page + 1)} disabled={page >= totalPages || loading}>
                  Sau →
                </button>
              </div>
            </div>
          </section>
        </main>

        <ConfirmDialog
          open={exportModalOpen}
          title="Xuất file Excel"
          message={`Xuất toàn bộ ${totalElementsLabel} bản ghi đối soát theo bộ lọc hiện tại ra file Excel?`}
          confirmText="Xuất file"
          cancelText="Hủy"
          loading={exporting}
          onConfirm={confirmExport}
          onCancel={closeExportModal}
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
    </div>
  );
}

export default ReconciliationHistoryPage;
