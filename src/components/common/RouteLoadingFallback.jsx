// Fallback hien khi 1 trang dang duoc tai qua React.lazy (xem AppRoutes.jsx) - dung lai class
// ".dashboard-loading" da co san (DashboardPage.jsx dung y het khi cho du lieu dashboard).
function RouteLoadingFallback() {
  return (
    <div className="dashboard-loading">
      <span />
      <p>Đang tải trang...</p>
    </div>
  );
}

export default RouteLoadingFallback;
