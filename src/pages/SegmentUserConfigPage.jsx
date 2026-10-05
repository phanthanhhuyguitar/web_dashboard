import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { fetchOrganizationUnits, fetchRoles } from '../api/orgUnitsApi.js';
import ThemedSelect from '../components/common/ThemedSelect.jsx';
import Sidebar from '../components/layout/Sidebar.jsx';
import Topbar from '../components/layout/Topbar.jsx';
import {
  createSegment,
  getSegmentById,
  saveSegmentUsers,
  searchSegmentUsers,
} from '../services/segmentLocalService.js';
import { formatNumber } from '../utils/formatNumber.js';
import { clearAccessToken } from '../utils/storage.js';

const DEFAULT_FILTERS = {
  createdFrom: '',
  createdTo: '',
  contractStatus: 'ALL',
  tnexLinkedStatus: 'ALL',
  role: 'ALL',
  organizationCode: 'ALL',
  saleId: '',
  saleIdPrefix: 'ALL',
  revenueActivityFrom: '',
  revenueActivityTo: '',
  revenueActivityStatus: 'ALL',
  disbursementMonth: '',
  disbursementAmountFrom: '',
  disbursementAmountTo: '',
};
const ALL_ORGANIZATION_OPTION = { value: 'ALL', label: 'Tất cả' };

