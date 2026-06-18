export function getSafeErrorMessage(error, fallbackMessage = 'Có lỗi xảy ra, vui lòng thử lại sau.') {
  const status = error?.response?.status;

  if (status === 401 || status === 403) {
    return 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.';
  }

  if (status >= 500) {
    return 'Hệ thống đang gián đoạn, vui lòng thử lại sau.';
  }

  return fallbackMessage;
}

export function getNotificationTemplateCreateErrorMessage(error) {
  const status = error?.response?.status;

  if (status === 400 || status === 409) {
    return 'Mã thông báo đã tồn tại hoặc dữ liệu không hợp lệ. Vui lòng kiểm tra lại.';
  }

  if (status === 401 || status === 403) {
    return 'Phiên đăng nhập đã hết hạn hoặc bạn không có quyền thực hiện thao tác này.';
  }

  if (status >= 500) {
    return 'Hệ thống đang gián đoạn, vui lòng thử lại sau.';
  }

  return 'Thêm mới nội dung thông báo thất bại. Vui lòng thử lại.';
}

export function getNotificationTemplateUpdateErrorMessage(error) {
  const status = error?.response?.status;

  if (status === 400 || status === 409) {
    return 'Mã thông báo đã tồn tại hoặc dữ liệu không hợp lệ. Vui lòng kiểm tra lại.';
  }

  if (status === 401 || status === 403) {
    return 'Phiên đăng nhập đã hết hạn hoặc bạn không có quyền thực hiện thao tác này.';
  }

  if (status === 404) {
    return 'Không tìm thấy nội dung thông báo cần chỉnh sửa.';
  }

  if (status >= 500) {
    return 'Hệ thống đang gián đoạn, vui lòng thử lại sau.';
  }

  return 'Cập nhật nội dung thông báo thất bại. Vui lòng thử lại.';
}
