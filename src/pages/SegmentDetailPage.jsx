import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { fetchAllLoans } from '../api/loansApi.js';
import { reportPushNotiEvent } from '../api/notificationCenterApi.js';
import { fetchNotificationTemplates, sendPushNotification } from '../api/notificationTemplatesApi.js';
import Sidebar from '../components/layout/Sidebar.jsx';
import Topbar from '../components/layout/Topbar.jsx';
import { DASHBOARD_REQUEST_CACHE_TTL_MS, DEFAULT_PAGE_SIZE } from '../config/constants.js';
import { getSegmentById } from '../services/segmentLocalService.js';
import { formatDateTime, parseDateValue } from '../utils/date.js';
import { createRequestKey, dedupeRequest } from '../utils/requestCache.js';
import { clearAccessToken } from '../utils/storage.js';

const PAGE_SIZE = 10;
const CONVERSION_CACHE_TTL_MS = 30 * 1000;
const conversionCache = new Map();
const PUSH_NOTIFICATION_BATCH_SIZE = 5000;
const PUSH_NOTIFICATION_BATCH_DELAY_MS = 400;

const ACTION_SCREEN_OPTIONS = [
  'splash',
  'login',
  'register',
  'personal_info',
  'personal_info_successful',
  'register_success',
  'otp',
  'introductions',
  'forgot_password',
  'set_password',
  'set_password_success',
  'main_page',
  'revenue',
  'revenue_pdf',
  'revenue_history',
  'guide_product_list',
  'web_link',
  'product',
  'product_qrcode',
  'product_add_customer',
  'product_add_customer_success',
  'link_tnex',
  'revenue_kyc',
  'revenue_kyc_complete',
  'revenue_link_acc_contract',
  'profile',
  'delete_account',
  'change_password',
  'notification',
  'biometric_setting',
  'join_team',
  'join_team_list_request',
];

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

function valueOrDash(value) {
  if (value === undefined || value === null || String(value).trim() === '') return '--';

  return value;
}

function formatSaleIdForDisplay(value) {
  const text = String(value || '').trim();

  if (!text) return '--';

  return text;
}

function formatNumber(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value) || 0);
}

function formatRate(value) {
  return `${(Number(value) || 0).toFixed(2)}%`;
}

function calculateRate(count, total) {
  if (!total) return 0;

  return Math.round((Number(count) / Number(total)) * 10000) / 100;
}

function toText(value) {
  if (value === undefined || value === null) return '';

  return String(value).trim();
}

