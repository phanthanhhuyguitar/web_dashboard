function ConfirmDialog({ cancelText, confirmText, loading, message, onCancel, onConfirm, open, title, variant = 'primary' }) {
  if (!open) return null;

  return (
    <div className="confirm-dialog-backdrop" role="presentation">
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{message}</p>

        <div className="confirm-dialog-actions">
          <button className="notification-secondary-button" type="button" onClick={onCancel} disabled={loading}>
            {cancelText}
          </button>
          <button
            className={`notification-primary-button${variant === 'danger' ? ' notification-danger-button' : ''}`}
            type="button"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Đang xử lý...' : confirmText}
          </button>
        </div>
      </section>
    </div>
  );
}

export default ConfirmDialog;
