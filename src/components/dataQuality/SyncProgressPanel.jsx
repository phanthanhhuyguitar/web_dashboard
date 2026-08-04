import ConfirmDialog from '../common/ConfirmDialog.jsx';

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

// Card tien trinh + 2 dialog xac nhan (bat dau / huy) + toast - phan hien thi cua
// useDataSyncPanel(). Tu render rong (null) khi chua co syncJob nao dang mo.
function SyncProgressPanel({
  syncProgressRef,
  syncJob,
  syncProgressTitle,
  getStatusLabel,
  isLoanDetailSyncJob,
  isLoanSyncJob,
  isDetailSyncJob,
  syncProgress,
  loanPageText,
  isActiveSyncStatus,
  canPauseSync,
  canResumeSync,
  canCancelSync,
  syncControlLoading,
  handlePauseSync,
  handleResumeSync,
  requestCancelSync,
  syncConfirmOpen,
  syncConfirmContent,
  syncingAction,
  setSyncConfirmOpen,
  handleStartSyncUsers,
  cancelSyncConfirmOpen,
  setCancelSyncConfirmOpen,
  handleCancelSync,
  toastMessage,
  setToastMessage,
}) {
  return (
    <>
      {syncJob ? (
        <section
          ref={syncProgressRef}
          className={`segment-sync-progress segment-sync-progress-${String(syncJob.status || 'running').toLowerCase()}`}
        >
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
                <SyncMetric label="Tổng đơn từ API" value={syncJob.totalFromApi ? syncJob.totalFromApi : 'Chưa xác định'} />
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
    </>
  );
}

export default SyncProgressPanel;
