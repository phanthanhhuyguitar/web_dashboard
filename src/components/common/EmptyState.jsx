function EmptyState({ text = 'Không có dữ liệu', className = 'state-message state-message--empty' }) {
  return <div className={className}>{text}</div>;
}

export default EmptyState;
