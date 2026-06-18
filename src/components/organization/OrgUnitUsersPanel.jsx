import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fetchOrgUnitUsers, removeUserFromOrgUnit } from '../../api/orgUnitsApi.js';
import ConfirmDialog from '../common/ConfirmDialog.jsx';
import AddOrgUnitUserModal from './AddOrgUnitUserModal.jsx';

const DEFAULT_FILTERS = {
  saleId: '',
  name: '',
  phone: '',
  roleName: '',
};
const DEFAULT_PAGINATION = {
  currentPage: 0,
  pageSize: 20,
  totalElements: 0,
  totalPages: 0,
};
const API_PAGE_SIZE = 20;
const UI_PAGE_SIZE = 10;
const BULK_DELETE_CONCURRENCY = 2;
const ROLE_OPTIONS = [
  { label: 'Tất cả', value: '' },
  { label: 'Lead', value: 'Lead' },
  { label: 'Employee', value: 'Employee' },
];

function hasActiveFilter(filters) {
  return Object.values(filters).some((value) => String(value || '').trim() !== '');
}

function getRowKey(user, index) {
  return user.userId || user.saleId || `${user.phoneNumber || 'user'}-${index}`;
}

function getUserId(user) {
  return String(user?.userId ?? user?.id ?? '').trim();
}

function getUserDisplayName(user) {
  return user?.name || user?.fullName || user?.phoneNumber || user?.saleId || 'người dùng này';
}

function getApiErrorMessage(error, fallback) {
  return error?.response?.data?.message || error?.response?.data?.error || fallback;
}

async function runWithConcurrency(items, limit, taskFn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      try {
        const result = await taskFn(items[currentIndex], currentIndex);
        results[currentIndex] = {
          item: items[currentIndex],
          status: 'success',
          result,
        };
      } catch (error) {
        results[currentIndex] = {
          item: items[currentIndex],
          status: 'failed',
          error,
        };
      }
    }
  }

  const workerCount = Math.min(Math.max(Number(limit) || 1, 1), items.length);
  const workers = Array.from({ length: workerCount }, () => worker());

  await Promise.all(workers);

  return results;
}

function getPaginationItems(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index);
  }

  const firstPages = [0, 1, 2, 3, 4];
  const lastPage = totalPages - 1;

  if (currentPage <= 4) {
    return [...firstPages, 'end-ellipsis', lastPage];
  }

  if (currentPage >= totalPages - 4) {
    return [0, 'start-ellipsis', totalPages - 5, totalPages - 4, totalPages - 3, totalPages - 2, lastPage];
  }

  return [0, 1, 'start-ellipsis', currentPage - 1, currentPage, currentPage + 1, 'end-ellipsis', lastPage];
}

