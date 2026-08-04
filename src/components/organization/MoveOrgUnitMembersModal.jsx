import { useEffect, useMemo, useState } from 'react';

import {
  assignUserToOrgUnit,
  fetchAllOrgUnitUsers,
  fetchOrganizationUnits,
  fetchRoles,
  runWithConcurrency,
} from '../../api/orgUnitsApi.js';
import { reportOrgMoveEvent } from '../../api/notificationCenterApi.js';
import ConfirmDialog from '../common/ConfirmDialog.jsx';

const SCOPE_OPTIONS = ['ALL', 'SELF', 'CHILDREN', 'OWN'];
// Chi 2 luot goi API dong thoi - dung y het pattern "Xoa nguoi dung" da co san trong
// OrgUnitUsersPanel.jsx (BULK_DELETE_CONCURRENCY) de nhat quan rui ro/toc do cho toan trang To
// chuc, tranh spam API that cua TNEX.
const MOVE_CONCURRENCY = 2;

function normalizeId(value) {
  if (value === undefined || value === null) return '';

  return String(value).trim();
}

function getUserId(user) {
  return normalizeId(user?.userId ?? user?.id);
}

function getOrgLabel(orgUnit) {
  const name = orgUnit?.name || orgUnit?.title || '';
  const code = normalizeId(orgUnit?.code);

  if (name && code && name !== code) return `${name} - ${code}`;

  return name || code || `Đơn vị #${normalizeId(orgUnit?.id)}`;
}

function getApiErrorMessage(error, fallback) {
  return error?.response?.data?.message || error?.response?.data?.error || fallback;
}

function getMemberLabel(member) {
  const name = member?.name || member?.fullName || member?.phoneNumber || 'Không rõ tên';
  const saleId = member?.saleId ? ` (${member.saleId})` : '';

  return `${name}${saleId}`;
}

// Liet ke ten cac CTV bi trung (da co san o to chuc dich) de admin biet chinh xac ai bi bo qua,
// khong chi con so - gioi han so luong hien thi truc tiep trong text thong bao de khong qua dai.
const MAX_LISTED_SKIPPED_MEMBERS = 10;

function formatSkippedMembersList(skippedMembers) {
  if (skippedMembers.length === 0) return '';

  const listedNames = skippedMembers.slice(0, MAX_LISTED_SKIPPED_MEMBERS).map(getMemberLabel).join(', ');
  const remaining = skippedMembers.length - MAX_LISTED_SKIPPED_MEMBERS;

  return remaining > 0 ? `${listedNames} và ${remaining} người khác` : listedNames;
}

