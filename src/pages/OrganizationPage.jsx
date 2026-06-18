import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  assignUserToOrgUnit,
  createOrgUnit,
  deleteOrgUnit,
  fetchOrganizationUnits,
  fetchRoles,
  hasUsersInOrgUnit,
  searchUsers,
  updateOrgUnit,
} from '../api/orgUnitsApi.js';
import ConfirmDialog from '../components/common/ConfirmDialog.jsx';
import Sidebar from '../components/layout/Sidebar.jsx';
import Topbar from '../components/layout/Topbar.jsx';
import OrgUnitTree from '../components/organization/OrgUnitTree.jsx';
import OrgUnitUsersPanel from '../components/organization/OrgUnitUsersPanel.jsx';
import { clearAccessToken } from '../utils/storage.js';

const EMPTY_DISPLAY = '--';
const DELETE_HAS_CHILD_MESSAGE = 'Không thể xóa đơn vị tổ chức vì đang là đơn vị cha của đơn vị khác';
const DELETE_HAS_USER_MESSAGE = 'Không thể xóa đơn vị tổ chức vì vẫn còn người dùng thuộc đơn vị này';
const DELETE_CHECK_USERS_ERROR_MESSAGE =
  'Không kiểm tra được người dùng trong đơn vị tổ chức. Vui lòng thử lại';
const DELETE_FAILED_MESSAGE = 'Xóa đơn vị tổ chức thất bại. Vui lòng thử lại';
const SCOPE_OPTIONS = ['ALL', 'SELF', 'CHILDREN', 'OWN'];
const USER_SEARCH_CONFIG = {
  phone: {
    label: 'Số điện thoại',
    placeholder: 'Nhập số điện thoại...',
    emptyMessage: 'Vui lòng nhập số điện thoại cần tìm kiếm.',
  },
  saleId: {
    label: 'Mã Sale',
    placeholder: 'Nhập mã sale...',
    emptyMessage: 'Vui lòng nhập mã sale cần tìm kiếm.',
  },
};

function getApiErrorMessage(error, fallback = 'Cập nhật đơn vị thất bại') {
  const responseData = error?.response?.data;

  return (
    responseData?.message ||
    responseData?.error?.message ||
    responseData?.error ||
    fallback
  );
}

function normalizeDisplay(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return EMPTY_DISPLAY;
  }

  return String(value);
}

function normalizeId(value) {
  if (value === undefined || value === null) return '';

  return String(value).trim();
}

function getOrgDisplayName(orgUnit) {
  return orgUnit?.name || orgUnit?.title || orgUnit?.code || '';
}

function getOrgOptionLabel(orgUnit) {
  const name = getOrgDisplayName(orgUnit);
  const code = normalizeId(orgUnit?.code);

  if (name && code && name !== code) return `${name} - ${code}`;
  if (name) return name;

  return code;
}

