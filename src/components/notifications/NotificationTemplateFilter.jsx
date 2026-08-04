function NotificationTemplateFilter({ filters, loading, onChange, onCreate, onRefresh, onSearch }) {
  const handleFieldChange = (event) => {
    const { name, value } = event.target;

    onChange({
      ...filters,
      [name]: value,
    });
  };

  return (
    <section className="dashboard-card notification-filter-card">
      <div className="notification-filter-header">
        <div>
          <h2>Bộ lọc nội dung thông báo</h2>
          <p>Lọc theo ngày tạo template trước khi tìm kiếm.</p>
        </div>
      </div>

      <div className="notification-filter-grid">
        <label className="notification-field">
          <span>Từ ngày tạo</span>
          <input type="date" name="fromDate" value={filters.fromDate} onChange={handleFieldChange} />
        </label>

        <label className="notification-field">
          <span>Đến ngày tạo</span>
          <input type="date" name="toDate" value={filters.toDate} onChange={handleFieldChange} />
        </label>

        <div className="notification-filter-actions">
          <button className="notification-primary-button" type="button" onClick={onSearch} disabled={loading}>
            Tìm kiếm
          </button>
          <button className="notification-secondary-button" type="button" onClick={onRefresh} disabled={loading}>
            Làm mới
          </button>
        </div>
      </div>
    </section>
  );
}

export default NotificationTemplateFilter;
