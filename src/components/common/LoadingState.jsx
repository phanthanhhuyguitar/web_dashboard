function LoadingState({ text = 'Đang tải dữ liệu...', className = 'state-message' }) {
  return (
    <div className={className}>
      <span className="ds-spinner" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

export default LoadingState;
