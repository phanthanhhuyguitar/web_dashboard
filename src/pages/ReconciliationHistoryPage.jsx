import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { fetchAllReconciliationHistory, fetchReconciliationHistory } from '../api/reconciliationsApi.js';
import { fetchContractStatusBySaleId } from '../api/userContractStatusApi.js';
import { fetchUserDetailFieldsBySaleId } from '../api/userDetailFieldsApi.js';
import ConfirmDialog from '../components/common/ConfirmDialog.jsx';
import MonthPicker from '../components/common/MonthPicker.jsx';
import Sidebar from '../components/layout/Sidebar.jsx';
import Topbar from '../components/layout/Topbar.jsx';
import { formatDateTime } from '../utils/date.js';
import { exportReconciliationHistoryToExcel } from '../utils/reconciliationExport.js';
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

  const confirmExport = async () => {
    setExportModalOpen(false);
    setExporting(true);
    setExportProgress({
      status: 'RUNNING',
      fetchedCount: 0,
      totalElements,
      currentPage: 0,
      totalPages: 0,
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

      // Neu khong lay duoc (vd chua sync du lieu user) thi van xuat file binh thuong, chi thieu
      // cac cot bo sung nay - tranh lam gian doan ca tinh nang chi vi thieu du lieu enrich.
      const [contractStatusBySaleId, userDetailFieldsBySaleId] = await Promise.all([
        fetchContractStatusBySaleId().catch(() => ({})),
        fetchUserDetailFieldsBySaleId().catch(() => ({})),
      ]);

      await exportReconciliationHistoryToExcel({
        items: result.items,
        getStatusLabel,
        formatReportMonth,
        fileNameSuffix: filters.reportDate || undefined,
        contractStatusBySaleId,
        userDetailFieldsBySaleId,
      });

      setExportProgress((current) => ({ ...current, status: 'COMPLETED' }));
      setToastMessage({ type: 'success', text: `Đã xuất ${result.items.length} bản ghi ra file Excel.` });

      window.setTimeout(() => {
        setExportProgress(null);
      }, 2500);
    } catch (exportError) {
      setExportProgress((current) => ({ ...current, status: 'FAILED' }));
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
  const exportPercent = exportProgress?.totalElements
    ? Math.min(Math.round((exportProgress.fetchedCount / exportProgress.totalElements) * 100), 100)
    : 0;
  const exportProgressTitle =
    exportProgress?.status === 'COMPLETED'
      ? 'Xuất file Excel hoàn tất'
      : exportProgress?.status === 'FAILED'
        ? 'Xuất file Excel thất bại'
        : 'Đang xuất file Excel...';

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
                <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
                  {STATUS_OPTIONS.map((option) => (
                    <option value={option.value} key={option.value || 'ALL'}>
                      {option.label}
                    </option>
                  ))}
                </select>
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
                    <p>Hệ thống đang tải dữ liệu theo từng trang (50 bản ghi/lần) để tránh quá tải server.</p>
                  </div>
                  <strong>{exportPercent}%</strong>
                </div>
                <div className="segment-sync-progress-track" aria-hidden="true">
                  <span style={{ width: `${exportPercent}%` }} />
                </div>
                <div className="segment-sync-metrics">
                  <ExportMetric label="Đã tải" value={`${exportProgress.fetchedCount || 0} / ${exportProgress.totalElements || 0} bản ghi`} />
                  <ExportMetric label="Trang hiện tại" value={exportProgress.currentPage || 0} />
                </div>
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