function getPaginationItems(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const firstPages = [1, 2, 3, 4, 5];

  if (currentPage <= 5) {
    return [...firstPages, 'end-ellipsis', totalPages];
  }

  if (currentPage >= totalPages - 4) {
    return [1, 'start-ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, 2, 'start-ellipsis', currentPage - 1, currentPage, currentPage + 1, 'end-ellipsis', totalPages];
}

function getApiErrorMessage(error, fallback) {
  return error?.response?.data?.message || error?.response?.data?.error || error?.message || fallback;
}

function normalizeText(value) {
  if (value === undefined || value === null) return '';

  return String(value).trim();
}

function formatSaleIdDisplay(saleId) {
  return normalizeText(saleId).replace(/^DR/i, '');
}

function normalizeSearchText(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getOrgCode(orgUnit) {
  return normalizeText(orgUnit?.orgCode || orgUnit?.code || orgUnit?.organizationCode);
}

function getOrgLabel(orgUnit, orgCode) {
  return normalizeText(orgUnit?.orgName || orgUnit?.name || orgUnit?.title) || orgCode;
}

// Du phong khi khong goi duoc API /admin/roles - da kiem chung truc tiep tren du lieu that
// (SQLite) rang 2 gia tri nay la thu duy nhat ton tai o field roleInfo.roleCode ma server dung
// de loc (segmentUserSearch.cjs), phong khi API loi thi filter van con dung duoc voi 2 role nay.
const FALLBACK_ROLE_OPTIONS = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'Employee', label: 'Nhân viên' },
  { value: 'Lead', label: 'Quản lý' },
];

// roleInfo.roleCode cua user (server loc theo field nay) la 1 chuoi ma nhu "Employee"/"Lead",
// KHONG phai roleId dang so dung de gan role vao don vi to chuc (AddOrgUnitUserModal.jsx) - 2
// khai niem khac nhau du cung tu API /admin/roles. Uu tien lay field "code"/"roleCode" neu co.
function getRoleFilterValue(role) {
  return normalizeText(role?.code || role?.roleCode || role?.roleName || role?.name);
}

function buildRoleOptions(roles) {
  const options = [{ value: 'ALL', label: 'Tất cả' }];
  const seenValues = new Set();

  if (!Array.isArray(roles)) return options;

  roles.forEach((role) => {
    const value = getRoleFilterValue(role);

    if (!value || seenValues.has(value)) return;

    seenValues.add(value);
    options.push({
      value,
      label: role.label || role.roleName || role.name || value,
    });
  });

  return options.length > 1 ? options : FALLBACK_ROLE_OPTIONS;
}

function buildOrganizationOptions(orgUnits) {
  const options = [ALL_ORGANIZATION_OPTION];
  const seenCodes = new Set();

  if (!Array.isArray(orgUnits)) return options;

  orgUnits.forEach((orgUnit) => {
    const orgCode = getOrgCode(orgUnit);
    const normalizedCode = orgCode.toUpperCase();

    if (!orgCode || seenCodes.has(normalizedCode)) return;

    seenCodes.add(normalizedCode);
    options.push({
      value: orgCode,
      label: getOrgLabel(orgUnit, orgCode),
    });
  });

  return options;
}

function SegmentUserConfigPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { segmentId } = useParams();
  // segmentId === 'new' nghia la segment CHUA duoc tao that (xem SegmentManagementPage.jsx) -
  // trang nay chi thuc su goi createSegment khi admin bam "Luu danh sach" o duoi, tranh tao ra
  // 1 segment rong, chua co bo loc/user nao nhung da bao "thanh cong".
  const isNewSegment = segmentId === 'new';
  const pendingSegment = location.state?.pendingSegment;
  const [segment, setSegment] = useState(() => {
    if (isNewSegment) {
      return pendingSegment
        ? { id: null, name: pendingSegment.name, description: pendingSegment.description || '' }
        : null;
    }

    return location.state?.segment || null;
  });
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filterError, setFilterError] = useState('');
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [lastSearchMeta, setLastSearchMeta] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [organizationOptions, setOrganizationOptions] = useState([ALL_ORGANIZATION_OPTION]);
  const [organizationsLoading, setOrganizationsLoading] = useState(false);
  const [organizationsLoadFailed, setOrganizationsLoadFailed] = useState(false);
  const [organizationDropdownOpen, setOrganizationDropdownOpen] = useState(false);
  const [organizationSearch, setOrganizationSearch] = useState('');
  const [roleOptions, setRoleOptions] = useState(FALLBACK_ROLE_OPTIONS);
  const [rolesLoading, setRolesLoading] = useState(false);

  useEffect(() => {
    if (isNewSegment) {
      // Vao thang URL nay (VD F5 lam mat location.state) ma khong co thong tin segment dang tao
      // thi khong the tiep tuc - quay ve trang danh sach de tao lai tu dau.
      if (!pendingSegment?.name) {
        navigate('/segments', {
          replace: true,
          state: {
            toastMessage: {
              type: 'error',
              text: 'Không tìm thấy thông tin segment đang tạo (có thể do tải lại trang). Vui lòng tạo lại.',
            },
          },
        });
      }

      return undefined;
    }

    let cancelled = false;

    getSegmentById(segmentId)
      .then((localSegment) => {
        if (cancelled) return;

        if (localSegment) {
          setSegment(localSegment);
          return;
        }

        setSegment(
          (current) =>
            current || {
              id: segmentId,
              name: location.state?.segmentName || segmentId,
              description: '',
            }
        );
      })
      .catch(() => {
        if (cancelled) return;

        setSegment(
          (current) =>
            current || {
              id: segmentId,
              name: location.state?.segmentName || segmentId,
              description: '',
            }
        );
      });

    if (location.state?.toastMessage) {
      setToastMessage(location.state.toastMessage);
    }

    return () => {
      cancelled = true;
    };
  }, [
    isNewSegment,
    location.state?.segmentName,
    location.state?.toastMessage,
    navigate,
    pendingSegment?.name,
    segmentId,
  ]);

  useEffect(() => {
    let isMounted = true;

    setOrganizationsLoading(true);
    setOrganizationsLoadFailed(false);

    fetchOrganizationUnits()
      .then((orgUnits) => {
        if (!isMounted) return;

        setOrganizationOptions(buildOrganizationOptions(orgUnits));
      })
      .catch(() => {
        if (!isMounted) return;

        setOrganizationOptions([ALL_ORGANIZATION_OPTION]);
        setOrganizationsLoadFailed(true);
        setToastMessage({ type: 'error', text: 'Không tải được danh sách tổ chức.' });
      })
      .finally(() => {
        if (!isMounted) return;

        setOrganizationsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Lay danh sach role that tu API /admin/roles (dung ham fetchRoles co san, dang dung cho
  // trang To chuc) thay vi list tinh doan truoc - tranh sai/thieu role neu he thong doi.
  useEffect(() => {
    let isMounted = true;

    setRolesLoading(true);

    fetchRoles()
      .then((roles) => {
        if (!isMounted) return;

        setRoleOptions(buildRoleOptions(roles));
      })
      .catch(() => {
        if (!isMounted) return;

        setRoleOptions(FALLBACK_ROLE_OPTIONS);
        setToastMessage({ type: 'error', text: 'Không tải được danh sách role, đang dùng danh sách mặc định.' });
      })
      .finally(() => {
        if (!isMounted) return;

        setRolesLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const rangeText = useMemo(() => `Tổng số ${total.toLocaleString('vi-VN')} user`, [total]);

  const pages = useMemo(() => getPaginationItems(page, totalPages), [page, totalPages]);
  const showDisbursementColumn = Boolean(lastSearchMeta?.disbursementFilterApplied);
  const selectedOrganizationOption = useMemo(
    () => organizationOptions.find((option) => option.value === filters.organizationCode) || ALL_ORGANIZATION_OPTION,
    [filters.organizationCode, organizationOptions]
  );
  const filteredOrganizationOptions = useMemo(() => {
    const searchText = normalizeSearchText(organizationSearch);

    if (!searchText) return organizationOptions;

    return organizationOptions.filter((option) => {
      return [option.label, option.value].some((value) => normalizeSearchText(value).includes(searchText));
    });
  }, [organizationOptions, organizationSearch]);

  const handleLogout = () => {
    clearAccessToken();
    navigate('/login', { replace: true });
  };

  const updateFilter = (name, value) => {
    setFilters((current) => ({ ...current, [name]: value }));
    setFilterError('');
  };

  const updateAmountFilter = (name, value) => {
    updateFilter(name, value.replace(/\D/g, ''));
  };

  const validateFilters = () => {
    if (filters.createdFrom && filters.createdTo && filters.createdFrom > filters.createdTo) {
      return 'Từ ngày tạo tài khoản không được lớn hơn Đến ngày tạo tài khoản.';
    }

    if (
      filters.revenueActivityFrom &&
      filters.revenueActivityTo &&
      filters.revenueActivityFrom > filters.revenueActivityTo
    ) {
      return 'Từ ngày phát sinh doanh số không được lớn hơn Đến ngày phát sinh doanh số.';
    }

    const amountFrom = Number(filters.disbursementAmountFrom);
    const amountTo = Number(filters.disbursementAmountTo);

    if (filters.disbursementAmountFrom && filters.disbursementAmountTo && amountFrom > amountTo) {
      return 'Doanh số tối thiểu không được lớn hơn doanh số tối đa.';
    }

    return '';
  };

  const runSearch = async (nextPage = 1) => {
    const validationMessage = validateFilters();

    if (validationMessage) {
      setFilterError(validationMessage);
      return;
    }

    setLoading(true);
    setFilterError('');
    setToastMessage(null);

    try {
      const result = await searchSegmentUsers(
        {
          segmentId,
          ...filters,
        },
        nextPage,
        pageSize
      );

      setUsers(result.items || []);
      setTotal(result.total || 0);
      setPage(result.page || nextPage);
      setTotalPages(result.totalPages || 1);
      setLastSearchMeta(result.meta || null);
      setHasSearched(true);
    } catch (error) {
      setUsers([]);
      setTotal(0);
      setTotalPages(1);
      setLastSearchMeta(null);
      setToastMessage({
        type: 'error',
        text: getApiErrorMessage(error, 'Không thể tìm kiếm danh sách người dùng. Vui lòng thử lại.'),
      });
    } finally {
      setLoading(false);
    }
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setFilterError('');
    setUsers([]);
    setTotal(0);
    setPage(1);
    setTotalPages(1);
    setLastSearchMeta(null);
    setHasSearched(false);
    setToastMessage(null);
  };

  const handlePageChange = (nextPage) => {
    const safePage = Math.min(Math.max(Number(nextPage) || 1, 1), totalPages);
    runSearch(safePage);
  };

  const handleSaveUsers = async () => {
    if (!hasSearched) {
      setToastMessage({ type: 'error', text: 'Vui lòng tìm kiếm danh sách người dùng trước khi lưu vào segment.' });
      return;
    }

    setSaving(true);

    try {
      // Segment moi: chi thuc su tao (createSegment) ngay truoc khi luu danh sach - day la buoc
      // "hoan tat" duy nhat cua ca luong tao segment, thay vi tao rong tu buoc nhap ten (xem
      // SegmentManagementPage.jsx va effect load segment o tren).
      let targetSegmentId = segmentId;

      if (isNewSegment) {
        const createdSegment = await createSegment({
          name: segment?.name || pendingSegment?.name,
          description: segment?.description || pendingSegment?.description || '',
        });

        targetSegmentId = createdSegment.id;
      }

      const result = await saveSegmentUsers(targetSegmentId, {
        ...filters,
        organizationName: selectedOrganizationOption.label,
      });

      if (!result.success) {
        throw new Error('Lưu danh sách user thất bại. Vui lòng thử lại.');
      }

      navigate(`/segments/${encodeURIComponent(targetSegmentId)}/detail`, {
        state: {
          toastMessage: {
            type: 'success',
            text:
              Number(result.totalSaved) > 0
                ? `Tạo segment và lưu danh sách user thành công. Đã lưu ${result.totalSaved} user.`
                : 'Tạo segment thành công. Segment hiện chưa có user phù hợp với bộ lọc.',
          },
        },
      });
    } catch (error) {
      setToastMessage({
        type: 'error',
        text: getApiErrorMessage(error, 'Lưu danh sách user thất bại. Vui lòng thử lại.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const emptyText = hasSearched
    ? 'Không tìm thấy người dùng phù hợp.'
    : 'Chưa có dữ liệu. Vui lòng chọn điều kiện tìm kiếm.';

  return (
    <div className="dashboard-shell">
      <Sidebar />

      <div className="dashboard-main">
        <Topbar
          breadcrumbs={['Hệ thống quản trị', 'Trung tâm thông báo', 'Quản lý Segment', 'Cấu hình danh sách']}
          isRefreshing={loading}
          onLogout={handleLogout}
        />

        <main className="dashboard-content segment-page segment-config-page">
          <div className="dashboard-heading-row segment-config-heading">
            <div>
              <h1>Cấu hình danh sách Segment</h1>
              <p>Thiết lập điều kiện lọc và danh sách người dùng thuộc segment.</p>
              <strong>Segment: {segment?.name || segmentId}</strong>
              {isNewSegment ? (
                <p className="segment-config-pending-note">
                  Segment này <strong>chưa được tạo</strong> - sẽ chỉ được tạo khi bạn tìm kiếm và bấm &quot;Lưu danh
                  sách&quot; bên dưới. Rời trang mà chưa lưu sẽ không tạo ra segment nào.
                </p>
              ) : null}
            </div>
            <div className="segment-config-actions">
              <button
                className="segment-secondary-button ds-button ds-button-secondary"
                type="button"
                onClick={() => navigate('/segments')}
              >
                Quay lại
              </button>
              <button
                className="segment-primary-button ds-button ds-button-primary"
                type="button"
                onClick={handleSaveUsers}
                disabled={saving}
              >
                {saving ? 'Đang lưu...' : isNewSegment ? 'Tạo segment & Lưu danh sách' : 'Lưu danh sách'}
              </button>
            </div>
          </div>

          <section className="segment-filter-card segment-user-filter-card">
            <div className="segment-card-header">
              <div>
                <h2>Điều kiện tìm kiếm</h2>
                <p>Lọc danh sách người dùng theo các điều kiện bên dưới.</p>
              </div>
            </div>

            <div className="segment-filter-sections">
              <section className="segment-filter-section">
                <h3>Tài khoản</h3>
                <div className="segment-user-filter-grid segment-filter-section-grid segment-filter-account-grid">
                  <fieldset className="segment-fieldset">
                    <legend>Ngày tạo tài khoản</legend>
                    <label className="segment-field">
                      <span>Từ ngày</span>
                      <input
                        type="date"
                        value={filters.createdFrom}
                        onChange={(event) => updateFilter('createdFrom', event.target.value)}
                      />
                    </label>
                    <label className="segment-field">
                      <span>Đến ngày</span>
                      <input
                        type="date"
                        value={filters.createdTo}
                        onChange={(event) => updateFilter('createdTo', event.target.value)}
                      />
                    </label>
                  </fieldset>

                  <div className="segment-field-align-spacer">
                    <span className="segment-field-spacer-legend" aria-hidden="true">
                      &nbsp;
                    </span>
                    <label className="segment-field">
                      <span>Trạng thái ký hợp đồng</span>
                      <ThemedSelect
                        value={filters.contractStatus}
                        onChange={(event) => updateFilter('contractStatus', event.target.value)}
                        options={[
                          { value: 'ALL', label: 'Tất cả' },
                          { value: 'SIGNED', label: 'Đã ký hợp đồng' },
                          { value: 'NOT_SIGNED', label: 'Chưa ký hợp đồng' },
                        ]}
                      />
                    </label>
                  </div>

                  <div className="segment-field-align-spacer">
                    <span className="segment-field-spacer-legend" aria-hidden="true">
                      &nbsp;
                    </span>
                    <label className="segment-field">
                      <span>Liên kết tài khoản TNEX</span>
                      <ThemedSelect
                        value={filters.tnexLinkedStatus}
                        onChange={(event) => updateFilter('tnexLinkedStatus', event.target.value)}
                        options={[
                          { value: 'ALL', label: 'Tất cả' },
                          { value: 'LINKED', label: 'Đã liên kết' },
                          { value: 'NOT_LINKED', label: 'Chưa liên kết' },
                        ]}
                      />
                    </label>
                  </div>

                  <label className="segment-field">
                    <span>Vai trò</span>
                    {/* Loc theo roleInfo.roleCode cua user (server: segmentUserSearch.cjs). Danh sach
                    lay dong tu API /admin/roles (fetchRoles) - xem buildRoleOptions/
                    getRoleFilterValue o dau file de biet cach anh xa gia tri. */}
                    <ThemedSelect
                      value={filters.role}
                      onChange={(event) => updateFilter('role', event.target.value)}
                      disabled={rolesLoading}
                      options={roleOptions}
                    />
                  </label>
                </div>
              </section>

              <section className="segment-filter-section">
                <h3>Tổ chức</h3>
                <div className="segment-filter-section-grid segment-filter-organization-grid">
                  <label className="segment-field">
                    <span>Tổ chức quản lý</span>
                    <div
                      className="segment-searchable-select"
                      onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget)) {
                          setOrganizationDropdownOpen(false);
                          setOrganizationSearch('');
                        }
                      }}
                    >
                      <button
                        className="segment-searchable-select-trigger"
                        type="button"
                        onClick={() => {
                          setOrganizationDropdownOpen((current) => {
                            const nextOpen = !current;

                            if (!nextOpen) {
                              setOrganizationSearch('');
                            }

                            return nextOpen;
                          });
                        }}
                        disabled={organizationsLoading}
                        aria-expanded={organizationDropdownOpen}
                        aria-haspopup="listbox"
                      >
                        {organizationsLoading ? 'Đang tải tổ chức...' : selectedOrganizationOption.label}
                      </button>
                      {organizationDropdownOpen && !organizationsLoading ? (
                        <div className="segment-searchable-select-options" role="listbox">
                          <div className="segment-searchable-select-search">
                            <input
                              value={organizationSearch}
                              onChange={(event) => setOrganizationSearch(event.target.value)}
                              placeholder="Tìm theo tên hoặc mã tổ chức"
                              autoFocus
                            />
                          </div>
                          {filteredOrganizationOptions.map((option) => (
                            <button
                              className={option.value === filters.organizationCode ? 'is-selected' : ''}
                              type="button"
                              role="option"
                              aria-selected={option.value === filters.organizationCode}
                              key={option.value}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                updateFilter('organizationCode', option.value);
                                setOrganizationDropdownOpen(false);
                                setOrganizationSearch('');
                              }}
                            >
                              <span>{option.label}</span>
                              {option.value !== 'ALL' ? <small>{option.value}</small> : null}
                            </button>
                          ))}
                          {filteredOrganizationOptions.length === 0 ? (
                            <div className="segment-searchable-select-empty">Không tìm thấy tổ chức phù hợp</div>
                          ) : null}
                          {organizationsLoadFailed ? (
                            <div className="segment-searchable-select-empty">Không tải được tổ chức</div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </label>

                  <label className="segment-field">
                    <span>Mã Sale (saleId)</span>
                    <input
                      type="text"
                      value={filters.saleId}
                      onChange={(event) => updateFilter('saleId', event.target.value)}
                      placeholder="Ví dụ: CTV1222 (không phân biệt hoa thường)"
                    />
                  </label>

                  <label className="segment-field">
                    <span>Loại mã (tiền tố)</span>
                    <ThemedSelect
                      value={filters.saleIdPrefix}
                      onChange={(event) => updateFilter('saleIdPrefix', event.target.value)}
                      options={[
                        { value: 'ALL', label: 'Tất cả' },
                        { value: 'CTV', label: 'CTV (mã đầu CTV)' },
                        { value: 'DCH', label: 'DCH (mã đầu DCH)' },
                        { value: 'NUMERIC', label: 'Chỉ số (không có tiền tố chữ)' },
                      ]}
                    />
                  </label>
                </div>
              </section>

              <section className="segment-filter-section">
                <h3>Doanh số</h3>
                <div className="segment-filter-section-grid segment-filter-revenue-grid">
                  <div className="segment-revenue-activity-grid">
                    <label className="segment-field">
                      <span>Phát sinh doanh số</span>
                      <ThemedSelect
                        value={filters.revenueActivityStatus}
                        onChange={(event) => updateFilter('revenueActivityStatus', event.target.value)}
                        options={[
                          { value: 'ALL', label: 'Tất cả' },
                          { value: 'HAS_REVENUE', label: 'Có phát sinh' },
                          { value: 'NO_REVENUE', label: 'Chưa phát sinh' },
                        ]}
                      />
                    </label>

                    <label className="segment-field">
                      <span>Từ ngày phát sinh</span>
                      <input
                        type="date"
                        value={filters.revenueActivityFrom}
                        onChange={(event) => updateFilter('revenueActivityFrom', event.target.value)}
                      />
                    </label>

                    <label className="segment-field">
                      <span>Đến ngày phát sinh</span>
                      <input
                        type="date"
                        value={filters.revenueActivityTo}
                        onChange={(event) => updateFilter('revenueActivityTo', event.target.value)}
                      />
                    </label>
                  </div>

                  <div className="segment-disbursement-grid">
                    <label className="segment-field">
                      <span>Tháng giải ngân</span>
                      <input
                        type="month"
                        value={filters.disbursementMonth}
                        onChange={(event) => updateFilter('disbursementMonth', event.target.value)}
                      />
                    </label>
                    <label className="segment-field">
                      <span>Doanh số tối thiểu</span>
                      <input
                        inputMode="numeric"
                        value={filters.disbursementAmountFrom}
                        onChange={(event) => updateAmountFilter('disbursementAmountFrom', event.target.value)}
                        placeholder="Từ số tiền"
                      />
                    </label>
                    <label className="segment-field">
                      <span>Doanh số tối đa</span>
                      <input
                        inputMode="numeric"
                        value={filters.disbursementAmountTo}
                        onChange={(event) => updateAmountFilter('disbursementAmountTo', event.target.value)}
                        placeholder="Đến số tiền"
                      />
                    </label>
                  </div>
                </div>
              </section>
            </div>

            {filterError ? <strong className="segment-field-error">{filterError}</strong> : null}

            <div className="segment-filter-actions">
              <button
                className="segment-primary-button ds-button ds-button-primary"
                type="button"
                onClick={() => runSearch(1)}
                disabled={loading}
              >
                {loading ? 'Đang tìm...' : 'Tìm kiếm'}
              </button>
              <button
                className="segment-secondary-button ds-button ds-button-secondary"
                type="button"
                onClick={resetFilters}
                disabled={loading}
              >
                Đặt lại
              </button>
            </div>
          </section>

          <section className="segment-table-card">
            <div className="segment-card-header segment-table-header">
              <div>
                <h2>Danh sách người dùng</h2>
                <p>Danh sách người dùng thỏa mãn điều kiện lọc.</p>
              </div>
              <strong className="segment-user-total">Tổng số: {total} user</strong>
            </div>

            <div className="segment-table-wrap">
              <table className="segment-table segment-user-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Mã Sale</th>
                    <th>UserID</th>
                    {showDisbursementColumn ? <th>Doanh số</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={showDisbursementColumn ? 4 : 3} className="segment-table-state">
                        Đang tìm kiếm danh sách người dùng...
                      </td>
                    </tr>
                  ) : null}
                  {!loading && users.length === 0 ? (
                    <tr>
                      <td colSpan={showDisbursementColumn ? 4 : 3} className="segment-table-state">
                        {emptyText}
                      </td>
                    </tr>
                  ) : null}
                  {!loading
                    ? users.map((user, index) => (
                        <tr key={`${user.saleId}-${user.userId}`}>
                          <td>{(page - 1) * pageSize + index + 1}</td>
                          <td>{formatSaleIdDisplay(user.saleId) || '--'}</td>
                          <td>{user.userId || '--'}</td>
                          {showDisbursementColumn ? (
                            <td>{formatNumber(Number(user.totalApprovedAmount) || 0)}</td>
                          ) : null}
                        </tr>
                      ))
                    : null}
                </tbody>
              </table>
            </div>

            <div className="segment-pagination">
              <span>{rangeText}</span>
              <div className="segment-page-buttons">
                <button
                  type="button"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1 || loading || !hasSearched}
                >
                  ← Trước
                </button>
                {pages.map((item) =>
                  typeof item === 'number' ? (
                    <button
                      className={`segment-page-number${item === page ? ' is-active' : ''}`}
                      type="button"
                      onClick={() => handlePageChange(item)}
                      disabled={item === page || loading || !hasSearched}
                      aria-current={item === page ? 'page' : undefined}
                      key={item}
                    >
                      {item}
                    </button>
                  ) : (
                    <span className="segment-page-ellipsis" key={item}>
                      ...
                    </span>
                  )
                )}
                <button
                  type="button"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages || loading || !hasSearched}
                >
                  Sau →
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>

      {toastMessage?.text ? (
        <div
          className={`segment-toast segment-toast-${toastMessage.type || 'success'}`}
          role="status"
          aria-live="polite"
        >
          <span>{toastMessage.text}</span>
          <button type="button" onClick={() => setToastMessage(null)} aria-label="Đóng thông báo">
            x
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default SegmentUserConfigPage;
