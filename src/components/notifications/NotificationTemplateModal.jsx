import { useEffect, useState } from 'react';

import ConfirmDialog from '../common/ConfirmDialog.jsx';

const emptyForm = {
  id: '',
  code: '',
  titleTemplate: '',
  bodyTemplate: '',
};
const CREATE_PRODUCTION_WARNING =
  'Lưu ý: Nội dung thông báo sau khi tạo sẽ được ghi nhận trên hệ thống production. Vui lòng kiểm tra kỹ trước khi xác nhận.';
const EDIT_PRODUCTION_WARNING =
  'Lưu ý: Thay đổi nội dung thông báo sẽ được cập nhật trên hệ thống production. Vui lòng kiểm tra kỹ trước khi xác nhận.';
const CREATE_CONFIRM_MESSAGE =
  'Dữ liệu sẽ được tạo trên hệ thống production. Vui lòng kiểm tra kỹ mã thông báo, tiêu đề và nội dung trước khi xác nhận.';
const EDIT_CONFIRM_MESSAGE =
  'Thay đổi sẽ được cập nhật trên hệ thống production. Vui lòng kiểm tra kỹ mã thông báo, tiêu đề và nội dung trước khi xác nhận.';

function buildInitialForm(initialData) {
  return {
    id: initialData?.id ?? initialData?.templateId ?? '',
    code: initialData?.code ?? initialData?.templateCode ?? '',
    titleTemplate: initialData?.titleTemplate ?? '',
    bodyTemplate: initialData?.bodyTemplate ?? '',
  };
}

function validateForm(form, isCreateMode) {
  const nextErrors = {};

  if (!isCreateMode && !String(form.id).trim()) {
    nextErrors.id = 'Không xác định được nội dung thông báo cần chỉnh sửa';
  }

  if (!form.code.trim()) nextErrors.code = 'Vui lòng nhập mã thông báo';
  if (!form.titleTemplate.trim()) nextErrors.titleTemplate = 'Vui lòng nhập tiêu đề thông báo';
  if (!form.bodyTemplate.trim()) nextErrors.bodyTemplate = 'Vui lòng nhập nội dung thông báo';

  return nextErrors;
}

function getConfirmCopy(isCreateMode) {
  if (isCreateMode) {
    return {
      confirmText: 'Xác nhận thêm mới',
      message: CREATE_CONFIRM_MESSAGE,
      title: 'Xác nhận thêm mới nội dung thông báo?',
    };
  }

  return {
    confirmText: 'Xác nhận chỉnh sửa',
    message: EDIT_CONFIRM_MESSAGE,
    title: 'Xác nhận chỉnh sửa nội dung thông báo?',
  };
}

function NotificationTemplateModal({
  initialData,
  mode,
  onClearSubmitStatus,
  onClose,
  onSubmit,
  open,
  submitting,
}) {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const isCreateMode = mode === 'create';
  const confirmCopy = getConfirmCopy(isCreateMode);

  useEffect(() => {
    if (!open) return;

    setForm(buildInitialForm(initialData));
    setErrors({});
    setIsConfirmOpen(false);
  }, [initialData, open]);

  if (!open) return null;

  const handleFieldChange = (event) => {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
    setErrors((current) => ({
      ...current,
      [name]: '',
    }));
    onClearSubmitStatus?.();
  };

  const preventEnterSubmit = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
    }
  };

  const handleSave = () => {
    if (submitting) return;

    const nextErrors = validateForm(form, isCreateMode);

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    setIsConfirmOpen(true);
  };

  const handleConfirmSubmit = async () => {
    if (submitting) return;

    const payload = {
      code: form.code.trim(),
      titleTemplate: form.titleTemplate.trim(),
      bodyTemplate: form.bodyTemplate,
    };

    if (!isCreateMode) {
      payload.id = form.id;
    }

    const success = await onSubmit(payload);

    if (success) {
      setIsConfirmOpen(false);
      if (isCreateMode) {
        setForm(emptyForm);
      }
    }
  };

  const handleCancelConfirm = () => {
    if (submitting) return;

    setIsConfirmOpen(false);
  };

  return (
    <div className="notification-modal-backdrop" role="presentation">
      <section className="notification-modal" role="dialog" aria-modal="true" aria-labelledby="notification-modal-title">
        <div className="notification-modal-header">
          <div>
            <h2 id="notification-modal-title">
              {isCreateMode ? 'Tạo nội dung thông báo' : 'Chỉnh sửa nội dung thông báo'}
            </h2>
            <p>Thông tin template sẽ được dùng cho nội dung hiển thị trên app.</p>
          </div>
          <button className="notification-icon-button" type="button" onClick={onClose} aria-label="Đóng" disabled={submitting}>
            ×
          </button>
        </div>

        <div className="notification-production-warning">
          {isCreateMode ? CREATE_PRODUCTION_WARNING : EDIT_PRODUCTION_WARNING}
        </div>

        <div className="notification-modal-form">
          {!isCreateMode ? (
            <label className="notification-field">
              <span>ID</span>
              <input value={form.id || '--'} readOnly disabled />
              {errors.id ? <small>{errors.id}</small> : null}
            </label>
          ) : null}

          <label className="notification-field">
            <span>Mã thông báo</span>
            <input
              name="code"
              value={form.code}
              onChange={handleFieldChange}
              onKeyDown={preventEnterSubmit}
              placeholder="Nhập mã thông báo"
              disabled={submitting}
            />
            {errors.code ? <small>{errors.code}</small> : null}
          </label>

          <label className="notification-field">
            <span>Tiêu đề</span>
            <input
              name="titleTemplate"
              value={form.titleTemplate}
              onChange={handleFieldChange}
              onKeyDown={preventEnterSubmit}
              placeholder="Nhập tiêu đề"
              disabled={submitting}
            />
            {errors.titleTemplate ? <small>{errors.titleTemplate}</small> : null}
          </label>

          <label className="notification-field">
            <span>Nội dung</span>
            <textarea
              name="bodyTemplate"
              value={form.bodyTemplate}
              onChange={handleFieldChange}
              placeholder="Nhập nội dung thông báo"
              rows={5}
              disabled={submitting}
            />
            {errors.bodyTemplate ? <small>{errors.bodyTemplate}</small> : null}
          </label>

          <div className="notification-modal-actions">
            <button className="notification-secondary-button" type="button" onClick={onClose} disabled={submitting}>
              Hủy
            </button>
            <button className="notification-primary-button" type="button" onClick={handleSave} disabled={submitting}>
              Lưu
            </button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        cancelText="Hủy"
        confirmText={confirmCopy.confirmText}
        loading={submitting}
        message={confirmCopy.message}
        onCancel={handleCancelConfirm}
        onConfirm={handleConfirmSubmit}
        open={isConfirmOpen}
        title={confirmCopy.title}
      />
    </div>
  );
}

export default NotificationTemplateModal;
