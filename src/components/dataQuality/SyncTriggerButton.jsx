// Nut "Dong bo du lieu" + dropdown chon loai job - phan hien thi cua useDataSyncPanel(), dat o
// heading row cua trang chua no.
function SyncTriggerButton({ isSyncRunning, syncMenuOpen, toggleSyncMenu, handleSyncAction }) {
  return (
    <div className="segment-sync-action">
      <button
        className="segment-sync-button ds-button ds-button-primary"
        type="button"
        onClick={toggleSyncMenu}
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
  );
}

export default SyncTriggerButton;