function MoveOrgUnitMembersModal({ open, sourceOrgUnit, onClose, onSuccess, onToast }) {
  const sourceOrgUnitId = normalizeId(sourceOrgUnit?.id);
  const [orgUnits, setOrgUnits] = useState([]);
  const [orgUnitsLoading, setOrgUnitsLoading] = useState(false);
  const [destinationSearch, setDestinationSearch] = useState('');
  const [destinationDropdownOpen, setDestinationDropdownOpen] = useState(false);
  const [destinationOrgUnit, setDestinationOrgUnit] = useState(null);
  const [roles, setRoles] = useState([]);
  const [roleLoading, setRoleLoading] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [scope, setScope] = useState('ALL');
  const [sourceMembers, setSourceMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const roleOptions = useMemo(() => {
    return roles.map((role) => ({
      value: String(role.id),
      label: role.label || role.roleName || role.name || role.code || String(role.id),
    }));
  }, [roles]);
  const selectedRole = useMemo(
    () => roles.find((role) => String(role.id) === String(selectedRoleId)),
    [roles, selectedRoleId]
  );
  const validDestinationOptions = useMemo(() => {
    const searchText = destinationSearch.trim().toLowerCase();

    return orgUnits
      .filter((item) => normalizeId(item?.id) && normalizeId(item?.id) !== sourceOrgUnitId)
      .filter((item) => {
        if (!searchText) return true;

        return [item?.name, item?.title, item?.code, item?.id].some((value) =>
          String(value ?? '').toLowerCase().includes(searchText)
        );
      });
  }, [destinationSearch, orgUnits, sourceOrgUnitId]);

  const resetState = () => {
    setDestinationSearch('');
    setDestinationDropdownOpen(false);
    setDestinationOrgUnit(null);
    setSelectedRoleId('');
    setScope('ALL');
    setErrors({});
    setConfirmOpen(false);
    setSubmitting(false);
  };

  useEffect(() => {
    if (!open || !sourceOrgUnitId) return undefined;

    let isMounted = true;

    resetState();
    setOrgUnitsLoading(true);
    setRoleLoading(true);
    setMembersLoading(true);

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
        if (isMounted) setOrgUnitsLoading(false);
      });

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
        if (isMounted) setRoleLoading(false);
      });

    fetchAllOrgUnitUsers({ orgUnitId: sourceOrgUnitId })
      .then((result) => {
        if (!isMounted) return;
        setSourceMembers(Array.isArray(result) ? result : []);
      })
      .catch(() => {
        if (!isMounted) return;
        setSourceMembers([]);
        onToast?.({ type: 'error', text: 'Không thể tải danh sách thành viên của đơn vị này. Vui lòng thử lại.' });
      })
      .finally(() => {
        if (isMounted) setMembersLoading(false);
      });

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourceOrgUnitId]);

  if (!open) return null;

  const closeModal = () => {
    if (submitting) return;
    onClose?.();
  };

  const handleBackdropMouseDown = (event) => {
    if (event.target === event.currentTarget && !submitting) {
      closeModal();
    }
  };

  const selectDestination = (orgUnit) => {
    setDestinationOrgUnit(orgUnit);
    setDestinationDropdownOpen(false);
    setDestinationSearch('');
    setErrors((current) => ({ ...current, destination: '' }));
  };

  const validate = () => {
    const nextErrors = {};

    if (!normalizeId(destinationOrgUnit?.id)) {
      nextErrors.destination = 'Vui lòng chọn đơn vị tổ chức đích.';
    }

    if (!selectedRoleId) {
      nextErrors.role = 'Vui lòng chọn role.';
    }

    if (!scope) {
      nextErrors.scope = 'Vui lòng chọn scope.';
    }

    if (sourceMembers.length === 0) {
      nextErrors.form = 'Đơn vị tổ chức này hiện không có thành viên nào để chuyển.';
    }

    setErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  };

  const openConfirm = () => {
    if (!validate()) return;
    setConfirmOpen(true);
  };

  const runMove = async () => {
    const jobId = `org_move_${sourceOrgUnitId}_${Date.now()}`;
    const destinationId = destinationOrgUnit.id;
    const destinationLabel = getOrgLabel(destinationOrgUnit);
    const sourceLabel = getOrgLabel(sourceOrgUnit);
    const roleId = selectedRole?.id ?? selectedRoleId;
    const total = sourceMembers.length;

    reportOrgMoveEvent({
      type: 'ORG_MOVE_STARTED',
      jobId,
      orgUnitId: destinationId,
      title: 'Bắt đầu thêm thành viên vào tổ chức mới',
      message: `Đang thêm ${total} thành viên của "${sourceLabel}" vào "${destinationLabel}".`,
    });

    // Tai 1 lan toan bo thanh vien cua to chuc DICH de kiem tra trung trong bo nho cho ca lo -
    // tranh goi checkUserExistsInOrgUnit rieng le cho tung nguoi (co the toi 50 trang moi nguoi).
    let destinationMemberIds = new Set();

    try {
      const destinationMembers = await fetchAllOrgUnitUsers({ orgUnitId: destinationId });

      destinationMemberIds = new Set(destinationMembers.map((user) => getUserId(user)).filter(Boolean));
    } catch {
      // Khong tai duoc danh sach dich thi bo qua buoc kiem tra trung - de tung request assign tu
      // xu ly (loi trung se duoc tinh la failed cho dung nguoi do, khong chan ca lo).
    }

    // Chi THEM vao to chuc moi - KHONG xoa khoi to chuc cu. Da co san luong "Xoa nguoi dung"
    // rieng trong OrgUnitUsersPanel.jsx, admin se tu lam tay buoc do de an toan (theo yeu cau).
    const counters = { success: 0, skipped: 0, failed: 0 };
    const skippedMembers = [];

    await runWithConcurrency(sourceMembers, MOVE_CONCURRENCY, async (member) => {
      const userId = getUserId(member);

      if (!userId) {
        counters.failed += 1;
        return;
      }

      if (destinationMemberIds.has(userId)) {
        counters.skipped += 1;
        skippedMembers.push(member);
        return;
      }

      try {
        await assignUserToOrgUnit({
          orgUnitId: destinationId,
          roleId,
          scope,
          userId,
        });
        counters.success += 1;
      } catch {
        counters.failed += 1;
      }
    });

    const hasIssue = counters.failed > 0;
    const summaryParts = [`${counters.success} thành công`];

    if (counters.skipped > 0) summaryParts.push(`${counters.skipped} trùng - đã có sẵn ở tổ chức đích`);
    if (counters.failed > 0) summaryParts.push(`${counters.failed} thất bại`);

    let summaryMessage = `Thêm thành viên của "${sourceLabel}" vào "${destinationLabel}": ${summaryParts.join(', ')}.`;

    if (skippedMembers.length > 0) {
      summaryMessage += ` CTV bị trùng: ${formatSkippedMembersList(skippedMembers)}.`;
    }

    if (hasIssue) {
      reportOrgMoveEvent({
        type: 'ORG_MOVE_FAILED',
        jobId,
        orgUnitId: destinationId,
        title: 'Thêm thành viên có lỗi',
        message: summaryMessage,
      });
      onToast?.({ type: 'warning', text: summaryMessage });
    } else {
      reportOrgMoveEvent({
        type: 'ORG_MOVE_COMPLETED',
        jobId,
        orgUnitId: destinationId,
        title: 'Thêm thành viên hoàn tất',
        message: summaryMessage,
      });
      onToast?.({ type: 'success', text: summaryMessage });
    }

    window.dispatchEvent(new Event('tnex:notifications-refresh'));
    onSuccess?.();
  };

  const handleConfirmMove = async () => {
    if (submitting) return;

    setSubmitting(true);
    setConfirmOpen(false);

    const total = sourceMembers.length;

    onToast?.({ type: 'success', text: `Đã bắt đầu thêm ${total} thành viên vào tổ chức mới. Theo dõi tiến trình ở chuông thông báo.` });
    onClose?.();

    try {
      await runMove();
    } catch (error) {
      onToast?.({ type: 'error', text: getApiErrorMessage(error, 'Thêm thành viên vào tổ chức mới thất bại. Vui lòng thử lại.') });
    }
  };

  const destinationLabel = destinationOrgUnit ? getOrgLabel(destinationOrgUnit) : '';
  const destinationInputValue = destinationDropdownOpen ? destinationSearch : destinationLabel;

  return (
    <div className="org-modal-backdrop" role="presentation" onMouseDown={handleBackdropMouseDown}>
      <section className="org-modal add-org-user-modal move-org-members-modal" role="dialog" aria-modal="true" aria-labelledby="move-org-members-title">
        <header className="org-modal-header">
          <div>
            <h2 id="move-org-members-title">Chuyển thành viên</h2>
            <p>
              Thêm toàn bộ {membersLoading ? '...' : sourceMembers.length} thành viên của &quot;{getOrgLabel(sourceOrgUnit)}
              &quot; vào một đơn vị tổ chức khác. <strong>Không tự xóa</strong> khỏi đơn vị hiện tại - nếu cần, hãy tự xóa
              bằng thao tác &quot;Xóa người dùng&quot; ở bảng danh sách thành viên.
            </p>
          </div>
          <button className="org-modal-close" type="button" onClick={closeModal} aria-label="Đóng modal" disabled={submitting}>
            ×
          </button>
        </header>

        <div className="add-org-user-body">
          {errors.form ? <div className="org-form-message org-form-message-error">{errors.form}</div> : null}

          <label className="add-org-user-field">
            <span>
              Đơn vị tổ chức đích <strong>*</strong>
            </span>
            <div className="org-parent-select">
              <input
                value={destinationInputValue}
                onChange={(event) => {
                  setDestinationSearch(event.target.value);
                  setDestinationDropdownOpen(true);
                }}
                onFocus={() => {
                  setDestinationSearch('');
                  setDestinationDropdownOpen(true);
                }}
                onBlur={() => {
                  window.setTimeout(() => {
                    setDestinationDropdownOpen(false);
                    setDestinationSearch('');
                  }, 120);
                }}
                placeholder={orgUnitsLoading ? 'Đang tải danh sách đơn vị...' : 'Tìm và chọn đơn vị tổ chức đích'}
                disabled={orgUnitsLoading || submitting}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={destinationDropdownOpen}
              />
              {destinationDropdownOpen && !orgUnitsLoading ? (
                <div className="org-parent-options" role="listbox">
                  {validDestinationOptions.length > 0 ? (
                    validDestinationOptions.map((item) => {
                      const optionId = normalizeId(item?.id);
                      const isSelected = optionId === normalizeId(destinationOrgUnit?.id);

                      return (
                        <button
                          className={isSelected ? 'is-selected' : ''}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          key={optionId}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectDestination(item)}
                        >
                          <span>{getOrgLabel(item)}</span>
                          <small>
                            Type: {item?.type || '--'} • ID: {item?.id}
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
            {errors.destination ? <strong className="add-org-user-error">{errors.destination}</strong> : null}
          </label>

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
                disabled={roleLoading || submitting}
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
                disabled={submitting}
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

          <p className="move-org-members-note">
            Role và scope chọn ở trên sẽ áp dụng cho <strong>toàn bộ</strong> thành viên khi được thêm vào đơn vị tổ chức mới
            (không giữ lại role/scope cũ).
          </p>
        </div>

        <footer className="org-modal-actions add-org-user-actions">
          <button className="org-secondary-action" type="button" onClick={closeModal} disabled={submitting}>
            Hủy
          </button>
          <button className="org-primary-action" type="button" onClick={openConfirm} disabled={submitting || membersLoading}>
            Thêm vào tổ chức mới
          </button>
        </footer>
      </section>

      <ConfirmDialog
        cancelText="Hủy"
        confirmText="Xác nhận thêm"
        loading={false}
        message={`Sẽ thêm ${sourceMembers.length} thành viên của "${getOrgLabel(sourceOrgUnit)}" vào "${destinationLabel}" với role "${
          selectedRole?.label || selectedRole?.roleName || selectedRoleId
        }", scope "${scope}". Thao tác này KHÔNG xóa các thành viên khỏi đơn vị tổ chức hiện tại - nếu cần, bạn tự xóa bằng "Xóa người dùng" sau. Có thể mất một lúc nếu số lượng lớn - bạn có thể đóng popup này, tiến trình sẽ báo qua chuông thông báo.`}
        open={confirmOpen}
        title="Xác nhận thêm thành viên vào tổ chức mới"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmMove}
      />
    </div>
  );
}

export default MoveOrgUnitMembersModal;
