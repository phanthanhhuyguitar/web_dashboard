import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Sidebar from '../components/layout/Sidebar.jsx';
import Topbar from '../components/layout/Topbar.jsx';
import NotificationTemplateFilter from '../components/notifications/NotificationTemplateFilter.jsx';
import NotificationTemplateModal from '../components/notifications/NotificationTemplateModal.jsx';
import NotificationTemplateTable from '../components/notifications/NotificationTemplateTable.jsx';
import { useNotificationTemplates } from '../hooks/useNotificationTemplates.js';
import { clearAccessToken } from '../utils/storage.js';

function NotificationTemplatesPage() {
  const navigate = useNavigate();
  const [modalState, setModalState] = useState({
    item: null,
    mode: 'create',
    open: false,
  });
  const {
    error,
    filteredItems,
    filters,
    goNextPage,
    goPreviousPage,
    hasActiveFilter,
    loading,
    page,
    refresh,
    refreshing,
    search,
    setFilters,
    clearSubmitStatus,
    createTemplate,
    updateTemplate,
    submitting,
    submitMessage,
    submitStatus,
    totalElements,
    totalPages,
  } = useNotificationTemplates();

  const handleLogout = () => {
    clearAccessToken();
    navigate('/login', { replace: true });
  };

  const openCreateModal = () => {
    clearSubmitStatus();
    setModalState({
      item: null,
      mode: 'create',
      open: true,
    });
  };

  const openEditModal = (item) => {
    clearSubmitStatus();
    setModalState({
      item,
      mode: 'edit',
      open: true,
    });
  };

  const closeModal = () => {
    clearSubmitStatus();
    setModalState((current) => ({
      ...current,
      open: false,
    }));
  };

  const handleModalSubmit = async (payload) => {
    const success = modalState.mode === 'create' ? await createTemplate(payload) : await updateTemplate(payload);

    if (success) {
      window.setTimeout(() => {
        closeModal();
      }, 800);
    }

    return success;
  };

  return (
    <div className="dashboard-shell">
      <Sidebar />

      <div className="dashboard-main">
        <Topbar
          breadcrumbs={['Hệ thống quản trị', 'Nội dung app', 'Nội dung thông báo']}
          isRefreshing={loading || refreshing}
          onLogout={handleLogout}
          onRefresh={refresh}
        />

        <main className="dashboard-content notification-page">
          <div className="dashboard-heading-row notification-heading-row">
            <div>
              <h1>Nội dung thông báo</h1>
              <p>Quản lý danh sách template thông báo hiển thị trên ứng dụng TNEX Partner.</p>
            </div>
          </div>

          <NotificationTemplateFilter
            filters={filters}
            loading={loading || refreshing}
            onChange={setFilters}
            onCreate={openCreateModal}
            onRefresh={refresh}
            onSearch={search}
          />

          <NotificationTemplateTable
            error={error}
            hasActiveFilter={hasActiveFilter}
            items={filteredItems}
            loading={loading}
            onCreate={openCreateModal}
            onEdit={openEditModal}
            onNext={goNextPage}
            onPrevious={goPreviousPage}
            page={page}
            totalElements={totalElements}
            totalPages={totalPages}
          />
        </main>
      </div>

      <NotificationTemplateModal
        initialData={modalState.item}
        mode={modalState.mode}
        onClearSubmitStatus={clearSubmitStatus}
        onClose={closeModal}
        onSubmit={handleModalSubmit}
        open={modalState.open}
        submitting={submitting}
      />

      {submitMessage ? (
        <div className={`notification-toast notification-toast-${submitStatus || 'loading'}`} role="status" aria-live="polite">
          <span>{submitMessage}</span>
          <button type="button" onClick={clearSubmitStatus} aria-label="Đóng thông báo">
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default NotificationTemplatesPage;