function getOrgPathIds(path) {
  return String(path || '')
    .split(/[,.]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isDescendantOrg(candidateOrg, currentOrgId) {
  const currentId = normalizeId(currentOrgId);

  if (!currentId) return false;

  return getOrgPathIds(candidateOrg?.path).includes(currentId);
}

function isRootOrg(orgUnit) {
  const parentId = normalizeId(orgUnit?.parentId);

  if (parentId) return false;

  return getOrgPathIds(orgUnit?.path).length <= 1;
}

function getCreatedOrgId(response) {
  return normalizeId(
    response?.data?.id ||
      response?.id ||
      response?.data?.orgUnitId ||
      response?.orgUnitId
  );
}

function getUserId(user) {
  return normalizeId(user?.userId ?? user?.id);
}

function getUserName(user) {
  return user?.name || user?.fullName || '--';
}

function getUserPhone(user) {
  return user?.phoneNumber || user?.phone || '--';
}

function OrganizationDetail({ orgUnit }) {
  if (!orgUnit) {
    return (
      <div className="organization-detail-placeholder">
        <div className="organization-detail-header">
          <div>
            <h2>Danh sách người dùng trong đơn vị tổ chức</h2>
            <p>Chọn một đơn vị trong cây tổ chức để xem danh sách người dùng.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="organization-detail-placeholder">
      <OrgUnitUsersPanel selectedOrgUnit={orgUnit} />
    </div>
  );
}

function OrgUnitEditModal({ orgUnit, isSaving, message, onClose, onSave, onToast }) {
  const [formValues, setFormValues] = useState(() => ({
    name: orgUnit?.name || orgUnit?.title || '',
    parentId: orgUnit?.parentId ?? '',
    code: orgUnit?.code ?? '',
    type: orgUnit?.type ?? '',
    path: orgUnit?.path ?? '',
  }));
  const [orgUnits, setOrgUnits] = useState([]);
  const [orgUnitsLoading, setOrgUnitsLoading] = useState(false);
  const [parentSearch, setParentSearch] = useState('');
  const [parentDropdownOpen, setParentDropdownOpen] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [parentValidationError, setParentValidationError] = useState('');
  const modalRef = useRef(null);

  useEffect(() => {
    setFormValues({
      name: orgUnit?.name || orgUnit?.title || '',
      parentId: orgUnit?.parentId ?? '',
      code: orgUnit?.code ?? '',
      type: orgUnit?.type ?? '',
      path: orgUnit?.path ?? '',
    });
    setParentSearch('');
    setParentDropdownOpen(false);
    setValidationError('');
    setParentValidationError('');
  }, [orgUnit]);

  useEffect(() => {
    let isMounted = true;

    setOrgUnitsLoading(true);

    fetchOrganizationUnits()
      .then((result) => {
        if (!isMounted) return;

        setOrgUnits(Array.isArray(result) ? result : []);
      })
      .catch(() => {
        if (!isMounted) return;

        setOrgUnits([]);
        onToast?.({ type: 'error', text: 'Không thể tải danh sách đơn vị tổ chức. Vui lòng thử lại.' });
      })
      .finally(() => {
        if (!isMounted) return;

        setOrgUnitsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [onToast]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape' && !isSaving) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isSaving, onClose]);

  const currentOrgId = normalizeId(orgUnit?.id);
  const selectedParentId = normalizeId(formValues.parentId);
  const selectedParent = useMemo(() => {
    return orgUnits.find((item) => normalizeId(item?.id) === selectedParentId) || null;
  }, [orgUnits, selectedParentId]);
  const selectedParentLabel = selectedParent
    ? getOrgOptionLabel(selectedParent)
    : selectedParentId
      ? `Đơn vị #${selectedParentId}`
      : '';
  const parentInputValue = parentDropdownOpen ? parentSearch : selectedParentLabel;
  const validParentOptions = useMemo(() => {
    const searchText = parentSearch.trim().toLowerCase();

    return orgUnits
      .filter((item) => {
        const candidateId = normalizeId(item?.id);

        return candidateId && candidateId !== currentOrgId && !isDescendantOrg(item, currentOrgId);
      })
      .filter((item) => {
        if (!searchText) return true;

        return [item?.name, item?.title, item?.code, item?.id].some((value) =>
          String(value ?? '').toLowerCase().includes(searchText)
        );
      });
  }, [currentOrgId, orgUnits, parentSearch]);

  const updateFormValue = (field, value) => {
    setFormValues((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const trimmedName = formValues.name.trim();
    const nextParentId = normalizeId(formValues.parentId);

    if (!trimmedName) {
      setValidationError('Vui lòng nhập tên đơn vị.');
      return;
    }

    if (!isRootOrg(orgUnit) && !nextParentId) {
      setParentValidationError('Vui lòng chọn đơn vị cha.');
      return;
    }

    if (nextParentId === currentOrgId) {
      setParentValidationError('Không thể chọn chính đơn vị này làm đơn vị cha.');
      return;
    }

    const nextParent = orgUnits.find((item) => normalizeId(item?.id) === nextParentId);

    if (nextParent && isDescendantOrg(nextParent, currentOrgId)) {
      setParentValidationError('Không thể chọn đơn vị con làm đơn vị cha.');
      return;
    }

    setValidationError('');
    setParentValidationError('');
    onSave({
      id: orgUnit.id,
      name: trimmedName,
      parentId: nextParentId,
      code: formValues.code,
      type: formValues.type,
    });
  };

  const handleBackdropMouseDown = (event) => {
    if (event.target === event.currentTarget && !isSaving) {
      onClose();
    }
  };

  return (
    <div className="org-modal-backdrop" role="presentation" onMouseDown={handleBackdropMouseDown}>
      <div className="org-modal" role="dialog" aria-modal="true" aria-labelledby="org-edit-title" ref={modalRef}>
        <div className="org-modal-header">
          <div>
            <h2 id="org-edit-title">Chỉnh sửa đơn vị</h2>
            <p>Thông tin được lấy từ node đang chọn trên cây tổ chức.</p>
          </div>
          <button className="org-modal-close" type="button" onClick={onClose} disabled={isSaving} aria-label="Đóng">
            ×
          </button>
        </div>

        <form className="org-edit-form" onSubmit={handleSubmit}>
          <label className="org-edit-field">
            <span>Tên đơn vị</span>
            <input
              value={formValues.name}
              onChange={(event) => {
                updateFormValue('name', event.target.value);
                setValidationError('');
              }}
              autoFocus
            />
            {validationError ? <strong>{validationError}</strong> : null}
          </label>

          <label className="org-edit-field">
            <span>Đơn vị cha</span>
            <div className="org-parent-select">
              <input
                value={parentInputValue}
                onChange={(event) => {
                  setParentSearch(event.target.value);
                  setParentDropdownOpen(true);
                  setParentValidationError('');
                }}
                onFocus={() => {
                  setParentSearch('');
                  setParentDropdownOpen(true);
                }}
                onBlur={() => {
                  window.setTimeout(() => {
                    setParentDropdownOpen(false);
                    setParentSearch('');
                  }, 120);
                }}
                placeholder={orgUnitsLoading ? 'Đang tải danh sách đơn vị...' : 'Chọn đơn vị cha'}
                disabled={orgUnitsLoading || isSaving}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={parentDropdownOpen}
              />
              {parentDropdownOpen && !orgUnitsLoading ? (
                <div className="org-parent-options" role="listbox">
                  {isRootOrg(orgUnit) ? (
                    <button
                      className={!selectedParentId ? 'is-selected' : ''}
                      type="button"
                      role="option"
                      aria-selected={!selectedParentId}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        updateFormValue('parentId', '');
                        setParentDropdownOpen(false);
                        setParentValidationError('');
                      }}
                    >
                      <span>Không có đơn vị cha</span>
                    </button>
                  ) : null}
                  {validParentOptions.length > 0 ? (
                    validParentOptions.map((item) => {
                      const optionId = normalizeId(item?.id);
                      const isSelected = optionId === selectedParentId;

                      return (
                        <button
                          className={isSelected ? 'is-selected' : ''}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          key={optionId}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            updateFormValue('parentId', optionId);
                            setParentDropdownOpen(false);
                            setParentSearch('');
                            setParentValidationError('');
                          }}
                        >
                          <span>{getOrgOptionLabel(item)}</span>
                          <small>
                            Type: {normalizeDisplay(item?.type)} • ID: {normalizeDisplay(item?.id)}
                          </small>
                        </button>
                      );
                    })
                  ) : (
                    <div className="org-parent-empty">Không tìm thấy đơn vị phù hợp</div>
                  )}
                </div>
              ) : null}
            </div>
            {parentValidationError ? <strong>{parentValidationError}</strong> : null}
          </label>

          <label className="org-edit-field">
            <span>Code</span>
            <input
              value={formValues.code}
              onChange={(event) => updateFormValue('code', event.target.value)}
              disabled={isSaving}
            />
          </label>

          <label className="org-edit-field">
            <span>Type</span>
            <input
              value={formValues.type}
              onChange={(event) => updateFormValue('type', event.target.value)}
              disabled={isSaving}
            />
          </label>

          <label className="org-edit-field org-edit-field-full">
            <span>Path</span>
            <input value={normalizeDisplay(formValues.path)} readOnly />
          </label>

          {message?.text ? (
            <div className={`org-form-message org-form-message-${message.type}`}>{message.text}</div>
          ) : null}

          <div className="org-modal-actions">
            <button className="org-secondary-action" type="button" onClick={onClose} disabled={isSaving}>
              Hủy
            </button>
            <button className="org-primary-action" type="submit" disabled={isSaving || orgUnitsLoading}>
              {isSaving ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OrgUnitCreateModal({ parentOrgUnit, onClose, onSuccess, onToast }) {
  const [formValues, setFormValues] = useState(() => ({
    name: '',
    parentId: parentOrgUnit?.id ?? '',
    code: '',
    type: '',
  }));
  const [roles, setRoles] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [scope, setScope] = useState('ALL');
  const [searchType, setSearchType] = useState('phone');
  const [keyword, setKeyword] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [searchSubmitted, setSearchSubmitted] = useState(false);
  const [errors, setErrors] = useState({});
  const selectedUserId = getUserId(selectedUser);
  const searchConfig = USER_SEARCH_CONFIG[searchType];
  const parentLabel = getOrgOptionLabel(parentOrgUnit) || normalizeDisplay(parentOrgUnit?.id);
  const roleOptions = useMemo(() => {
    return roles.map((role) => ({
      value: String(role.id),
      label: role.label || role.roleName || role.name || role.code || String(role.id),
    }));
  }, [roles]);

  useEffect(() => {
    setFormValues({
      name: '',
      parentId: parentOrgUnit?.id ?? '',
      code: '',
      type: '',
    });
    setSelectedRoleId('');
    setScope('ALL');
    setSearchType('phone');
    setKeyword('');
    setSearchResults([]);
    setSelectedUser(null);
    setSearchLoading(false);
    setSubmitLoading(false);
    setSearchSubmitted(false);
    setErrors({});
  }, [parentOrgUnit]);

  useEffect(() => {
    let isMounted = true;

    setRoleLoading(true);

    fetchRoles()
      .then((result) => {
        if (!isMounted) return;

        setRoles(result);
      })
      .catch(() => {
        if (!isMounted) return;

        setRoles([]);
        onToast?.({ type: 'error', text: 'Không thể tải danh sách role. Vui lòng thử lại.' });
      })
      .finally(() => {
        if (!isMounted) return;

        setRoleLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [onToast]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape' && !submitLoading) {
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, submitLoading]);

  const updateFormValue = (field, value) => {
    setFormValues((current) => ({
      ...current,
      [field]: value,
    }));
    setErrors((current) => ({
      ...current,
      [field]: '',
      form: '',
    }));
  };

  const closeModal = () => {
    if (submitLoading) return;

    onClose?.();
  };

  const handleBackdropMouseDown = (event) => {
    if (event.target === event.currentTarget && !submitLoading) {
      closeModal();
    }
  };

  const changeSearchType = (nextType) => {
    if (nextType === searchType || searchLoading || submitLoading) return;

    setSearchType(nextType);
    setKeyword('');
    setSearchResults([]);
    setSelectedUser(null);
    setSearchSubmitted(false);
    setErrors((current) => ({
      ...current,
      keyword: '',
      user: '',
    }));
  };

  const handleSearch = async (event) => {
    event.preventDefault();

    const trimmedKeyword = keyword.trim();

    setSearchSubmitted(true);
    setSelectedUser(null);
    setSearchResults([]);

    if (!trimmedKeyword) {
      setErrors((current) => ({
        ...current,
        keyword: searchConfig.emptyMessage,
      }));
      return;
    }

    setErrors((current) => ({
      ...current,
      keyword: '',
      user: '',
    }));
    setSearchLoading(true);

    try {
      const result = await searchUsers({
        searchType,
        keyword: trimmedKeyword,
        page: 0,
        size: 5,
      });

      setSearchResults(result.users);
    } catch {
      setSearchSubmitted(false);
      onToast?.({ type: 'error', text: 'Không thể tìm kiếm người dùng. Vui lòng thử lại.' });
    } finally {
      setSearchLoading(false);
    }
  };

  const validateSubmit = () => {
    const nextErrors = {};

    if (!formValues.name.trim()) {
      nextErrors.name = 'Vui lòng nhập tên đơn vị tổ chức.';
    }

    if (!normalizeId(formValues.parentId)) {
      nextErrors.parentId = 'Vui lòng chọn đơn vị tổ chức cha.';
    }

    if (!formValues.type.trim()) {
      nextErrors.type = 'Vui lòng nhập type.';
    }

    if (!selectedRoleId) {
      nextErrors.role = 'Vui lòng chọn role.';
    }

    if (!scope) {
      nextErrors.scope = 'Vui lòng chọn scope.';
    }

    if (!selectedUserId) {
      nextErrors.user = 'Vui lòng chọn người quản lý đơn vị.';
    }

    setErrors((current) => ({
      ...current,
      ...nextErrors,
    }));

    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (submitLoading || !validateSubmit()) return;

    setSubmitLoading(true);
    setErrors((current) => ({ ...current, form: '' }));

    try {
      const createResponse = await createOrgUnit({
        name: formValues.name.trim(),
        parentId: normalizeId(formValues.parentId),
        code: formValues.code.trim(),
        type: formValues.type.trim(),
      });
      const createdOrgId = getCreatedOrgId(createResponse);

      if (!createdOrgId) {
        onToast?.({
          type: 'error',
          text: 'Tạo đơn vị tổ chức thành công nhưng không xác định được ID tổ chức mới để gán người quản lý.',
        });
        onSuccess?.();
        return;
      }

      try {
        await assignUserToOrgUnit({
          orgUnitId: createdOrgId,
          roleId: selectedRoleId,
          scope,
          userId: selectedUserId,
        });

        onToast?.({
          type: 'success',
          text: 'Thêm mới đơn vị tổ chức và gán người quản lý thành công.',
        });
        onSuccess?.();
        onClose?.();
      } catch {
        onToast?.({
          type: 'error',
          text: 'Đơn vị tổ chức đã được tạo nhưng gán người quản lý thất bại. Vui lòng thử lại trong danh sách người dùng của tổ chức.',
        });
        onSuccess?.();
      }
    } catch (error) {
      const message = getApiErrorMessage(error, 'Không thể thêm mới đơn vị tổ chức. Vui lòng thử lại.');

      setErrors((current) => ({ ...current, form: message }));
      onToast?.({ type: 'error', text: message });
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className="org-modal-backdrop" role="presentation" onMouseDown={handleBackdropMouseDown}>
      <section className="org-modal add-org-user-modal create-org-modal" role="dialog" aria-modal="true" aria-labelledby="create-org-title">
        <header className="org-modal-header">
          <div>
            <h2 id="create-org-title">Thêm mới đơn vị tổ chức</h2>
            <p>Đơn vị cha được lấy từ node vừa chọn trên cây tổ chức.</p>
          </div>
          <button className="org-modal-close" type="button" onClick={closeModal} aria-label="Đóng modal" disabled={submitLoading}>
            ×
          </button>
        </header>

        <form className="add-org-user-body create-org-form" onSubmit={handleSubmit}>
          {errors.form ? <div className="org-form-message org-form-message-error">{errors.form}</div> : null}

          <section className="create-org-section">
            <h3>Thông tin tổ chức</h3>
            <div className="add-org-user-grid">
              <label className="add-org-user-field">
                <span>
                  Tên đơn vị tổ chức <strong>*</strong>
                </span>
                <input
                  value={formValues.name}
                  onChange={(event) => updateFormValue('name', event.target.value)}
                  placeholder="Nhập tên đơn vị tổ chức"
                  disabled={submitLoading}
                  autoFocus
                />
                {errors.name ? <strong className="add-org-user-error">{errors.name}</strong> : null}
              </label>

              <label className="add-org-user-field">
                <span>
                  Đơn vị tổ chức cha <strong>*</strong>
                </span>
                <input value={parentLabel} disabled readOnly />
                {errors.parentId ? <strong className="add-org-user-error">{errors.parentId}</strong> : null}
              </label>

              <label className="add-org-user-field">
                <span>Code</span>
                <input
                  value={formValues.code}
                  onChange={(event) => updateFormValue('code', event.target.value)}
                  placeholder="Nhập code"
                  disabled={submitLoading}
                />
              </label>

              <label className="add-org-user-field">
                <span>
                  Type <strong>*</strong>
                </span>
                <input
                  value={formValues.type}
                  onChange={(event) => updateFormValue('type', event.target.value)}
                  placeholder="Nhập type"
                  disabled={submitLoading}
                />
                {errors.type ? <strong className="add-org-user-error">{errors.type}</strong> : null}
              </label>
            </div>
          </section>

          <section className="create-org-section">
            <h3>Thông tin quản lý đơn vị</h3>
            <div className="add-org-user-grid">
              <label className="add-org-user-field">
                <span>
                  Role <strong>*</strong>
                </span>
                <select
                  value={selectedRoleId}
                  onChange={(event) => {
                    setSelectedRoleId(event.target.value);
                    setErrors((current) => ({ ...current, role: '' }));
                  }}
                  disabled={roleLoading || submitLoading}
                >
                  <option value="">{roleLoading ? 'Đang tải role...' : 'Chọn role'}</option>
                  {roleOptions.map((role) => (
                    <option value={role.value} key={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
                {errors.role ? <strong className="add-org-user-error">{errors.role}</strong> : null}
              </label>

              <label className="add-org-user-field">
                <span>
                  Scope <strong>*</strong>
                </span>
                <select
                  value={scope}
                  onChange={(event) => {
                    setScope(event.target.value);
                    setErrors((current) => ({ ...current, scope: '' }));
                  }}
                  disabled={submitLoading}
                >
                  {SCOPE_OPTIONS.map((option) => (
                    <option value={option} key={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {errors.scope ? <strong className="add-org-user-error">{errors.scope}</strong> : null}
              </label>
            </div>

            <div className="add-org-user-section">
              <span className="add-org-user-label">
                User <strong>*</strong>
              </span>

              <div className="add-org-user-tabs" role="tablist" aria-label="Kiểu tìm kiếm người dùng">
                {Object.entries(USER_SEARCH_CONFIG).map(([type, config]) => (
                  <button
                    className={type === searchType ? 'is-active' : ''}
                    type="button"
                    onClick={() => changeSearchType(type)}
                    role="tab"
                    aria-selected={type === searchType}
                    key={type}
                  >
                    {config.label}
                  </button>
                ))}
              </div>

              <div className="add-org-user-search">
                <input
                  value={keyword}
                  onChange={(event) => {
                    setKeyword(event.target.value);
                    setErrors((current) => ({ ...current, keyword: '' }));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      handleSearch(event);
                    }
                  }}
                  placeholder={searchConfig.placeholder}
                  disabled={searchLoading || submitLoading}
                />
                <button className="org-primary-action" type="button" onClick={handleSearch} disabled={searchLoading || submitLoading}>
                  {searchLoading ? 'Đang tìm...' : 'Tìm kiếm'}
                </button>
              </div>

              {errors.keyword ? <strong className="add-org-user-error">{errors.keyword}</strong> : null}
              {errors.user ? <strong className="add-org-user-error">{errors.user}</strong> : null}

              <div className="add-org-user-results">
                {!searchLoading && !searchSubmitted ? (
                  <div className="add-org-user-empty add-org-user-hint">
                    Nhập thông tin và bấm Tìm kiếm để chọn người quản lý.
                  </div>
                ) : null}

                {searchLoading ? <div className="add-org-user-empty">Đang tìm kiếm người dùng...</div> : null}

                {!searchLoading && searchSubmitted && searchResults.length === 0 ? (
                  <div className="add-org-user-empty">Không tìm thấy người dùng phù hợp.</div>
                ) : null}

                {!searchLoading
                  ? searchResults.map((user) => {
                      const userId = getUserId(user);
                      const isSelected = userId && userId === selectedUserId;

                      return (
                        <button
                          className={`add-org-user-result${isSelected ? ' is-selected' : ''}`}
                          type="button"
                          onClick={() => {
                            setSelectedUser(user);
                            setErrors((current) => ({ ...current, user: '' }));
                          }}
                          key={userId || `${user.saleId || 'sale'}-${user.phoneNumber || user.phone || 'phone'}`}
                        >
                          <span>
                            <strong>{getUserName(user)}</strong>
                            <small>
                              {getUserPhone(user)} · {user.saleId || '--'}
                            </small>
                          </span>
                          <em>{isSelected ? 'Đã chọn' : user.accountStatus || user.status || '--'}</em>
                        </button>
                      );
                    })
                  : null}
              </div>
            </div>
          </section>

          <footer className="org-modal-actions add-org-user-actions">
            <button className="org-secondary-action" type="button" onClick={closeModal} disabled={submitLoading}>
              Hủy
            </button>
            <button className="org-primary-action" type="submit" disabled={submitLoading || roleLoading}>
              {submitLoading ? 'Đang thêm...' : 'Thêm mới'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function OrganizationPage() {
  const navigate = useNavigate();
  const [selectedOrgUnit, setSelectedOrgUnit] = useState(null);
  const [creatingParentOrgUnit, setCreatingParentOrgUnit] = useState(null);
  const [editingOrgUnit, setEditingOrgUnit] = useState(null);
  const [updatedOrgUnit, setUpdatedOrgUnit] = useState(null);
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const [deletingOrgUnit, setDeletingOrgUnit] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [formMessage, setFormMessage] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isSavingRef = useRef(false);
  const isDeletingRef = useRef(false);

  const handleLogout = () => {
    clearAccessToken();
    navigate('/login', { replace: true });
  };

  const handleEdit = (orgUnit) => {
    setSelectedOrgUnit(orgUnit);
    setEditingOrgUnit(orgUnit);
    setFormMessage(null);
  };

  const handleCreateRequest = (orgUnit) => {
    setSelectedOrgUnit(orgUnit);
    setCreatingParentOrgUnit(orgUnit);
    setFormMessage(null);
    setStatusMessage(null);
  };

  const handleCloseCreateModal = () => {
    setCreatingParentOrgUnit(null);
  };

  const handleCreateSuccess = () => {
    setTreeRefreshKey((current) => current + 1);
  };

  const handleCloseModal = () => {
    if (isSavingRef.current) return;

    setEditingOrgUnit(null);
    setFormMessage(null);
  };

  const handleDeleteRequest = async (orgUnit) => {
    if (!orgUnit?.id || isDeletingRef.current) return;

    setStatusMessage(null);

    if (Array.isArray(orgUnit.children) && orgUnit.children.length > 0) {
      setStatusMessage({ type: 'error', text: DELETE_HAS_CHILD_MESSAGE });
      return;
    }

    try {
      const hasUsers = await hasUsersInOrgUnit(orgUnit.id);

      if (hasUsers) {
        setStatusMessage({ type: 'error', text: DELETE_HAS_USER_MESSAGE });
        return;
      }

      setDeletingOrgUnit(orgUnit);
    } catch {
      setStatusMessage({ type: 'error', text: DELETE_CHECK_USERS_ERROR_MESSAGE });
    }
  };

  const handleCloseDeleteModal = () => {
    if (isDeletingRef.current) return;

    setDeletingOrgUnit(null);
  };

  const handleSave = async (payload) => {
    if (!editingOrgUnit || isSavingRef.current) return;

    const originalName = String(editingOrgUnit.name || editingOrgUnit.title || '').trim();
    const originalParentId = normalizeId(editingOrgUnit.parentId);
    const originalCode = String(editingOrgUnit.code ?? '');
    const originalType = String(editingOrgUnit.type ?? '');
    const nextParentId = normalizeId(payload.parentId);
    const nextCode = String(payload.code ?? '');
    const nextType = String(payload.type ?? '');

    if (
      payload.name === originalName &&
      nextParentId === originalParentId &&
      nextCode === originalCode &&
      nextType === originalType
    ) {
      setFormMessage({ type: 'info', text: 'Không có thông tin thay đổi' });
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    setFormMessage(null);
    setStatusMessage(null);

    try {
      const savedOrgUnit = await updateOrgUnit(payload);
      const nextOrgUnit = {
        ...editingOrgUnit,
        ...savedOrgUnit,
        title: savedOrgUnit.name || savedOrgUnit.code || `Đơn vị #${savedOrgUnit.id}`,
        name: savedOrgUnit.name,
      };

      setSelectedOrgUnit(nextOrgUnit);
      setUpdatedOrgUnit({ ...nextOrgUnit, updatedAt: Date.now() });
      setEditingOrgUnit(null);
      setTreeRefreshKey((current) => current + 1);
      setStatusMessage({ type: 'success', text: 'Cập nhật đơn vị tổ chức thành công.' });
    } catch (error) {
      const errorMessage = getApiErrorMessage(
        error,
        'Không thể cập nhật đơn vị tổ chức. Vui lòng thử lại.'
      );

      setFormMessage({ type: 'error', text: errorMessage });
      setStatusMessage({ type: 'error', text: errorMessage });
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingOrgUnit?.id || isDeletingRef.current) return;

    isDeletingRef.current = true;
    setIsDeleting(true);
    setStatusMessage(null);

    try {
      await deleteOrgUnit({ id: deletingOrgUnit.id });

      if (String(selectedOrgUnit?.id) === String(deletingOrgUnit.id)) {
        setSelectedOrgUnit(null);
      }

      setDeletingOrgUnit(null);
      setTreeRefreshKey((current) => current + 1);
      setStatusMessage({ type: 'success', text: 'Xóa đơn vị tổ chức thành công' });
    } catch (error) {
      setStatusMessage({ type: 'error', text: getApiErrorMessage(error, DELETE_FAILED_MESSAGE) });
    } finally {
      isDeletingRef.current = false;
      setIsDeleting(false);
    }
  };

  return (
    <div className="dashboard-shell">
      <Sidebar />

      <div className="dashboard-main">
        <Topbar isRefreshing={false} onRefresh={undefined} onLogout={handleLogout} />

        <main className="organization-content">
          <div className="organization-heading">
            <h1>Mô hình tổ chức</h1>
          </div>

          <section className="organization-layout">
            <OrgUnitTree
              refreshKey={treeRefreshKey}
              onCreateNode={handleCreateRequest}
              onDeleteNode={handleDeleteRequest}
              onEditNode={handleEdit}
              onSelectedNodeChange={setSelectedOrgUnit}
              updatedOrgUnit={updatedOrgUnit}
            />

            <OrganizationDetail orgUnit={selectedOrgUnit} />
          </section>
        </main>
      </div>

      {editingOrgUnit ? (
        <OrgUnitEditModal
          orgUnit={editingOrgUnit}
          isSaving={isSaving}
          message={formMessage}
          onClose={handleCloseModal}
          onSave={handleSave}
          onToast={setStatusMessage}
        />
      ) : null}

      {creatingParentOrgUnit ? (
        <OrgUnitCreateModal
          parentOrgUnit={creatingParentOrgUnit}
          onClose={handleCloseCreateModal}
          onSuccess={handleCreateSuccess}
          onToast={setStatusMessage}
        />
      ) : null}

      <ConfirmDialog
        cancelText="Hủy"
        confirmText="Xóa"
        loading={isDeleting}
        message={`Bạn có chắc chắn muốn xóa đơn vị tổ chức "${
          deletingOrgUnit?.name || deletingOrgUnit?.title || deletingOrgUnit?.code || ''
        }" không? Hành động này không thể hoàn tác.`}
        open={Boolean(deletingOrgUnit)}
        title="Xác nhận xóa đơn vị tổ chức"
        variant="danger"
        onCancel={handleCloseDeleteModal}
        onConfirm={handleConfirmDelete}
      />

      {statusMessage?.text ? (
        <div className={`org-toast org-toast-${statusMessage.type}`} role="status" aria-live="polite">
          <span>{statusMessage.text}</span>
          <button type="button" onClick={() => setStatusMessage(null)} aria-label="Đóng thông báo">
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default OrganizationPage;