function normalizeSearchText(value) {
  return toText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function toAmount(value) {
  const amount = Number(value || 0);

  return Number.isFinite(amount) ? amount : 0;
}

function parseDateTime(value) {
  const text = toText(value);

  if (!text) return null;

  return parseDateValue(text);
}

function getLoanCreatedAt(loan) {
  return loan?.createdAt || loan?.created_at || loan?.createdDate || loan?.created_time;
}

function getLoanClosedTime(loan) {
  return (
    loan?.closedAt ||
    loan?.closed_at ||
    loan?.closedTime ||
    loan?.statusUpdatedAt ||
    loan?.updatedAt ||
    loan?.updated_at ||
    getLoanCreatedAt(loan)
  );
}

function getLoanStatus(loan) {
  return toText(loan?.status || loan?.loanStatus);
}

function getLoanId(loan) {
  return toText(loan?.loanId || loan?.id || loan?.loan_id);
}

function getLoanOwnerSaleId(loan) {
  return toText(loan?.ownerSaleId || loan?.owner_sale_id);
}

function getLoanPhoneNumber(loan) {
  return toText(loan?.customerPhoneNumber || loan?.phoneNumber || loan?.phone || loan?.mobile);
}

function getSegmentConversionCacheKey(segment) {
  return `segment-conversion:${segment?.id || ''}:${segment?.createdAt || ''}`;
}

function getCachedConversion(cacheKey) {
  const cached = conversionCache.get(cacheKey);

  if (!cached) return null;
  if (Date.now() - cached.createdAt > CONVERSION_CACHE_TTL_MS) {
    conversionCache.delete(cacheKey);
    return null;
  }

  return cached.value;
}

function fetchDashboardLoans({ force = false } = {}) {
  const loansKey = createRequestKey('dashboard:loans', { size: DEFAULT_PAGE_SIZE });

  return dedupeRequest(loansKey, () => fetchAllLoans({ size: DEFAULT_PAGE_SIZE }), {
    ttl: DASHBOARD_REQUEST_CACHE_TTL_MS,
    force,
  });
}

function isLoanCreatedAfterSegment(loan, segmentCreatedAt) {
  const loanCreatedAt = parseDateTime(getLoanCreatedAt(loan));

  if (!loanCreatedAt || !segmentCreatedAt) return false;

  return loanCreatedAt >= segmentCreatedAt;
}

function buildEmptySegmentConversion(segmentUsers = []) {
  return {
    totalSegmentUsers: segmentUsers.length,
    usersWithLoanCount: 0,
    conversionRate: 0,
    usersWithLoanRate: 0,
    usersWithClosedLoanCount: 0,
    usersWithClosedLoanRate: 0,
    totalLoanRecords: 0,
    totalLoanRecordsInMonth: 0,
    closedLoanCount: 0,
    totalClosedLoanRecords: 0,
    totalClosedLoanRecordsInMonth: 0,
    approvedAmountClosed: 0,
    totalApprovedAmountClosed: 0,
    userRowsWithLoan: [],
    closedLoanRows: [],
    usersWithLoan: [],
    usersWithClosedLoan: [],
    loanRecords: [],
    closedLoanRecords: [],
  };
}

function buildSegmentConversionFromLoans({ segment, segmentUsers, loans }) {
  const segmentCreatedAt = parseDateTime(segment?.createdAt);
  const userBySaleId = new Map();

  segmentUsers.forEach((user) => {
    const saleId = toText(user?.saleId);

    if (!saleId || userBySaleId.has(saleId)) return;

    userBySaleId.set(saleId, {
      saleId,
      userId: toText(user?.userId),
    });
  });

  const loanRecords = loans
    .filter((loan) => {
      const ownerSaleId = getLoanOwnerSaleId(loan);

      return ownerSaleId && userBySaleId.has(ownerSaleId) && isLoanCreatedAfterSegment(loan, segmentCreatedAt);
    })
    .map((loan) => {
      const ownerSaleId = getLoanOwnerSaleId(loan);
      const segmentUser = userBySaleId.get(ownerSaleId);
      const createdAt = toText(getLoanCreatedAt(loan));

      return {
        saleId: ownerSaleId,
        userId: segmentUser?.userId || '',
        ownerSaleId,
        loanId: getLoanId(loan),
        phoneNumber: getLoanPhoneNumber(loan),
        status: getLoanStatus(loan),
        createdAt,
        eventTime: toText(getLoanClosedTime(loan)),
        approvedAmount: toAmount(loan?.approvedAmount),
      };
    });

  const loanSummaryBySaleId = new Map();

  loanRecords.forEach((record) => {
    const current = loanSummaryBySaleId.get(record.saleId) || {
      saleId: record.saleId,
      userId: record.userId,
      loanCount: 0,
      latestStatus: '',
      latestEventTime: '',
    };
    const recordCreatedAt = parseDateTime(record.createdAt);
    const latestCreatedAt = parseDateTime(current.latestEventTime);

    current.loanCount += 1;

    if (!latestCreatedAt || (recordCreatedAt && recordCreatedAt > latestCreatedAt)) {
      current.latestStatus = record.status;
      current.latestEventTime = record.createdAt;
    }

    loanSummaryBySaleId.set(record.saleId, current);
  });

  const closedLoanRecords = loanRecords.filter((record) => record.status.toUpperCase() === 'CLOSED');
  const saleIdsWithLoan = new Set(loanRecords.map((record) => record.saleId));
  const closedSaleIds = new Set(closedLoanRecords.map((record) => record.saleId));
  const usersWithLoan = segmentUsers
    .filter((user) => saleIdsWithLoan.has(toText(user.saleId)))
    .map((user) => ({
      ...(loanSummaryBySaleId.get(toText(user.saleId)) || {}),
      saleId: toText(user.saleId),
      userId: toText(user.userId),
    }));
  const usersWithClosedLoan = segmentUsers.filter((user) => closedSaleIds.has(toText(user.saleId)));
  const totalSegmentUsers = segmentUsers.length;
  const totalApprovedAmountClosed = closedLoanRecords.reduce((sum, record) => sum + toAmount(record.approvedAmount), 0);

  return {
    totalSegmentUsers,
    usersWithLoanCount: usersWithLoan.length,
    conversionRate: calculateRate(usersWithLoan.length, totalSegmentUsers),
    usersWithLoanRate: calculateRate(usersWithLoan.length, totalSegmentUsers),
    usersWithClosedLoanCount: usersWithClosedLoan.length,
    usersWithClosedLoanRate: calculateRate(usersWithClosedLoan.length, totalSegmentUsers),
    totalLoanRecords: loanRecords.length,
    totalLoanRecordsInMonth: loanRecords.length,
    closedLoanCount: closedLoanRecords.length,
    totalClosedLoanRecords: closedLoanRecords.length,
    totalClosedLoanRecordsInMonth: closedLoanRecords.length,
    approvedAmountClosed: totalApprovedAmountClosed,
    totalApprovedAmountClosed,
    userRowsWithLoan: usersWithLoan,
    closedLoanRows: closedLoanRecords,
    usersWithLoan,
    usersWithClosedLoan,
    loanRecords,
    closedLoanRecords,
    meta: {
      loanSource: 'api:/digital-sale-admin/api/v1/admin/loans',
      mappingRule: 'segmentUser.saleId === loan.ownerSaleId',
      segmentCreatedAtField: 'segment.createdAt',
      segmentCreatedAt: toText(segment?.createdAt),
      totalFetchedLoans: loans.length,
    },
  };
}

function getContractLabel(value) {
  const labels = {
    ALL: 'Tất cả',
    SIGNED: 'Đã ký hợp đồng',
    NOT_SIGNED: 'Chưa ký hợp đồng',
  };

  return labels[String(value || 'ALL').toUpperCase()] || valueOrDash(value);
}

function getLinkedLabel(value) {
  const labels = {
    ALL: 'Tất cả',
    LINKED: 'Đã liên kết',
    NOT_LINKED: 'Chưa liên kết',
  };

  return labels[String(value || 'ALL').toUpperCase()] || valueOrDash(value);
}

function DetailItem({ label, value }) {
  return (
    <div className="segment-detail-item">
      <span>{label}</span>
      <strong>{valueOrDash(value)}</strong>
    </div>
  );
}

function KpiCard({ label, value, subValue }) {
  return (
    <div className="segment-conversion-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      {subValue ? <small>{subValue}</small> : null}
    </div>
  );
}

function getSegmentUsers(segment) {
  if (Array.isArray(segment?.savedUsers) && segment.savedUsers.length > 0) {
    return segment.savedUsers.map((user) => ({
      saleId: user.saleId || '',
      userId: user.userId || '',
    }));
  }

  if (Array.isArray(segment?.recipients) && segment.recipients.length > 0) {
    return segment.recipients.map((user) => ({
      saleId: user.saleId || '',
      userId: user.userId || '',
    }));
  }

  if (Array.isArray(segment?.userIds)) {
    return segment.userIds.map((userId) => ({
      saleId: '',
      userId,
    }));
  }

  return [];
}

function getUniqueUserIds(users) {
  const userIds = [];
  const seen = new Set();

  users.forEach((user) => {
    const userId = String(user?.userId || '').trim();

    if (!userId || seen.has(userId)) return;

    seen.add(userId);
    userIds.push(userId);
  });

  return userIds;
}

function formatUserIdsForCopy(userIds) {
  return userIds.map((userId) => `"${userId}",`).join('\n');
}

function chunkArray(items, size) {
  const chunks = [];

  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }

  return chunks;
}

