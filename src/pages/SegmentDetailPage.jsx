import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import Sidebar from '../components/layout/Sidebar.jsx';
import Topbar from '../components/layout/Topbar.jsx';
import { getSegmentById, getSegmentConversion } from '../services/segmentLocalService.js';
import { clearAccessToken } from '../utils/storage.js';

const PAGE_SIZE = 10;

function getCurrentMonth() {
  const d = new Date();

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function valueOrDash(value) {
  if (value === undefined || value === null || String(value).trim() === '') return '--';

  return value;
}

function formatDateTime(value) {
  const text = String(value || '').trim();

  if (!text) return '--';

  const date = new Date(text.replace(' ', 'T'));

  if (Number.isNaN(date.getTime())) return text;

  return date.toLocaleString('vi-VN');
}

function formatNumber(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value) || 0);
}

function formatRate(value) {
  return `${(Number(value) || 0).toFixed(2)}%`;
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

function getFilterItems(filters = {}) {
  const organization = filters.organizationName || filters.orgName || filters.organizationCode || filters.organizationId;

  return [
    ['Từ ngày tạo tài khoản', filters.createdFrom || 'Tất cả'],
    ['Đến ngày tạo tài khoản', filters.createdTo || 'Tất cả'],
    ['Trạng thái ký hợp đồng', getContractLabel(filters.contractStatus)],
    ['Liên kết tài khoản TNEX', getLinkedLabel(filters.tnexLinkedStatus)],
    ['Tổ chức quản lý', organization || 'Tất cả'],
    ['Tháng giải ngân', filters.disbursementMonth || 'Tất cả'],
    ['Doanh số tối thiểu', filters.disbursementAmountFrom ? formatNumber(filters.disbursementAmountFrom) : '--'],
    ['Doanh số tối đa', filters.disbursementAmountTo ? formatNumber(filters.disbursementAmountTo) : '--'],
  ];
}

function SimpleTable({ columns, rows, emptyText, rowKey }) {
  return (
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
  );
}

function SegmentDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { segmentId } = useParams();
  const [segment, setSegment] = useState(null);
  const [segmentMissing, setSegmentMissing] = useState(false);
  const [userPage, setUserPage] = useState(1);
  const [evaluationMonth, setEvaluationMonth] = useState(getCurrentMonth);
  const [appliedMonth, setAppliedMonth] = useState(getCurrentMonth);
  const [conversion, setConversion] = useState(null);
  const [conversionLoading, setConversionLoading] = useState(false);
  const [conversionError, setConversionError] = useState('');
  const [toastMessage, setToastMessage] = useState(null);

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
  const pagedUsers = useMemo(() => {
    const start = (userPage - 1) * PAGE_SIZE;

    return segmentUsers.slice(start, start + PAGE_SIZE);
  }, [segmentUsers, userPage]);
  const userTotalPages = Math.max(Math.ceil(segmentUsers.length / PAGE_SIZE), 1);

  const loadConversion = async (month = appliedMonth) => {
    if (!segment) return;

    setConversionLoading(true);
    setConversionError('');

    try {
      const result = await getSegmentConversion({
        segmentId,
        evaluationMonth: month,
        segmentUsers,
      });

      setConversion(result);
    } catch (error) {
      setConversion(null);
      setConversionError(error?.response?.data?.message || error.message || 'Không thể tải hiệu quả chuyển đổi.');
    } finally {
      setConversionLoading(false);
    }
  };

  useEffect(() => {
    if (!segment) return;

    loadConversion(appliedMonth);
  }, [segment, appliedMonth]);

  const handleLogout = () => {
    clearAccessToken();
    navigate('/login', { replace: true });
  };

  const applyEvaluationMonth = () => {
    setAppliedMonth(evaluationMonth || getCurrentMonth());
  };

  return (
    <div className="dashboard-shell">
      <Sidebar />
      <div className="dashboard-main">
        <Topbar
          breadcrumbs={['Hệ thống quản trị', 'Trung tâm thông báo', 'Quản lý Segment', 'Chi tiết Segment']}
          onLogout={handleLogout}
          onRefresh={() => loadConversion(appliedMonth)}
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
                  <strong className="segment-user-total">Tổng số: {segmentUsers.length} user</strong>
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
                    <span>
                      Hiển thị {(userPage - 1) * PAGE_SIZE + 1}-{Math.min(userPage * PAGE_SIZE, segmentUsers.length)} của {segmentUsers.length} user
                    </span>
                    <div className="segment-page-buttons">
                      <button type="button" onClick={() => setUserPage((page) => Math.max(page - 1, 1))} disabled={userPage <= 1}>
                        ← Trước
                      </button>
                      <button type="button" disabled>
                        {userPage}
                      </button>
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
                    <p>Theo dõi user trong segment phát sinh đơn và đơn giải ngân theo tháng đánh giá.</p>
                  </div>
                  <label className="segment-field segment-month-field">
                    <span>Tháng đánh giá</span>
                    <div className="segment-month-control">
                      <input type="month" value={evaluationMonth} onChange={(event) => setEvaluationMonth(event.target.value)} />
                      <button className="segment-primary-button ds-button ds-button-primary" type="button" onClick={applyEvaluationMonth} disabled={conversionLoading}>
                        Áp dụng
                      </button>
                    </div>
                  </label>
                </div>

                {conversionError ? <div className="segment-conversion-alert">{conversionError}</div> : null}
                {conversionLoading ? <div className="segment-table-state">Đang tải hiệu quả chuyển đổi...</div> : null}

                {conversion ? (
                  <>
                    <div className="segment-conversion-kpis">
                      <KpiCard label="Tổng user trong segment" value={formatNumber(conversion.totalSegmentUsers)} />
                      <KpiCard label="User có đơn" value={`${formatNumber(conversion.usersWithLoanCount)} / ${formatNumber(conversion.totalSegmentUsers)}`} />
                      <KpiCard label="Tỷ lệ chuyển đổi ra đơn" value={formatRate(conversion.usersWithLoanRate)} />
                      <KpiCard
                        label="User có đơn giải ngân"
                        value={`${formatNumber(conversion.usersWithClosedLoanCount)} / ${formatNumber(conversion.totalSegmentUsers)}`}
                        subValue={formatRate(conversion.usersWithClosedLoanRate)}
                      />
                      <KpiCard label="Tổng đơn trong tháng" value={formatNumber(conversion.totalLoanRecordsInMonth)} />
                      <KpiCard label="Tổng đơn CLOSED" value={formatNumber(conversion.totalClosedLoanRecordsInMonth)} />
                      <KpiCard label="ApprovedAmount CLOSED" value={formatNumber(conversion.totalApprovedAmountClosed)} />
                    </div>

                    <div className="segment-conversion-section">
                      <h3>User có đơn</h3>
                      <SimpleTable
                        columns={[
                          { key: 'index', label: 'ID', render: (_, index) => index + 1 },
                          { key: 'saleId', label: 'Mã Sale' },
                          { key: 'userId', label: 'UserID' },
                          { key: 'loanCount', label: 'Số đơn' },
                          { key: 'latestStatus', label: 'Trạng thái gần nhất' },
                          { key: 'latestEventTime', label: 'Thời gian gần nhất' },
                        ]}
                        rows={conversion.usersWithLoan || []}
                        emptyText="Không có đơn phát sinh trong tháng đánh giá."
                      />
                    </div>

                    <div className="segment-conversion-section">
                      <h3>Đơn giải ngân CLOSED</h3>
                      <SimpleTable
                        columns={[
                          { key: 'index', label: 'ID', render: (_, index) => index + 1 },
                          { key: 'saleId', label: 'Mã Sale' },
                          { key: 'userId', label: 'UserID' },
                          { key: 'loanId', label: 'LoanId' },
                          { key: 'phoneNumber', label: 'Phone' },
                          { key: 'status', label: 'Trạng thái' },
                          { key: 'eventTime', label: 'Thời gian CLOSED' },
                          { key: 'approvedAmount', label: 'ApprovedAmount', render: (row) => formatNumber(row.approvedAmount) },
                        ]}
                        rows={conversion.closedLoanRecordsInMonth || []}
                        emptyText="Không có đơn giải ngân CLOSED trong tháng đánh giá."
                        rowKey={(row, index) => `${row.loanId}-${row.status}-${row.eventTime}-${index}`}
                      />
                    </div>
                  </>
                ) : null}
              </section>
            </>
          ) : null}
        </main>

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
