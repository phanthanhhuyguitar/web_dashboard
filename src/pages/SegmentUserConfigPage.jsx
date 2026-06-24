import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { fetchOrganizationUnits } from '../api/orgUnitsApi.js';
import Sidebar from '../components/layout/Sidebar.jsx';
import Topbar from '../components/layout/Topbar.jsx';
import { getSegmentById, saveSegmentUsers, searchSegmentUsers } from '../services/segmentLocalService.js';
import { formatNumber } from '../utils/formatNumber.js';
import { clearAccessToken } from '../utils/storage.js';

const DEFAULT_FILTERS = {
  createdFrom: '',
  createdTo: '',
  contractStatus: 'ALL',
  tnexLinkedStatus: 'ALL',
  organizationCode: 'ALL',
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
  const [segment, setSegment] = useState(() => location.state?.segment || null);
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

  useEffect(() => {
    let cancelled = false;

    getSegmentById(segmentId)
      .then((localSegment) => {
        if (cancelled) return;

        if (localSegment) {
          setSegment(localSegment);
          return;
        }

        setSegment((current) =>
          current || {
            id: segmentId,
            name: location.state?.segmentName || segmentId,
            description: '',
          },
        );
      })
      .catch(() => {
        if (cancelled) return;

        setSegment((current) =>
          current || {
            id: segmentId,
            name: location.state?.segmentName || segmentId,
            description: '',
          },
        );
      });

    if (location.state?.toastMessage) {
      setToastMessage(location.state.toastMessage);
    }

    return () => {
      cancelled = true;
    };
  }, [location.state?.segmentName, location.state?.toastMessage, segmentId]);

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

  const rangeText = useMemo(() => {
    if (total === 0) return 'Hiển thị 0-0 của 0 user';

    const start = (page - 1) * pageSize + 1;
    const end = Math.min(start + users.length - 1, total);

    return `Hiển thị ${start}-${end} của ${total} user`;
  }, [page, pageSize, total, users.length]);

  const pages = useMemo(() => getPaginationItems(page, totalPages), [page, totalPages]);
  const showDisbursementColumn = Boolean(lastSearchMeta?.loanFilterApplied);
  const selectedOrganizationOption = useMemo(
    () => organizationOptions.find((option) => option.value === filters.organizationCode) || ALL_ORGANIZATION_OPTION,
    [filters.organizationCode, organizationOptions],
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
      return 'Từ ngày không được lớn hơn Đến ngày.';
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

    try {
      const result = await searchSegmentUsers(
        {
          segmentId,
          ...filters,
        },
        nextPage,
        pageSize,
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
      const result = await saveSegmentUsers(segmentId, {
        ...filters,
        organizationName: selectedOrganizationOption.label,
      });

      if (!result.success) {
        throw new Error('Lưu danh sách user thất bại. Vui lòng thử lại.');
      }

      navigate(`/segments/${encodeURIComponent(segmentId)}/detail`, {
        state: {
          toastMessage: {
            type: 'success',
            text:
              Number(result.totalSaved) > 0
                ? `Lưu danh sách user vào segment thành công. Đã lưu ${result.totalSaved} user.`
                : 'Lưu danh sách user thành công. Segment hiện chưa có user phù hợp.',
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
            </div>
            <div className="segment-config-actions">
              <button className="segment-secondary-button ds-button ds-button-secondary" type="button" onClick={() => navigate('/segments')}>
                Quay lại
              </button>
              <button className="segment-primary-button ds-button ds-button-primary" type="button" onClick={handleSaveUsers} disabled={saving}>
                {saving ? 'Đang lưu...' : 'Lưu danh sách'}
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

            <div className="segment-user-filter-grid">
              <fieldset className="segment-fieldset">
                <legend>Ngày tạo tài khoản</legend>
                <label className="segment-field">
                  <span>Từ ngày</span>
                  <input type="date" value={filters.createdFrom} onChange={(event) => updateFilter('createdFrom', event.target.value)} />
                </label>
                <label className="segment-field">
                  <span>Đến ngày</span>
                  <input type="date" value={filters.createdTo} onChange={(event) => updateFilter('createdTo', event.target.value)} />
                </label>
              </fieldset>

              <label className="segment-field">
                <span>Trạng thái ký hợp đồng</span>
                <select value={filters.contractStatus} onChange={(event) => updateFilter('contractStatus', event.target.value)}>
                  <option value="ALL">Tất cả</option>
                  <option value="SIGNED">Đã ký hợp đồng</option>
                  <option value="NOT_SIGNED">Chưa ký hợp đồng</option>
                </select>
              </label>

              <label className="segment-field">
                <span>Liên kết tài khoản TNEX</span>
                <select value={filters.tnexLinkedStatus} onChange={(event) => updateFilter('tnexLinkedStatus', event.target.value)}>
                  <option value="ALL">Tất cả</option>
                  <option value="LINKED">Đã liên kết</option>
                  <option value="NOT_LINKED">Chưa liên kết</option>
                </select>
              </label>

              <label className="segment-field">
                <span>Tổ chức quản lý</span>
                <div
                  className="segment-org-select"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      setOrganizationDropdownOpen(false);
                      setOrganizationSearch('');
                    }
                  }}
                >
                  <button
                    className="segment-org-select-trigger"
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
                    <div className="segment-org-select-options" role="listbox">
                      <div className="segment-org-select-search">
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
                        <div className="segment-org-select-empty">Không tìm thấy tổ chức phù hợp</div>
                      ) : null}
                      {organizationsLoadFailed ? <div className="segment-org-select-empty">Không tải được tổ chức</div> : null}
                    </div>
                  ) : null}
                </div>
              </label>

              <fieldset className="segment-fieldset segment-amount-fieldset">
                <legend>Doanh số giải ngân theo tháng</legend>
                <label className="segment-field">
                  <span>Tháng giải ngân</span>
                  <input type="month" value={filters.disbursementMonth} onChange={(event) => updateFilter('disbursementMonth', event.target.value)} />
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
              </fieldset>
            </div>

            {filterError ? <strong className="segment-field-error">{filterError}</strong> : null}

            <div className="segment-filter-actions">
              <button className="segment-primary-button ds-button ds-button-primary" type="button" onClick={() => runSearch(1)} disabled={loading}>
                {loading ? 'Đang tìm...' : 'Tìm kiếm'}
              </button>
              <button className="segment-secondary-button ds-button ds-button-secondary" type="button" onClick={resetFilters} disabled={loading}>
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
                          <td>{user.saleId || '--'}</td>
                          <td>{user.userId || '--'}</td>
                          {showDisbursementColumn ? <td>{formatNumber(Number(user.totalApprovedAmount) || 0)}</td> : null}
                        </tr>
                      ))
                    : null}
                </tbody>
              </table>
            </div>

            <div className="segment-pagination">
              <span>{rangeText}</span>
              <div className="segment-page-buttons">
                <button type="button" onClick={() => handlePageChange(page - 1)} disabled={page <= 1 || loading || !hasSearched}>
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
                  ),
                )}
                <button type="button" onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages || loading || !hasSearched}>
                  Sau →
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>

      {toastMessage?.text ? (
        <div className={`segment-toast segment-toast-${toastMessage.type || 'success'}`} role="status" aria-live="polite">
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
