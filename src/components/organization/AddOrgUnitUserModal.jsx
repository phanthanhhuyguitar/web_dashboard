import { useEffect, useMemo, useState } from 'react';

import {
  assignUserToOrgUnit,
  checkUserExistsInOrgUnit,
  fetchRoles,
  searchUsers,
} from '../../api/orgUnitsApi.js';

const SCOPE_OPTIONS = ['ALL', 'SELF', 'CHILDREN', 'OWN'];
const SEARCH_CONFIG = {
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

const DEFAULT_ERRORS = {};

function getUserId(user) {
  return String(user?.userId ?? user?.id ?? '').trim();
}

function getUserName(user) {
  return user?.name || user?.fullName || '--';
}

function getUserPhone(user) {
  return user?.phoneNumber || user?.phone || '--';
}

function getApiErrorMessage(error, fallback) {
  return error?.response?.data?.message || error?.response?.data?.error || fallback;
}

function AddOrgUnitUserModal({ open, orgUnit, onClose, onSuccess, onToast }) {
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
  const [errors, setErrors] = useState(DEFAULT_ERRORS);

  const orgUnitId = orgUnit?.id;
  const selectedUserId = getUserId(selectedUser);
  const canSubmit = Boolean(selectedRoleId && scope && selectedUserId) && !submitLoading;
  const searchConfig = SEARCH_CONFIG[searchType];

  const resetState = () => {
    setSelectedRoleId('');
    setScope('ALL');
    setSearchType('phone');
    setKeyword('');
    setSearchResults([]);
    setSelectedUser(null);
    setSearchLoading(false);
    setSubmitLoading(false);
    setSearchSubmitted(false);
    setErrors(DEFAULT_ERRORS);
  };

  const roleOptions = useMemo(() => {
    return roles.map((role) => ({
      value: String(role.id),
      label: role.label || role.roleName || role.name || role.code || String(role.id),
    }));
  }, [roles]);
  const selectedRole = useMemo(() => {
    return roles.find((role) => String(role.id) === String(selectedRoleId));
  }, [roles, selectedRoleId]);

  useEffect(() => {
    if (!open) return undefined;

    let isMounted = true;

    resetState();
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
  }, [onToast, open]);

  if (!open) return null;

  const closeModal = () => {
    if (submitLoading) return;
    resetState();
    onClose?.();
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

    if (!orgUnitId) {
      nextErrors.form = 'Vui lòng chọn đơn vị tổ chức trước khi thêm người dùng.';
    }

    if (!selectedRoleId) {
      nextErrors.role = 'Vui lòng chọn role.';
    }

    if (!scope) {
      nextErrors.scope = 'Vui lòng chọn scope.';
    }

    if (!selectedUserId) {
      nextErrors.user = 'Vui lòng chọn người dùng.';
    }

    setErrors((current) => ({
      ...current,
      ...nextErrors,
    }));

    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (submitLoading || !validateSubmit()) return;

    setSubmitLoading(true);

    try {
      let exists = false;

      try {
        exists = await checkUserExistsInOrgUnit({
          orgUnitId,
          userId: selectedUserId,
        });
      } catch {
        onToast?.({ type: 'error', text: 'Không kiểm tra được người dùng trong đơn vị tổ chức. Vui lòng thử lại.' });
        return;
      }

      if (exists) {
        onToast?.({ type: 'error', text: 'Người dùng đã tồn tại trong đơn vị tổ chức.' });
        return;
      }

      await assignUserToOrgUnit({
        orgUnitId,
        roleId: selectedRole?.id ?? selectedRoleId,
        scope,
        userId: selectedUserId,
      });

      onToast?.({ type: 'success', text: 'Thêm người dùng vào đơn vị tổ chức thành công.' });
      resetState();
      onSuccess?.();
      onClose?.();
    } catch (error) {
      const message = getApiErrorMessage(error, 'Không thể thêm người dùng vào đơn vị tổ chức. Vui lòng thử lại.');

      onToast?.({ type: 'error', text: message });
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className="org-modal-backdrop" role="presentation">
      <section className="org-modal add-org-user-modal" role="dialog" aria-modal="true" aria-labelledby="add-org-user-title">
        <header className="org-modal-header">
          <div>
            <h2 id="add-org-user-title">Thêm người dùng vào đơn vị tổ chức</h2>
            <p>Chọn role, scope và tìm kiếm người dùng</p>
          </div>
          <button className="org-modal-close" type="button" onClick={closeModal} aria-label="Đóng modal">
            ×
          </button>
        </header>

        <div className="add-org-user-body">
          {errors.form ? <div className="org-form-message org-form-message-error">{errors.form}</div> : null}

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
                disabled={roleLoading}
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
              {Object.entries(SEARCH_CONFIG).map(([type, config]) => (
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

            <form className="add-org-user-search" onSubmit={handleSearch}>
              <input
                value={keyword}
                onChange={(event) => {
                  setKeyword(event.target.value);
                  setErrors((current) => ({ ...current, keyword: '' }));
                }}
                placeholder={searchConfig.placeholder}
                disabled={searchLoading || submitLoading}
              />
              <button className="org-primary-action" type="submit" disabled={searchLoading || submitLoading}>
                {searchLoading ? 'Đang tìm...' : 'Tìm kiếm'}
              </button>
            </form>

            {errors.keyword ? <strong className="add-org-user-error">{errors.keyword}</strong> : null}
            {errors.user ? <strong className="add-org-user-error">{errors.user}</strong> : null}

            <div className="add-org-user-results">
              {!searchLoading && !searchSubmitted ? (
                <div className="add-org-user-empty add-org-user-hint">
                  Nhập thông tin và bấm Tìm kiếm để chọn người dùng.
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
        </div>

        <footer className="org-modal-actions add-org-user-actions">
          <button className="org-secondary-action" type="button" onClick={closeModal} disabled={submitLoading}>
            Hủy
          </button>
          <button className="org-primary-action" type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {submitLoading ? 'Đang thêm...' : 'Thêm mới'}
          </button>
        </footer>
      </section>
    </div>
  );
}

export default AddOrgUnitUserModal;
