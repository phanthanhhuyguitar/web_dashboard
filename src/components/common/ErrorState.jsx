function ErrorState({ text = 'Không tải được dữ liệu', className = 'state-message state-message--error' }) {
  return <div className={className}>{text}</div>;
}

export default ErrorState;
