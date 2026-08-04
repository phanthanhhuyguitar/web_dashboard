import { Component } from 'react';

// Bat loi render o bat ky component con nao (kе ca loi nho, khong lien quan network) de tranh
// trang trang xoa - hien man hinh thong bao + nut tai lai thay vi crash toan bo app.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, errorInfo);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="app-crash-screen">
        <div className="app-crash-card">
          <h1>Đã có lỗi xảy ra</h1>
          <p>Trang gặp sự cố ngoài dự kiến. Vui lòng tải lại trang - nếu lỗi vẫn tiếp diễn, hãy báo cho quản trị viên.</p>
          <button type="button" onClick={this.handleReload}>
            Tải lại trang
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