function getFilterItems(filters = {}) {
  const organization = filters.organizationName || filters.orgName || filters.organizationCode || filters.organizationId;

  return [
    ['Từ ngày tạo tài khoản', filters.createdFrom || 'Tất cả'],
    ['Đến ngày tạo tài khoản', filters.createdTo || 'Tất cả'],
    ['Trạng thái ký hợp đồng', getContractLabel(filters.contractStatus)],
    ['Liên kết tài khoản TNEX', getLinkedLabel(filters.tnexLinkedStatus)],
    ['Tổ chức quản lý', organization || 'Tất cả'],
    ['Mã Sale (saleId)', filters.saleId || 'Tất cả'],
    ['Tháng giải ngân', filters.disbursementMonth || 'Tất cả'],
    ['Doanh số tối thiểu', filters.disbursementAmountFrom ? formatNumber(filters.disbursementAmountFrom) : '--'],
    ['Doanh số tối đa', filters.disbursementAmountTo ? formatNumber(filters.disbursementAmountTo) : '--'],
  ];
}

function SimpleTable({ columns, rows, emptyText, rowKey, pagination }) {
  return (
    <>
      <div className="segment-table-wrap">
        <table className="segment-table segment-user-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="segment-table-state" colSpan={columns.length}>
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={rowKey ? rowKey(row, index) : index}>
                  {columns.map((column) => (
                    <td key={column.key}>{column.render ? column.render(row, index) : valueOrDash(row[column.key])}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pagination}
    </>
  );
}

function TablePagination({ page, totalPages, totalItems, itemLabel = 'bản ghi', onPageChange }) {
  if (totalPages <= 1) return null;

  const pages = getPaginationItems(page, totalPages);

  const goToPage = (nextPage) => {
    const pageNumber = Number(nextPage);

    if (!Number.isFinite(pageNumber)) return;

    onPageChange(Math.min(Math.max(pageNumber, 1), totalPages));
  };

  return (
    <div className="segment-pagination">
      <span>
        Tổng số {totalItems.toLocaleString('vi-VN')} {itemLabel}
      </span>
      <div className="segment-page-buttons">
        <button type="button" onClick={() => goToPage(page - 1)} disabled={page <= 1}>
          ← Trước
        </button>
        {pages.map((item) =>
          typeof item === 'number' ? (
            <button
              className={`segment-page-number${item === page ? ' is-active' : ''}`}
              type="button"
              onClick={() => goToPage(item)}
              disabled={item === page}
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
        <button type="button" onClick={() => goToPage(page + 1)} disabled={page >= totalPages}>
          Sau →
        </button>
      </div>
    </div>
  );
}

function SegmentDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { segmentId } = useParams();
  const [segment, setSegment] = useState(null);
  const [segmentMissing, setSegmentMissing] = useState(false);
  const [userPage, setUserPage] = useState(1);
  const [conversion, setConversion] = useState(null);
  const [conversionLoading, setConversionLoading] = useState(false);
  const [conversionError, setConversionError] = useState('');
  const [usersWithLoanPage, setUsersWithLoanPage] = useState(1);
  const [closedLoanPage, setClosedLoanPage] = useState(1);
  const [userIdModalOpen, setUserIdModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [pushNotiModalOpen, setPushNotiModalOpen] = useState(false);
  const [notificationTemplates, setNotificationTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState('');
  const [selectedTemplateCode, setSelectedTemplateCode] = useState('');
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [actionScreen, setActionScreen] = useState('');
  const [screenDropdownOpen, setScreenDropdownOpen] = useState(false);
  const [screenSearch, setScreenSearch] = useState('');
  const [pushStep, setPushStep] = useState('form');
  const [pushBatches, setPushBatches] = useState([]);
  const [pushSubmitting, setPushSubmitting] = useState(false);
  const [pushError, setPushError] = useState('');
  const userIdTextareaRef = useRef(null);
  const conversionRequestIdRef = useRef(0);
  const conversionLoadingRef = useRef(false);
  const pushBatchesRef = useRef([]);
  const pushJobIdRef = useRef('');

  useEffect(() => {
    let cancelled = false;

    getSegmentById(segmentId)
      .then((localSegment) => {
        if (cancelled) return;

        setSegment(localSegment);
        setSegmentMissing(!localSegment);
      })
      .catch(() => {
        if (cancelled) return;

        setSegment(null);
        setSegmentMissing(true);
      });

    if (location.state?.toastMessage) {
      setToastMessage(location.state.toastMessage);
    }

    return () => {
      cancelled = true;
    };
  }, [location.state?.toastMessage, segmentId]);

  const segmentUsers = useMemo(() => getSegmentUsers(segment), [segment]);
  const segmentUserIds = useMemo(() => getUniqueUserIds(segmentUsers), [segmentUsers]);
  const userIdCopyText = useMemo(() => formatUserIdsForCopy(segmentUserIds), [segmentUserIds]);
  const selectedTemplateOption = useMemo(
    () => notificationTemplates.find((template) => template.code === selectedTemplateCode) || null,
    [notificationTemplates, selectedTemplateCode],
  );
  const filteredTemplateOptions = useMemo(() => {
    const searchText = normalizeSearchText(templateSearch);

    if (!searchText) return notificationTemplates;

    return notificationTemplates.filter((template) => {
      return [template.code, template.titleTemplate].some((value) => normalizeSearchText(value).includes(searchText));
    });
  }, [notificationTemplates, templateSearch]);
  const filteredScreenOptions = useMemo(() => {
    const searchText = normalizeSearchText(screenSearch);

    if (!searchText) return ACTION_SCREEN_OPTIONS;

    return ACTION_SCREEN_OPTIONS.filter((screen) => normalizeSearchText(screen).includes(searchText));
  }, [screenSearch]);
  const pushBatchCount = Math.max(Math.ceil(segmentUserIds.length / PUSH_NOTIFICATION_BATCH_SIZE), 1);
  const segmentUserTotal = Number(conversion?.totalSegmentUsers ?? segmentUsers.length) || 0;
  const usersWithLoanRate = calculateRate(conversion?.usersWithLoanCount, segmentUserTotal);
  const usersWithClosedLoanRate = calculateRate(conversion?.usersWithClosedLoanCount, segmentUserTotal);
  const pagedUsers = useMemo(() => {
    const start = (userPage - 1) * PAGE_SIZE;

    return segmentUsers.slice(start, start + PAGE_SIZE);
  }, [segmentUsers, userPage]);
  const userTotalPages = Math.max(Math.ceil(segmentUsers.length / PAGE_SIZE), 1);
  const usersWithLoan = conversion?.userRowsWithLoan || conversion?.usersWithLoan || [];
  const usersWithLoanTotalPages = Math.max(Math.ceil(usersWithLoan.length / PAGE_SIZE), 1);
  const pagedUsersWithLoan = useMemo(() => {
    const start = (usersWithLoanPage - 1) * PAGE_SIZE;

    return usersWithLoan.slice(start, start + PAGE_SIZE);
  }, [usersWithLoan, usersWithLoanPage]);
  const closedLoanRecords = conversion?.closedLoanRows || conversion?.closedLoanRecordsInMonth || conversion?.closedLoanRecords || [];
  const closedLoanTotalPages = Math.max(Math.ceil(closedLoanRecords.length / PAGE_SIZE), 1);
  const pagedClosedLoanRecords = useMemo(() => {
    const start = (closedLoanPage - 1) * PAGE_SIZE;

    return closedLoanRecords.slice(start, start + PAGE_SIZE);
  }, [closedLoanRecords, closedLoanPage]);

  const loadConversion = async ({ force = false } = {}) => {
    if (!segment || conversionLoadingRef.current) return;

    const requestId = conversionRequestIdRef.current + 1;
    conversionRequestIdRef.current = requestId;
    conversionLoadingRef.current = true;
    setConversionLoading(true);
    setConversionError('');

    try {
      const latestSegment = force ? await getSegmentById(segmentId) : segment;

      if (!latestSegment) {
        throw new Error('Segment not found');
      }

      const latestSegmentUsers = getSegmentUsers(latestSegment);
      const cacheKey = getSegmentConversionCacheKey(latestSegment);
      const cachedConversion = force ? null : getCachedConversion(cacheKey);
      const result =
        cachedConversion ||
        buildSegmentConversionFromLoans({
          segment: latestSegment,
          segmentUsers: latestSegmentUsers,
          loans: await fetchDashboardLoans({ force }),
        });

      if (conversionRequestIdRef.current !== requestId) return;

      if (!cachedConversion) {
        conversionCache.set(cacheKey, {
          createdAt: Date.now(),
          value: result,
        });
      }

      if (force) {
        setSegment(latestSegment);
      }

      setConversion(result);
      setUsersWithLoanPage(1);
      setClosedLoanPage(1);
    } catch (error) {
      if (conversionRequestIdRef.current !== requestId) return;

      setConversion(buildEmptySegmentConversion(segmentUsers));
      setUsersWithLoanPage(1);
      setClosedLoanPage(1);
      setConversionError('Không thể tải dữ liệu hiệu quả chuyển đổi. Vui lòng thử lại.');
    } finally {
      if (conversionRequestIdRef.current === requestId) {
        conversionLoadingRef.current = false;
        setConversionLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!segment) return;

    loadConversion();
  }, [segment]);

  useEffect(() => {
    if (!userIdModalOpen) return;

    window.setTimeout(() => {
      userIdTextareaRef.current?.focus();
    }, 0);
  }, [userIdModalOpen]);

  const handleLogout = () => {
    clearAccessToken();
    navigate('/login', { replace: true });
  };

  const copyUserIds = async () => {
    if (!userIdCopyText) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(userIdCopyText);
      } else {
        userIdTextareaRef.current?.focus();
        userIdTextareaRef.current?.select();

        const copied = document.execCommand('copy');

        if (!copied) throw new Error('Copy failed');
      }

      setToastMessage({ type: 'success', text: 'Đã copy danh sách UserID.' });
    } catch {
      setToastMessage({ type: 'error', text: 'Copy thất bại. Vui lòng thử lại.' });
    }
  };

  const openPushNotiModal = async () => {
    setPushError('');
    setPushStep('form');
    setPushBatches([]);
    pushBatchesRef.current = [];
    setPushNotiModalOpen(true);

    if (notificationTemplates.length > 0 || templatesLoading) return;

    setTemplatesLoading(true);
    setTemplatesError('');

    try {
      const result = await fetchNotificationTemplates({ page: 0, size: 100 });

      setNotificationTemplates(result.items);
      setSelectedTemplateCode((current) => current || result.items[0]?.code || '');
    } catch {
      setTemplatesError('Không tải được danh sách nội dung thông báo.');
    } finally {
      setTemplatesLoading(false);
    }
  };

  const closePushNotiModal = () => {
    if (pushSubmitting) return;

    setPushNotiModalOpen(false);
    setPushError('');
    setTemplateDropdownOpen(false);
    setTemplateSearch('');
    setScreenDropdownOpen(false);
    setScreenSearch('');
    setPushStep('form');
    setPushBatches([]);
    pushBatchesRef.current = [];
  };

  const updateBatchStatus = (id, patch) => {
    pushBatchesRef.current = pushBatchesRef.current.map((item) => (item.id === id ? { ...item, ...patch } : item));
    setPushBatches(pushBatchesRef.current);
  };

  // Gui tuan tu tung batch (khong gui song song) de tranh lap lai loi 503 do qua tai server.
  // Chi cac batchId truyen vao moi duoc goi API - dung cho ca lan gui dau va lan "gui lai batch loi"
  // (khong dung lai batch da 'success' -> chong gui trung).
  const runPushBatches = async (batchIds) => {
    setPushSubmitting(true);
    setPushError('');

    for (let index = 0; index < batchIds.length; index += 1) {
      const batchId = batchIds[index];
      const batch = pushBatchesRef.current.find((item) => item.id === batchId);

      if (!batch) continue;

      updateBatchStatus(batchId, { status: 'sending', error: '' });

      try {
        await sendPushNotification({
          userIds: batch.userIds,
          templateCode: selectedTemplateCode,
          params: {},
          actionParams: actionScreen ? { screen: actionScreen } : {},
        });

        updateBatchStatus(batchId, { status: 'success', error: '' });
      } catch {
        updateBatchStatus(batchId, { status: 'error', error: 'Gửi thất bại.' });
      }

      if (index < batchIds.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, PUSH_NOTIFICATION_BATCH_DELAY_MS));
      }
    }

    setPushSubmitting(false);

    const finalBatches = pushBatchesRef.current;
    const hasError = finalBatches.some((item) => item.status === 'error');

    if (!hasError) {
      const totalSent = finalBatches.reduce((sum, item) => sum + item.userIds.length, 0);

      setPushNotiModalOpen(false);
      setPushStep('form');
      setPushBatches([]);
      pushBatchesRef.current = [];
      setTemplateDropdownOpen(false);
      setTemplateSearch('');
      setScreenDropdownOpen(false);
      setScreenSearch('');
      setToastMessage({
        type: 'success',
        text: `Đã gửi thông báo tới ${totalSent} user (${finalBatches.length} lượt gửi).`,
      });
      reportPushNotiEvent({
        type: 'PUSH_NOTI_COMPLETED',
        jobId: pushJobIdRef.current,
        segmentId,
        title: 'Gửi thông báo hoàn tất',
        message: `Đã gửi thông báo tới ${totalSent} user (${finalBatches.length} lượt gửi).`,
      });
    } else {
      const errorCount = finalBatches.filter((item) => item.status === 'error').length;

      setPushError(`Có ${errorCount} lượt gửi thất bại. Bấm "Gửi lại các lượt lỗi" để gửi lại (không gửi trùng các lượt đã thành công).`);
      reportPushNotiEvent({
        type: 'PUSH_NOTI_FAILED',
        jobId: pushJobIdRef.current,
        segmentId,
        title: 'Gửi thông báo thất bại',
        message: `Có ${errorCount} lượt gửi thất bại trên tổng ${finalBatches.length} lượt.`,
      });
    }
  };

  const handleReviewPushNotification = () => {
    if (!selectedTemplateCode || segmentUserIds.length === 0) return;

    setPushError('');
    setPushStep('confirm');
  };

  const handleConfirmSendPushNotification = () => {
    const batches = chunkArray(segmentUserIds, PUSH_NOTIFICATION_BATCH_SIZE).map((userIds, index) => ({
      id: index,
      userIds,
      status: 'pending',
      error: '',
    }));

    pushBatchesRef.current = batches;
    pushJobIdRef.current = `push_${Date.now()}`;
    setPushBatches(batches);
    setPushStep('progress');
    reportPushNotiEvent({
      type: 'PUSH_NOTI_STARTED',
      jobId: pushJobIdRef.current,
      segmentId,
      title: 'Bắt đầu gửi thông báo',
      message: `Đang gửi tới ${segmentUserIds.length} user (${batches.length} lượt gửi).`,
    });
    runPushBatches(batches.map((batch) => batch.id));
  };

  const handleRetryFailedBatches = () => {
    if (pushSubmitting) return;

    const failedIds = pushBatchesRef.current.filter((batch) => batch.status === 'error').map((batch) => batch.id);

    if (failedIds.length === 0) return;

    runPushBatches(failedIds);
  };

  return (
    <div className="dashboard-shell">
      <Sidebar />
      <div className="dashboard-main">
        <Topbar
          breadcrumbs={['Hệ thống quản trị', 'Trung tâm thông báo', 'Quản lý Segment', 'Chi tiết Segment']}
          onLogout={handleLogout}
          onRefresh={() => loadConversion({ force: true })}
        />

        <main className="dashboard-content segment-page segment-detail-page">
          <div className="dashboard-heading-row segment-config-heading">
            <div>
              <h1>Chi tiết Segment</h1>
              <p>Xem thông tin bộ lọc, danh sách người dùng và hiệu quả chuyển đổi của segment.</p>
            </div>
            <button className="segment-secondary-button ds-button ds-button-secondary" type="button" onClick={() => navigate('/segments')}>
              Quay lại
            </button>
          </div>

          {segmentMissing ? (
            <section className="segment-table-card">
              <div className="segment-table-state segment-table-error">Không tìm thấy segment.</div>
            </section>
          ) : null}

          {segment ? (
            <>
              <section className="segment-table-card">
                <div className="segment-card-header">
                  <div>
                    <h2>Thông tin Segment</h2>
                    <p>Thông tin chỉ xem, không cho phép chỉnh sửa.</p>
                  </div>
                </div>
                <div className="segment-detail-grid">
                  <DetailItem label="Tên Segment" value={segment.name} />
                  <DetailItem label="Mô tả" value={segment.description} />
                  <DetailItem label="Người tạo" value={segment.createdBy} />
                  <DetailItem label="Ngày tạo" value={formatDateTime(segment.createdAt)} />
                  <DetailItem label="Ngày cập nhật" value={formatDateTime(segment.updatedAt)} />
                  <DetailItem label="Số người dùng đã lưu" value={`${segmentUsers.length || Number(segment.totalUsers) || 0} user`} />
                </div>
              </section>

              <section className="segment-table-card">
                <div className="segment-card-header">
                  <div>
                    <h2>Bộ lọc đã lưu</h2>
                    <p>Các điều kiện lọc dùng khi tạo danh sách user.</p>
                  </div>
                </div>
                <div className="segment-detail-grid">
                  {getFilterItems(segment.filters).map(([label, value]) => (
                    <DetailItem label={label} value={value} key={label} />
                  ))}
                </div>
              </section>

              <section className="segment-table-card">
                <div className="segment-card-header segment-table-header">
                  <div>
                    <h2>Danh sách user đã lưu trong Segment</h2>
                    <p>Danh sách được lưu tại thời điểm cấu hình segment.</p>
                  </div>
                  <div className="segment-user-list-actions">
                    <button
                      className="segment-user-id-button segment-secondary-button ds-button ds-button-secondary"
                      type="button"
                      title="Gửi push notification tới danh sách user trong segment"
                      onClick={openPushNotiModal}
                    >
                      Push noti
                    </button>
                    <button
                      className="segment-user-id-button segment-primary-button ds-button ds-button-primary"
                      type="button"
                      title="Lấy danh sách UserID"
                      onClick={() => setUserIdModalOpen(true)}
                    >
                      Lấy UserID
                    </button>
                    <strong className="segment-user-total">Tổng số: {segmentUsers.length} user</strong>
                  </div>
                </div>
                <SimpleTable
                  columns={[
                    { key: 'index', label: 'ID', render: (_, index) => (userPage - 1) * PAGE_SIZE + index + 1 },
                    { key: 'saleId', label: 'Mã Sale' },
                    { key: 'userId', label: 'UserID' },
                  ]}
                  rows={pagedUsers}
                  emptyText="Segment chưa có danh sách user đã lưu."
                  rowKey={(row, index) => `${row.saleId}-${row.userId}-${index}`}
                />
                {userTotalPages > 1 ? (
                  <div className="segment-pagination">
                    <span>Tổng số {segmentUsers.length.toLocaleString('vi-VN')} user</span>
                    <div className="segment-page-buttons">
                      <button type="button" onClick={() => setUserPage((page) => Math.max(page - 1, 1))} disabled={userPage <= 1}>
                        ← Trước
                      </button>
                      {getPaginationItems(userPage, userTotalPages).map((item) =>
                        typeof item === 'number' ? (
                          <button
                            className={`segment-page-number${item === userPage ? ' is-active' : ''}`}
                            type="button"
                            onClick={() => setUserPage(item)}
                            disabled={item === userPage}
                            aria-current={item === userPage ? 'page' : undefined}
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
                      <button type="button" onClick={() => setUserPage((page) => Math.min(page + 1, userTotalPages))} disabled={userPage >= userTotalPages}>
                        Sau →
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="segment-table-card">
                <div className="segment-card-header segment-table-header">
                  <div>
                    <h2>Hiệu quả chuyển đổi</h2>
                    <p>Theo dõi user trong segment phát sinh đơn và đơn giải ngân theo dữ liệu mới nhất.</p>
                  </div>
                  <button className="segment-primary-button ds-button ds-button-primary" type="button" onClick={() => loadConversion({ force: true })} disabled={conversionLoading}>
                    {conversionLoading ? 'Đang tải...' : 'Làm mới'}
                  </button>
                </div>

                {conversionError ? <div className="segment-conversion-alert">{conversionError}</div> : null}
                {conversionLoading ? <div className="segment-table-state">Đang làm mới dữ liệu...</div> : null}

                {conversion ? (
                  <>
                    <div className="segment-conversion-kpis">
                      <KpiCard label="Tổng user trong segment" value={formatNumber(segmentUserTotal)} />
                      <KpiCard label="User có đơn" value={`${formatNumber(conversion.usersWithLoanCount)} / ${formatNumber(segmentUserTotal)}`} />
                      <KpiCard label="Tỷ lệ chuyển đổi ra đơn" value={formatRate(usersWithLoanRate)} />
                      <KpiCard
                        label="User có đơn giải ngân"
                        value={`${formatNumber(conversion.usersWithClosedLoanCount)} / ${formatNumber(segmentUserTotal)}`}
                        subValue={formatRate(usersWithClosedLoanRate)}
                      />
                      <KpiCard label="Tổng đơn CLOSED" value={formatNumber(conversion.closedLoanCount ?? conversion.totalClosedLoanRecordsInMonth ?? conversion.totalClosedLoanRecords)} />
                      <KpiCard label="Số tiền giải ngân" value={formatNumber(conversion.approvedAmountClosed ?? conversion.totalApprovedAmountClosed)} />
                    </div>

                    {/* Tam an bang chi tiet "User co don"/"User co don giai ngan" - da co so lieu tong hop
                        o cac KpiCard phia tren, giu lai code de bat lai neu can xem chi tiet tung dong. */}
                    {/* eslint-disable-next-line no-constant-condition */}
                    {false ? (
                      <>
                    <div className="segment-conversion-section">
                      <h3>User có đơn</h3>
                      <SimpleTable
                        columns={[
                          { key: 'index', label: 'ID', render: (_, index) => (usersWithLoanPage - 1) * PAGE_SIZE + index + 1 },
                          { key: 'saleId', label: 'Mã Sale', render: (row) => formatSaleIdForDisplay(row.saleId) },
                          { key: 'userId', label: 'UserID' },
                          { key: 'loanCount', label: 'Số đơn' },
                          { key: 'latestStatus', label: 'Trạng thái gần nhất' },
                          { key: 'latestEventTime', label: 'Thời gian gần nhất', render: (row) => formatDateTime(row.latestEventTime) },
                        ]}
                        rows={pagedUsersWithLoan}
                        rowKey={(row, index) => `${row.saleId}-${row.userId}-${row.latestEventTime}-${index}`}
                        pagination={
                          <TablePagination
                            page={usersWithLoanPage}
                            totalPages={usersWithLoanTotalPages}
                            totalItems={usersWithLoan.length}
                            pageSize={PAGE_SIZE}
                            itemLabel="user"
                            onPageChange={setUsersWithLoanPage}
                          />
                        }
                        emptyText="Không có dữ liệu phù hợp từ thời điểm tạo segment"
                      />
                    </div>

                    <div className="segment-conversion-section">
                      <h3>Đơn giải ngân CLOSED</h3>
                      <SimpleTable
                        columns={[
                          { key: 'index', label: 'ID', render: (_, index) => (closedLoanPage - 1) * PAGE_SIZE + index + 1 },
                          { key: 'saleId', label: 'Mã Sale', render: (row) => formatSaleIdForDisplay(row.saleId) },
                          { key: 'userId', label: 'UserID' },
                          { key: 'loanId', label: 'LoanId' },
                          { key: 'phoneNumber', label: 'Phone' },
                          { key: 'status', label: 'Trạng thái' },
                          { key: 'eventTime', label: 'Thời gian CLOSED', render: (row) => formatDateTime(row.eventTime) },
                          { key: 'approvedAmount', label: 'ApprovedAmount', render: (row) => formatNumber(row.approvedAmount) },
                        ]}
                        rows={pagedClosedLoanRecords}
                        emptyText="Không có dữ liệu phù hợp từ thời điểm tạo segment"
                        rowKey={(row, index) => `${row.loanId}-${row.status}-${row.eventTime}-${index}`}
                        pagination={
                          <TablePagination
                            page={closedLoanPage}
                            totalPages={closedLoanTotalPages}
                            totalItems={closedLoanRecords.length}
                            pageSize={PAGE_SIZE}
                            itemLabel="bản ghi"
                            onPageChange={setClosedLoanPage}
                          />
                        }
                      />
                    </div>
                      </>
                    ) : null}
                  </>
                ) : null}
              </section>
            </>
          ) : null}
        </main>

        {userIdModalOpen ? (
          <div className="segment-modal-backdrop" role="presentation">
            <section className="segment-modal segment-user-id-modal" role="dialog" aria-modal="true" aria-labelledby="segment-user-id-modal-title">
              <div className="segment-modal-header">
                <div>
                  <h2 id="segment-user-id-modal-title">Danh sách UserID</h2>
                  <p>Danh sách UserID đã lưu trong segment, dùng để copy nhanh.</p>
                </div>
                <button className="segment-icon-button" type="button" onClick={() => setUserIdModalOpen(false)} aria-label="Đóng">
                  x
                </button>
              </div>

              <div className="segment-modal-form segment-user-id-modal-body">
                <div className="segment-user-id-toolbar">
                  <strong>Tổng UserID hợp lệ: {segmentUserIds.length}</strong>
                  <button className="segment-secondary-button ds-button ds-button-secondary" type="button" onClick={copyUserIds} disabled={!userIdCopyText}>
                    Copy toàn bộ
                  </button>
                </div>
                {userIdCopyText ? (
                  <textarea ref={userIdTextareaRef} className="segment-user-id-textarea" value={userIdCopyText} readOnly spellCheck={false} />
                ) : (
                  <div className="segment-user-id-empty">Không có UserID để hiển thị.</div>
                )}
              </div>

              <div className="segment-modal-actions">
                <button className="segment-secondary-button ds-button ds-button-secondary" type="button" onClick={() => setUserIdModalOpen(false)}>
                  Đóng
                </button>
                <button className="segment-primary-button ds-button ds-button-primary" type="button" onClick={copyUserIds} disabled={!userIdCopyText}>
                  Copy
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {pushNotiModalOpen ? (
          <div className="segment-modal-backdrop" role="presentation">
            <section className="segment-modal segment-push-noti-modal" role="dialog" aria-modal="true" aria-labelledby="segment-push-noti-modal-title">
              <div className="segment-modal-header">
                <div>
                  <h2 id="segment-push-noti-modal-title">Gửi Push Notification</h2>
                  <p>
                    {pushStep === 'form' ? 'Chọn nội dung thông báo để gửi tới toàn bộ user đã lưu trong segment.' : null}
                    {pushStep === 'confirm' ? 'Xác nhận trước khi gửi thông báo thật tới user.' : null}
                    {pushStep === 'progress' ? 'Đang gửi thông báo theo từng lượt để tránh quá tải hệ thống.' : null}
                  </p>
                </div>
                <button className="segment-icon-button" type="button" onClick={closePushNotiModal} aria-label="Đóng" disabled={pushSubmitting}>
                  x
                </button>
              </div>

              {pushStep === 'form' ? (
                <div className="segment-modal-form">
                  <strong className="segment-user-total">Số user nhận thông báo: {segmentUserIds.length}</strong>

                  {templatesError ? <div className="segment-conversion-alert">{templatesError}</div> : null}

                  <label className="segment-field">
                    <span>Nội dung thông báo</span>
                    <div
                      className="segment-searchable-select"
                      onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget)) {
                          setTemplateDropdownOpen(false);
                          setTemplateSearch('');
                        }
                      }}
                    >
                      <button
                        className="segment-searchable-select-trigger"
                        type="button"
                        onClick={() => {
                          setTemplateDropdownOpen((current) => {
                            const nextOpen = !current;

                            if (!nextOpen) {
                              setTemplateSearch('');
                            }

                            return nextOpen;
                          });
                        }}
                        disabled={templatesLoading || notificationTemplates.length === 0}
                        aria-expanded={templateDropdownOpen}
                        aria-haspopup="listbox"
                      >
                        {templatesLoading
                          ? 'Đang tải nội dung thông báo...'
                          : selectedTemplateOption
                            ? `${selectedTemplateOption.code} — ${selectedTemplateOption.titleTemplate || 'Không có tiêu đề'}`
                            : '-- Chưa có nội dung thông báo --'}
                      </button>
                      {templateDropdownOpen && !templatesLoading ? (
                        <div className="segment-searchable-select-options" role="listbox">
                          <div className="segment-searchable-select-search">
                            <input
                              value={templateSearch}
                              onChange={(event) => setTemplateSearch(event.target.value)}
                              placeholder="Tìm theo mã hoặc tiêu đề thông báo"
                              autoFocus
                            />
                          </div>
                          {filteredTemplateOptions.map((template) => (
                            <button
                              className={template.code === selectedTemplateCode ? 'is-selected' : ''}
                              type="button"
                              role="option"
                              aria-selected={template.code === selectedTemplateCode}
                              key={template.id ?? template.code}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setSelectedTemplateCode(template.code);
                                setTemplateDropdownOpen(false);
                                setTemplateSearch('');
                              }}
                            >
                              <span>{template.code}</span>
                              <small>{template.titleTemplate || 'Không có tiêu đề'}</small>
                            </button>
                          ))}
                          {filteredTemplateOptions.length === 0 ? (
                            <div className="segment-searchable-select-empty">Không tìm thấy nội dung thông báo phù hợp</div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </label>

                  <label className="segment-field">
                    <span>Màn hình điều hướng (không bắt buộc)</span>
                    <div
                      className="segment-searchable-select"
                      onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget)) {
                          setScreenDropdownOpen(false);
                          setScreenSearch('');
                        }
                      }}
                    >
                      <button
                        className="segment-searchable-select-trigger"
                        type="button"
                        onClick={() => {
                          setScreenDropdownOpen((current) => {
                            const nextOpen = !current;

                            if (!nextOpen) {
                              setScreenSearch('');
                            }

                            return nextOpen;
                          });
                        }}
                        aria-expanded={screenDropdownOpen}
                        aria-haspopup="listbox"
                      >
                        {actionScreen || '-- Không điều hướng --'}
                      </button>
                      {screenDropdownOpen ? (
                        <div className="segment-searchable-select-options" role="listbox">
                          <div className="segment-searchable-select-search">
                            <input
                              value={screenSearch}
                              onChange={(event) => setScreenSearch(event.target.value)}
                              placeholder="Tìm theo tên màn hình"
                              autoFocus
                            />
                          </div>
                          <button
                            className={actionScreen === '' ? 'is-selected' : ''}
                            type="button"
                            role="option"
                            aria-selected={actionScreen === ''}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setActionScreen('');
                              setScreenDropdownOpen(false);
                              setScreenSearch('');
                            }}
                          >
                            <span>-- Không điều hướng --</span>
                          </button>
                          {filteredScreenOptions.map((screen) => (
                            <button
                              className={screen === actionScreen ? 'is-selected' : ''}
                              type="button"
                              role="option"
                              aria-selected={screen === actionScreen}
                              key={screen}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setActionScreen(screen);
                                setScreenDropdownOpen(false);
                                setScreenSearch('');
                              }}
                            >
                              <span>{screen}</span>
                            </button>
                          ))}
                          {filteredScreenOptions.length === 0 ? (
                            <div className="segment-searchable-select-empty">Không tìm thấy màn hình phù hợp</div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </label>
                </div>
              ) : null}

              {pushStep === 'confirm' ? (
                <div className="segment-modal-form">
                  <div className="segment-push-confirm">
                    <p>
                      Bạn sắp gửi thông báo <strong>{selectedTemplateOption?.code || selectedTemplateCode}</strong> tới{' '}
                      <strong>{segmentUserIds.length.toLocaleString('vi-VN')}</strong> user, chia thành{' '}
                      <strong>{pushBatchCount}</strong> lượt gửi (tối đa {PUSH_NOTIFICATION_BATCH_SIZE.toLocaleString('vi-VN')} user/lượt).
                    </p>
                    {actionScreen ? (
                      <p>
                        Màn hình điều hướng: <strong>{actionScreen}</strong>
                      </p>
                    ) : null}
                    <p className="segment-push-confirm-warning">
                      Đây là thông báo thật, sẽ gửi tới thiết bị của user. Vui lòng kiểm tra kỹ nội dung trước khi xác nhận.
                    </p>
                  </div>
                </div>
              ) : null}

              {pushStep === 'progress' ? (
                <div className="segment-modal-form">
                  <div className="segment-push-batch-list">
                    {pushBatches.map((batch, index) => (
                      <div className={`segment-push-batch-item segment-push-batch-${batch.status}`} key={batch.id}>
                        <span>
                          Lượt {index + 1}/{pushBatches.length} ({batch.userIds.length.toLocaleString('vi-VN')} user)
                        </span>
                        <strong>
                          {batch.status === 'pending' ? 'Chờ gửi' : null}
                          {batch.status === 'sending' ? 'Đang gửi...' : null}
                          {batch.status === 'success' ? 'Thành công' : null}
                          {batch.status === 'error' ? 'Lỗi' : null}
                        </strong>
                      </div>
                    ))}
                  </div>
                  {pushError ? <div className="segment-conversion-alert">{pushError}</div> : null}
                </div>
              ) : null}

              <div className="segment-modal-actions">
                {pushStep === 'form' ? (
                  <>
                    <button className="segment-secondary-button ds-button ds-button-secondary" type="button" onClick={closePushNotiModal}>
                      Hủy
                    </button>
                    <button
                      className="segment-primary-button ds-button ds-button-primary"
                      type="button"
                      onClick={handleReviewPushNotification}
                      disabled={!selectedTemplateCode || segmentUserIds.length === 0 || templatesLoading}
                    >
                      Tiếp tục
                    </button>
                  </>
                ) : null}

                {pushStep === 'confirm' ? (
                  <>
                    <button className="segment-secondary-button ds-button ds-button-secondary" type="button" onClick={() => setPushStep('form')}>
                      Quay lại
                    </button>
                    <button className="segment-primary-button ds-button ds-button-primary" type="button" onClick={handleConfirmSendPushNotification}>
                      Xác nhận gửi
                    </button>
                  </>
                ) : null}

                {pushStep === 'progress' ? (
                  <>
                    <button className="segment-secondary-button ds-button ds-button-secondary" type="button" onClick={closePushNotiModal} disabled={pushSubmitting}>
                      Đóng
                    </button>
                    {!pushSubmitting && pushBatches.some((batch) => batch.status === 'error') ? (
                      <button className="segment-primary-button ds-button ds-button-primary" type="button" onClick={handleRetryFailedBatches}>
                        Gửi lại các lượt lỗi
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        {toastMessage?.text ? (
          <div className={`segment-toast segment-toast-${toastMessage.type || 'success'}`} role="status" aria-live="polite">
            <span>{toastMessage.text}</span>
            <button type="button" onClick={() => setToastMessage(null)} aria-label="Đóng thông báo">
              x
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default SegmentDetailPage;
