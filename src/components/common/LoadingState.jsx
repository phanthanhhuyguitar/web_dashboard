function LoadingState({ text = 'Đang tải dữ liệu...', className = 'state-message' }) {
  return <div className={className}>{text}</div>;
}

export default LoadingState;