function OrgUnitUsersPanel({ selectedOrgUnit }) {
  const orgUnitId = selectedOrgUnit?.id;
  const requestIdRef = useRef(0);
  const selectAllRef = useRef(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
  const [uiPage, setUiPage] = useState(0);
  const [reloadTick, setReloadTick] = useState(0);
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [toastMessage, setToastMessage] = useState(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [selectedUserMap, setSelectedUserMap] = useState({});
  const [bulkActionOpen, setBulkActionOpen] = useState(false);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState({
    total: 0,
    completed: 0,
    success: 0,
    failed: 0,
  });

  const apiPage = Math.floor(uiPage / (API_PAGE_SIZE / UI_PAGE_SIZE));
  const uiStartIndex = (uiPage % (API_PAGE_SIZE / UI_PAGE_SIZE)) * UI_PAGE_SIZE;
  const visibleUsers = users.slice(uiStartIndex, uiStartIndex + UI_PAGE_SIZE);
  const selectableVisibleUsers = visibleUsers.filter((user) => getUserId(user));
  const selectedUsers = Object.values(selectedUserMap);
  const selectedCount = selectedUsers.length;
  const selectedVisibleCount = selectableVisibleUsers.filter((user) => selectedUserMap[getUserId(user)]).length;
  const allVisibleSelected =
    selectableVisibleUsers.length > 0 && selectedVisibleCount === selectableVisibleUsers.length;
  const hasPartialVisibleSelection = selectedVisibleCount > 0 && !allVisibleSelected;
  const totalUiPages = Math.ceil(Number(pagination.totalElements || 0) / UI_PAGE_SIZE);
  const paginationItems = getPaginationItems(uiPage, totalUiPages);
  const canGoPrevious = uiPage > 0 && !loading;
  const canGoNext = totalUiPages > 0 && uiPage + 1 < totalUiPages && !loading;
  const emptyText = hasActiveFilter(appliedFilters)
    ? 'Không tìm thấy người dùng phù hợp'
    : 'Không có người dùng nào trong đơn vị tổ chức này';
  const bulkDeleteMessage = bulkDeleting
    ? `Đang xóa ${bulkDeleteProgress.completed}/${bulkDeleteProgress.total} người dùng...`
    : `Bạn có chắc chắn muốn xóa ${selectedCount} người dùng đã chọn khỏi đơn vị tổ chức này không? Hành động này sẽ xóa quyền/quan hệ của các người dùng đã chọn khỏi đơn vị tổ chức hiện tại.`;

  useEffect(() => {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setUiPage(0);
    setUsers([]);
    setPagination(DEFAULT_PAGINATION);
    setError('');
    setNotice('');
    setToastMessage(null);
    setAddModalOpen(false);
    setDeletingUser(null);
    setRemoveLoading(false);
    setSelectedUserMap({});
    setBulkActionOpen(false);
    setBulkDeleteModalOpen(false);
    setBulkDeleting(false);
    setBulkDeleteProgress({
      total: 0,
      completed: 0,
      success: 0,
      failed: 0,
    });
  }, [orgUnitId]);

  useEffect(() => {
    setSelectedUserMap({});
    setBulkActionOpen(false);
  }, [appliedFilters, orgUnitId, reloadTick, uiPage]);

  useEffect(() => {
    if (!selectAllRef.current) return;

    selectAllRef.current.indeterminate = hasPartialVisibleSelection;
  }, [hasPartialVisibleSelection]);

  useEffect(() => {
    if (!orgUnitId) return undefined;

    const requestId = requestIdRef.current + 1;
    let isMounted = true;

    requestIdRef.current = requestId;
    setLoading(true);
    setError('');

    fetchOrgUnitUsers({
      orgUnitId,
      ...appliedFilters,
      page: apiPage,
      size: API_PAGE_SIZE,
    })
      .then((result) => {
        if (!isMounted || requestIdRef.current !== requestId) return;

        setUsers(result.users);
        setPagination({
          ...DEFAULT_PAGINATION,
          ...result.pagination,
        });
      })
      .catch(() => {
        if (!isMounted || requestIdRef.current !== requestId) return;

        setUsers([]);
        setPagination(DEFAULT_PAGINATION);
        setError('Không tải được danh sách người dùng trong đơn vị tổ chức');
      })
      .finally(() => {
        if (!isMounted || requestIdRef.current !== requestId) return;

        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [apiPage, appliedFilters, orgUnitId, reloadTick]);

  const totalElementsLabel = useMemo(() => {
    return Number(pagination.totalElements || 0).toLocaleString('vi-VN');
  }, [pagination.totalElements]);

  const updateFilter = (event) => {
    const { name, value } = event.target;

    setFilters((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSearch = (event) => {
    event.preventDefault();
    setUiPage(0);
    setAppliedFilters({
      saleId: filters.saleId.trim(),
      name: filters.name.trim(),
      phone: filters.phone.trim(),
      roleName: filters.roleName,
    });
    setReloadTick((current) => current + 1);
  };

  const handleReset = () => {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setUiPage(0);
    setReloadTick((current) => current + 1);
  };

  const handlePlaceholderAction = (message) => {
    setNotice(message);
  };

  const showToast = useCallback((message) => {
    setToastMessage(message);
  }, []);

  const handleAddUserSuccess = useCallback(() => {
    setUiPage(0);
    setReloadTick((current) => current + 1);
  }, []);

  const toggleUserSelection = useCallback((user) => {
    const userId = getUserId(user);

    if (!userId) return;

    setSelectedUserMap((current) => {
      const next = { ...current };

      if (next[userId]) {
        delete next[userId];
      } else {
        next[userId] = user;
      }

      return next;
    });
  }, []);

  const toggleVisibleUsersSelection = useCallback(() => {
    setSelectedUserMap((current) => {
      const next = { ...current };

      if (allVisibleSelected) {
        selectableVisibleUsers.forEach((user) => {
          delete next[getUserId(user)];
        });

        return next;
      }

      selectableVisibleUsers.forEach((user) => {
        next[getUserId(user)] = user;
      });

      return next;
    });
  }, [allVisibleSelected, selectableVisibleUsers]);

  const openBulkDeleteConfirm = useCallback(() => {
    setBulkActionOpen(false);

    if (selectedCount === 0) {
      showToast({ type: 'error', text: 'Vui lòng chọn ít nhất một người dùng để xóa.' });
      return;
    }

    setBulkDeleteModalOpen(true);
  }, [selectedCount, showToast]);

  const closeBulkDeleteConfirm = useCallback(() => {
    if (bulkDeleting) return;
    setBulkDeleteModalOpen(false);
  }, [bulkDeleting]);

  const handleConfirmBulkRemoveUsers = useCallback(async () => {
    if (bulkDeleting) return;

    if (selectedUsers.length === 0) {
      showToast({ type: 'error', text: 'Vui lòng chọn ít nhất một người dùng để xóa.' });
      return;
    }

    if (!orgUnitId) {
      showToast({ type: 'error', text: 'Vui lòng chọn đơn vị tổ chức trước khi xóa người dùng.' });
      return;
    }

    const payloads = selectedUsers.map((user) => ({
      orgUnitId,
      roleId: user.roleId,
      userId: getUserId(user),
      scope: user.accessScope || user.scope || 'ALL',
      rawUser: user,
    }));
    const invalidPayload = payloads.find(
      (item) =>
        !item.orgUnitId ||
        item.roleId === undefined ||
        item.roleId === null ||
        String(item.roleId).trim() === '' ||
        !item.userId ||
        !item.scope
    );

    if (invalidPayload) {
      showToast({ type: 'error', text: 'Một số người dùng thiếu thông tin role/scope nên không thể xóa.' });
      return;
    }

    setBulkDeleting(true);
    setBulkDeleteProgress({
      total: payloads.length,
      completed: 0,
      success: 0,
      failed: 0,
    });

    const results = await runWithConcurrency(payloads, BULK_DELETE_CONCURRENCY, async (payload) => {
      try {
        await removeUserFromOrgUnit({
          orgUnitId: payload.orgUnitId,
          roleId: payload.roleId,
          userId: payload.userId,
          scope: payload.scope,
        });

        setBulkDeleteProgress((current) => ({
          ...current,
          completed: current.completed + 1,
          success: current.success + 1,
        }));
      } catch (error) {
        setBulkDeleteProgress((current) => ({
          ...current,
          completed: current.completed + 1,
          failed: current.failed + 1,
        }));
        throw error;
      }
    });

    const failedResults = results.filter((result) => result.status === 'failed');
    const failedCount = failedResults.length;
    const successCount = results.length - failedCount;

    if (failedCount > 0) {
      setBulkDeleteProgress((current) => ({
        ...current,
        completed: results.length,
        success: successCount,
        failed: failedCount,
      }));
    }

    if (successCount > 0 && failedCount === 0) {
      showToast({ type: 'success', text: `Đã xóa ${successCount} người dùng khỏi đơn vị tổ chức.` });
    } else if (successCount > 0 && failedCount > 0) {
      showToast({
        type: 'warning',
        text: `Đã xóa ${successCount} người dùng, ${failedCount} người dùng xóa thất bại.`,
      });
    } else {
      showToast({
        type: 'error',
        text: 'Không thể xóa các người dùng đã chọn. Vui lòng thử lại.',
      });
    }

    setBulkDeleting(false);
    setBulkDeleteModalOpen(false);
    setSelectedUserMap({});
    setBulkActionOpen(false);

    if (successCount > 0 && visibleUsers.length <= successCount && uiPage > 0) {
      setUiPage((current) => Math.max(current - 1, 0));
    }

    setReloadTick((current) => current + 1);
  }, [bulkDeleting, orgUnitId, selectedUsers, showToast, uiPage, visibleUsers.length]);

  const handleOpenRemoveConfirm = useCallback(
    (user) => {
      if (!orgUnitId) {
        showToast({ type: 'error', text: 'Vui lòng chọn đơn vị tổ chức trước khi xóa người dùng.' });
        return;
      }

      const userId = getUserId(user);

      if (!userId) {
        showToast({ type: 'error', text: 'Không xác định được người dùng cần xóa.' });
        return;
      }

      if (user?.roleId === undefined || user?.roleId === null || String(user.roleId).trim() === '') {
        showToast({ type: 'error', text: 'Không xác định được vai trò của người dùng cần xóa.' });
        return;
      }

      setDeletingUser({
        orgUnitId,
        roleId: user.roleId,
        userId,
        scope: user.accessScope || user.scope || 'ALL',
        name: getUserDisplayName(user),
        saleId: user.saleId,
        phoneNumber: user.phoneNumber || user.phone,
      });
    },
    [orgUnitId, showToast]
  );

  const closeRemoveConfirm = useCallback(() => {
    if (removeLoading) return;
    setDeletingUser(null);
  }, [removeLoading]);

  const handleConfirmRemoveUser = useCallback(async () => {
    if (removeLoading) return;

    if (!deletingUser?.orgUnitId || !deletingUser?.userId || deletingUser?.roleId === undefined || deletingUser?.roleId === null) {
      showToast({ type: 'error', text: 'Thiếu thông tin để xóa người dùng khỏi đơn vị tổ chức.' });
      return;
    }

    setRemoveLoading(true);

    try {
      await removeUserFromOrgUnit({
        orgUnitId: deletingUser.orgUnitId,
        roleId: deletingUser.roleId,
        userId: deletingUser.userId,
        scope: deletingUser.scope || 'ALL',
      });

      showToast({ type: 'success', text: 'Xóa người dùng khỏi đơn vị tổ chức thành công.' });
      setDeletingUser(null);

      if (visibleUsers.length <= 1 && uiPage > 0) {
        setUiPage((current) => Math.max(current - 1, 0));
      }

      setReloadTick((current) => current + 1);
    } catch (error) {
      showToast({
        type: 'error',
        text: getApiErrorMessage(error, 'Không thể xóa người dùng khỏi đơn vị tổ chức. Vui lòng thử lại.'),
      });
    } finally {
      setRemoveLoading(false);
    }
  }, [deletingUser, removeLoading, showToast, uiPage, visibleUsers.length]);

  if (!orgUnitId) return null;

  return (
    <section className="org-users-panel" aria-label="Danh sách người dùng trong đơn vị tổ chức">
      <div className="org-users-header">
        <div>
          <h3>Danh sách người dùng trong đơn vị tổ chức</h3>
          <p>Xem và tìm kiếm người dùng thuộc đơn vị đang chọn.</p>
        </div>
        <button
          className="org-primary-action"
          type="button"
          onClick={() => setAddModalOpen(true)}
        >
          Thêm người dùng
        </button>
      </div>

      {notice ? (
        <div className="org-users-notice" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Đóng thông báo">
            ×
          </button>
        </div>
      ) : null}

      <form className="org-users-filter" onSubmit={handleSearch}>
        <label>
          <span>Mã Sale</span>
          <input name="saleId" value={filters.saleId} onChange={updateFilter} placeholder="Nhập mã sale" />
        </label>
        <label>
          <span>Họ tên</span>
          <input name="name" value={filters.name} onChange={updateFilter} placeholder="Nhập họ tên" />
        </label>
        <label>
          <span>Số điện thoại</span>
          <input name="phone" value={filters.phone} onChange={updateFilter} placeholder="Nhập số điện thoại" />
        </label>
        <label>
          <span>Vai trò</span>
          <select name="roleName" value={filters.roleName} onChange={updateFilter}>
            {ROLE_OPTIONS.map((option) => (
              <option value={option.value} key={option.value || 'all'}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="org-users-filter-actions">
          <button className="org-primary-action" type="submit" disabled={loading}>
            Tìm kiếm
          </button>
          <button className="org-secondary-action" type="button" onClick={handleReset} disabled={loading}>
            Đặt lại
          </button>
        </div>
      </form>

      {selectedCount > 0 ? (
        <div className="org-users-bulk-bar">
          <span>Đã chọn {selectedCount} người dùng</span>
          <div className="org-users-bulk-action">
            <button
              className="org-bulk-action-button"
              type="button"
              onClick={() => setBulkActionOpen((current) => !current)}
              disabled={bulkDeleting}
              aria-expanded={bulkActionOpen}
            >
              Thao tác
              <span>⌄</span>
            </button>
            {bulkActionOpen ? (
              <div className="org-bulk-action-menu">
                <button type="button" onClick={openBulkDeleteConfirm} disabled={bulkDeleting}>
                  Xóa người dùng
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="org-users-table-wrap">
        <table className="org-users-table">
          <thead>
            <tr>
              <th className="org-users-select-cell">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleVisibleUsersSelection}
                  disabled={loading || bulkDeleting || selectableVisibleUsers.length === 0}
                  aria-label="Chọn tất cả người dùng đang hiển thị"
                />
              </th>
              <th>Mã Sale</th>
              <th>Họ tên</th>
              <th>Số điện thoại</th>
              <th>Tên vai trò</th>
              <th>Role Id</th>
              <th>Phạm vi truy cập</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="org-users-state">
                  <span className="org-users-state-content">Đang tải danh sách người dùng...</span>
                </td>
              </tr>
            ) : null}

            {!loading && error ? (
              <tr>
                <td colSpan={8} className="org-users-state org-users-state-error">
                  <span className="org-users-state-content">{error}</span>
                </td>
              </tr>
            ) : null}

            {!loading && !error && visibleUsers.length === 0 ? (
              <tr>
                <td colSpan={8} className="org-users-state">
                  <span className="org-users-state-content">{emptyText}</span>
                </td>
              </tr>
            ) : null}

            {!loading && !error
              ? visibleUsers.map((user, index) => (
                  <tr key={getRowKey(user, index)}>
                    <td className="org-users-select-cell">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedUserMap[getUserId(user)])}
                        onChange={() => toggleUserSelection(user)}
                        disabled={bulkDeleting || !getUserId(user)}
                        aria-label={`Chọn ${user.name || user.saleId || 'người dùng'}`}
                      />
                    </td>
                    <td>{user.saleId || '--'}</td>
                    <td>{user.name || '--'}</td>
                    <td>{user.phoneNumber || '--'}</td>
                    <td>{user.roleName || '--'}</td>
                    <td>{user.roleId ?? '--'}</td>
                    <td>{user.accessScope || '--'}</td>
                    <td>
                      <button
                        className="org-users-delete"
                        type="button"
                        onClick={() => handleOpenRemoveConfirm(user)}
                        aria-label={`Xóa ${user.name || user.saleId || 'người dùng'}`}
                        disabled={removeLoading || bulkDeleting}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>

      <div className="org-users-footer">
        <span>Tổng số {totalElementsLabel} bản ghi</span>
        <div className="org-users-pagination">
          <button type="button" onClick={() => setUiPage((current) => Math.max(current - 1, 0))} disabled={!canGoPrevious}>
            ← Trước
          </button>
          {paginationItems.map((item) =>
            typeof item === 'number' ? (
              <button
                className={`org-users-page-number${item === uiPage ? ' is-active' : ''}`}
                type="button"
                onClick={() => setUiPage(item)}
                disabled={loading || item === uiPage}
                aria-current={item === uiPage ? 'page' : undefined}
                key={item}
              >
                {item + 1}
              </button>
            ) : (
              <span className="org-users-page-ellipsis" key={item}>
                ...
              </span>
            )
          )}
          <button type="button" onClick={() => setUiPage((current) => current + 1)} disabled={!canGoNext}>
            Sau →
          </button>
        </div>
      </div>
      <AddOrgUnitUserModal
        open={addModalOpen}
        orgUnit={selectedOrgUnit}
        onClose={() => setAddModalOpen(false)}
        onSuccess={handleAddUserSuccess}
        onToast={showToast}
      />

      <ConfirmDialog
        open={bulkDeleteModalOpen}
        title="Xác nhận xóa người dùng khỏi đơn vị tổ chức"
        message={bulkDeleteMessage}
        cancelText="Hủy"
        confirmText="Xóa người dùng"
        loading={bulkDeleting}
        onCancel={closeBulkDeleteConfirm}
        onConfirm={handleConfirmBulkRemoveUsers}
        variant="danger"
      />

      <ConfirmDialog
        open={Boolean(deletingUser)}
        title="Xác nhận xóa người dùng khỏi đơn vị tổ chức"
        message={`Bạn có chắc chắn muốn xóa người dùng "${deletingUser?.name || 'người dùng này'}" khỏi đơn vị tổ chức này không? Sau khi xóa, người dùng sẽ không còn thuộc đơn vị tổ chức hiện tại.`}
        cancelText="Hủy"
        confirmText="Xóa"
        loading={removeLoading}
        onCancel={closeRemoveConfirm}
        onConfirm={handleConfirmRemoveUser}
        variant="danger"
      />

      {toastMessage?.text ? (
        <div className={`org-toast org-toast-${toastMessage.type || 'success'}`} role="status">
          <span>{toastMessage.text}</span>
          <button type="button" onClick={() => setToastMessage(null)} aria-label="Đóng thông báo">
            ×
          </button>
        </div>
      ) : null}
    </section>
  );
}

export default memo(OrgUnitUsersPanel);
