import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  fetchAllReconciliationLoans,
  fetchReconciliationLoans,
  updateReconciliationLoanReview,
} from '../api/reconciliationListApi.js';
import { fetchTeamLeadReconciliationPreview } from '../api/teamReconciliationApi.js';
import { fetchUserIdBySaleId, fetchUserProfileById } from '../api/usersApi.js';
import MonthPicker from '../components/common/MonthPicker.jsx';
import ThemedSelect from '../components/common/ThemedSelect.jsx';
import Sidebar from '../components/layout/Sidebar.jsx';
import Topbar from '../components/layout/Topbar.jsx';
import { calculateNetIncome, calculatePersonalIncomeTax, getMemberPersonalRate } from '../utils/commissionFormula.js';
import { formatNumber } from '../utils/formatNumber.js';
import { clearAccessToken } from '../utils/storage.js';

const COMPANY_HEADER = {
  name: 'CÔNG TY TÀI CHÍNH TNHH MỘT THÀNH VIÊN TNEX',
  address: 'Trụ sở chính: Tầng 20, Tòa nhà số 54A Nguyễn Chí Thanh, Phường Láng, TP. Hà Nội, Việt Nam',
  contact: 'Tel: 1900 6954 | Website: www.tnexfinance.com.vn',
};

function DocumentHeader({ reportDate }) {
  return (
    <div className="recon-doc-header">
      <p className="recon-doc-company">{COMPANY_HEADER.name}</p>
      <p className="recon-doc-address">{COMPANY_HEADER.address}</p>
      <p className="recon-doc-contact">{COMPANY_HEADER.contact}</p>
      <h2 className="recon-doc-title">Kết quả bán hàng</h2>
      <p className="recon-doc-subtitle">{formatReportMonth(reportDate)}</p>
    </div>
  );
}

const PAGE_SIZE = 10;

const REVIEW_STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Chờ xác nhận' },
  { value: 'APPROVE', label: 'Approve' },
  { value: 'REJECT', label: 'Reject' },
];

const REVIEW_STATUS_LABELS = { PENDING: 'Chờ xác nhận', APPROVE: 'Approve', REJECT: 'Reject' };
const REVIEW_STATUS_CLASSES = {
  PENDING: 'recon-confirm-pending',
  APPROVE: 'recon-confirm-approve',
  REJECT: 'recon-confirm-reject',
};

function getPreviousMonthValue() {
  const now = new Date();
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  return `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}`;
}

const DEFAULT_FILTERS = {
  reportDate: getPreviousMonthValue(),
  phone: '',
  saleId: '',
};

function formatReportMonth(reportDate) {
  const match = String(reportDate || '').match(/^(\d{4})-(\d{2})/);

  if (!match) return reportDate || '--';

  return `Tháng ${Number(match[2])}/${match[1]}`;
}

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

function ReviewLoanModal({ open, loan, onClose, onSubmit }) {
  const [values, setValues] = useState({ reviewStatus: 'PENDING', commission: '0', note: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !loan) return;

    setValues({
      reviewStatus: loan.reviewStatus || 'PENDING',
      commission: String(loan.commission || 0),
      note: loan.note || '',
    });
    setError('');
    setSaving(false);
  }, [open, loan]);

  if (!open || !loan) return null;

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      await onSubmit({
        id: loan.id,
        reviewStatus: values.reviewStatus,
        commission: Number(values.commission) || 0,
        note: values.note,
      });
    } catch (submitError) {
      setError(submitError?.message || 'Không thể cập nhật đối soát. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="segment-modal-backdrop" role="presentation">
      <section className="segment-modal" role="dialog" aria-modal="true" aria-labelledby="review-loan-modal-title">
        <div className="segment-modal-header">
          <div>
            <h2 id="review-loan-modal-title">Xác nhận đối soát</h2>
            <p>
              Đơn vay {loan.loanId} · {loan.saleId} - {loan.saleName || '--'}
            </p>
          </div>
          <button className="segment-icon-button" type="button" onClick={onClose} aria-label="Đóng">
            x
          </button>
        </div>

        <div className="segment-modal-form">
          <label className="segment-field">
            <span>Trạng thái xác nhận</span>
            <ThemedSelect
              value={values.reviewStatus}
              options={REVIEW_STATUS_OPTIONS}
              onChange={(event) => setValues((current) => ({ ...current, reviewStatus: event.target.value }))}
            />
          </label>
          <label className="segment-field">
            <span>Hoa hồng</span>
            <input
              type="number"
              min="0"
              value={values.commission}
              onChange={(event) => setValues((current) => ({ ...current, commission: event.target.value }))}
              placeholder="Nhập số tiền hoa hồng"
            />
          </label>
          <label className="segment-field">
            <span>Ghi chú phản hồi</span>
            <textarea
              rows={3}
              value={values.note}
              onChange={(event) => setValues((current) => ({ ...current, note: event.target.value }))}
              placeholder="Nhập ghi chú phản hồi"
            />
          </label>
          {error ? <strong className="segment-field-error">{error}</strong> : null}
        </div>

        <div className="segment-modal-actions">
          <button
            className="segment-secondary-button ds-button ds-button-secondary"
            type="button"
            onClick={onClose}
            disabled={saving}
          >
            Hủy
          </button>
          <button
            className="segment-primary-button ds-button ds-button-primary"
            type="button"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </section>
    </div>
  );
}

// Xem truoc file doi soat cua 1 CTV (theo mã sale dang tim kiem), trinh bay dung dang "file doi
// soat" cong ty gui (letterhead + bang + thong tin nhan tien) thay vi chi tong hop so lieu roi
// rac. Hoa hong tung dong tinh theo cong thuc that (utils/commissionFormula.js): xac dinh 1 rate
// duy nhat dua tren TONG doanh so ca ky cua CTV, roi ap rate do cho tung don rieng le.
function ReconciliationPreviewModal({
  open,
  saleId,
  saleName,
  bankAccountNumber,
  reportDate,
  loading,
  error,
  items,
  onClose,
}) {
  if (!open) return null;

  const totalAmount = items.reduce((sum, item) => sum + (item.amount || 0), 0);
  const rate = getMemberPersonalRate(totalAmount);
  const rows = items.map((item) => ({ ...item, commission: Math.round((item.amount || 0) * rate) }));
  const totalCommission = rows.reduce((sum, item) => sum + item.commission, 0);
  const personalIncomeTax = calculatePersonalIncomeTax(totalCommission);
  const netIncome = calculateNetIncome(totalCommission);

  return (
    <div className="segment-modal-backdrop" role="presentation">
      <section
        className="segment-modal segment-user-id-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recon-preview-modal-title"
      >
        <div className="segment-modal-header" style={{ justifyContent: 'flex-end' }}>
          <h2 id="recon-preview-modal-title" className="segment-sr-only-when-doc">
            Xem trước đối soát - {saleId}
          </h2>
          <button className="segment-icon-button" type="button" onClick={onClose} aria-label="Đóng">
            x
          </button>
        </div>

        <div className="segment-modal-form segment-user-id-modal-body">
          {loading ? <p>Đang tải dữ liệu...</p> : null}
          {!loading && error ? <strong className="segment-field-error">{error}</strong> : null}

          {!loading && !error ? (
            <div className="recon-doc">
              <DocumentHeader reportDate={reportDate} />

              <div className="recon-doc-table-wrap">
                <table className="recon-doc-table">
                  <thead>
                    <tr>
                      <th>STT</th>
                      <th>Họ và tên</th>
                      <th>SĐT</th>
                      <th>Tổng DSGN thực tế (tính hoa hồng)</th>
                      <th>Thu nhập</th>
                      <th>Loại sản phẩm</th>
                      <th>Trạng thái</th>
                      <th>Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((item, index) => (
                      <tr key={item.id}>
                        <td className="recon-doc-cell-center">{index + 1}</td>
                        <td>{item.customerName || '--'}</td>
                        <td className="recon-doc-cell-center">{item.phone || '--'}</td>
                        <td className="recon-doc-cell-number">{formatNumber(item.amount)}</td>
                        <td className="recon-doc-cell-number">{formatNumber(item.commission)}</td>
                        <td>{item.productName || '--'}</td>
                        <td className="recon-doc-cell-center">{item.loanStatus || '--'}</td>
                        <td>{item.noteHighlight || item.note || '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>Tổng</td>
                      <td className="recon-doc-cell-number">{formatNumber(totalAmount)}</td>
                      <td className="recon-doc-cell-number">{formatNumber(totalCommission)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <p className="recon-doc-info">
                <strong>Mã ID:</strong> {saleId}
                <br />
                <strong>Họ và tên:</strong> {saleName || '--'}
                <br />
                <strong>Chức danh:</strong> Cộng tác viên
                <br />
                <strong>STK TNEX nhận tiền:</strong> {bankAccountNumber || '--'}
                <br />
                <strong>Mã số thuế:</strong>
                <br />
                <strong>Số lượng hợp đồng giải ngân:</strong> {rows.length}
                <br />
                <strong>Tổng doanh số giải ngân:</strong> {formatNumber(totalAmount)}
                <br />
                <strong>Thu nhập (hoa hồng):</strong> {formatNumber(totalCommission)}
                <br />
                <strong>Thuế TNCN:</strong> {formatNumber(personalIncomeTax)}
                <br />
                <strong>Thu nhập thực nhận:</strong> {formatNumber(netIncome)}
              </p>
            </div>
          ) : null}
        </div>

        <div className="segment-modal-actions">
          <button className="segment-secondary-button ds-button ds-button-secondary" type="button" onClick={onClose}>
            Đóng
          </button>
        </div>
      </section>
    </div>
  );
}

// Xem truoc file doi soat cua TEAM LEAD - khac CTV thuong o cho co 2 phan: (1) doanh so/hoa hong
// CA NHAN cua lead (thuong = 0 vi lead khong dung ten don nao), (2) doanh so/hoa hong cua TUNG
// THANH VIEN trong team, da duoc tinh theo cong thuc override (xem teamReconciliationApi.js).
function TeamLeadPreviewModal({ open, reportDate, loading, error, preview, onClose }) {
  if (!open) return null;

  return (
    <div className="segment-modal-backdrop" role="presentation">
      <section
        className="segment-modal segment-user-id-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recon-team-preview-modal-title"
      >
        <div className="segment-modal-header" style={{ justifyContent: 'flex-end' }}>
          <h2 id="recon-team-preview-modal-title" className="segment-sr-only-when-doc">
            Xem trước đối soát - {preview?.lead?.saleId || '--'} (Team Lead)
          </h2>
          <button className="segment-icon-button" type="button" onClick={onClose} aria-label="Đóng">
            x
          </button>
        </div>

        <div className="segment-modal-form segment-user-id-modal-body">
          {loading ? <p>Đang tải dữ liệu...</p> : null}
          {!loading && error ? <strong className="segment-field-error">{error}</strong> : null}

          {!loading && !error && preview ? (
            <div className="recon-doc">
              <DocumentHeader reportDate={reportDate} />

              {preview.warnings?.length > 0 ? (
                <div className="recon-doc-warning-box">
                  {preview.warnings.map((warning, index) => (
                    <p key={index}>⚠ {warning}</p>
                  ))}
                </div>
              ) : null}

              <h3 className="recon-doc-section-title">1. Kết quả bán hàng cá nhân</h3>
              <div className="recon-doc-table-wrap">
                <table className="recon-doc-table">
                  <thead>
                    <tr>
                      <th>STT</th>
                      <th>Họ và tên</th>
                      <th>SĐT</th>
                      <th>Tổng DSGN thực tế (tính hoa hồng)</th>
                      <th>Thu nhập</th>
                      <th>Loại sản phẩm</th>
                      <th>Trạng thái</th>
                      <th>Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.personal.items.map((item, index) => (
                      <tr key={item.id}>
                        <td className="recon-doc-cell-center">{index + 1}</td>
                        <td>{item.customerName || '--'}</td>
                        <td className="recon-doc-cell-center">{item.phone || '--'}</td>
                        <td className="recon-doc-cell-number">{formatNumber(item.amount)}</td>
                        <td className="recon-doc-cell-number">{formatNumber(item.commission)}</td>
                        <td>{item.productName || '--'}</td>
                        <td className="recon-doc-cell-center">{item.loanStatus || '--'}</td>
                        <td>{item.noteHighlight || item.note || '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>Tổng</td>
                      <td className="recon-doc-cell-number">{formatNumber(preview.personal.totalRevenue)}</td>
                      <td className="recon-doc-cell-number">{formatNumber(preview.personal.totalCommission)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <h3 className="recon-doc-section-title">2. Kết quả bán hàng của Team</h3>
              <div className="recon-doc-table-wrap">
                <table className="recon-doc-table">
                  <thead>
                    <tr>
                      <th>STT</th>
                      <th>Họ và tên</th>
                      <th>Mã CTV</th>
                      <th>Doanh số</th>
                      <th>Thu nhập</th>
                      <th>Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.team.members.length === 0 ? (
                      <tr>
                        <td className="segment-table-state" colSpan={6}>
                          Team không có doanh số trong kỳ này.
                        </td>
                      </tr>
                    ) : null}

                    {preview.team.members.map((member, index) => (
                      <tr key={member.saleId}>
                        <td className="recon-doc-cell-center">{index + 1}</td>
                        <td>{member.name || '--'}</td>
                        <td className="recon-doc-cell-center">{member.saleId}</td>
                        <td className="recon-doc-cell-number">{formatNumber(member.revenue)}</td>
                        <td className="recon-doc-cell-number">{formatNumber(member.commission)}</td>
                        <td>{member.note || '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>Tổng</td>
                      <td className="recon-doc-cell-number">{formatNumber(preview.team.totalRevenue)}</td>
                      <td className="recon-doc-cell-number">{formatNumber(preview.team.totalCommission)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <h3 className="recon-doc-section-title">3. Thu nhập tại mục 3 = (1) + (2)</h3>
              <p className="recon-doc-info">
                Thu nhập {formatReportMonth(reportDate).toLowerCase()} ={' '}
                {formatNumber(preview.personal.totalCommission)} + {formatNumber(preview.team.totalCommission)} ={' '}
                <strong>{formatNumber(preview.totalIncome)}</strong>
              </p>

              <h3 className="recon-doc-section-title">4. Thông tin nhận thu nhập</h3>
              <p className="recon-doc-info">
                <strong>Mã đối tác:</strong> {preview.lead.saleId}
                <br />
                <strong>Mã ID:</strong> {preview.lead.saleId}
                <br />
                <strong>Họ và tên:</strong> {preview.lead.name}
                <br />
                <strong>Chức danh:</strong> {preview.lead.title}
                <br />
                <strong>STK TNEX nhận tiền:</strong> {preview.lead.bankAccountNumber || '--'}
                <br />
                <strong>Mã số thuế:</strong>
                <br />
                <strong>Thuế TNCN:</strong> {formatNumber(calculatePersonalIncomeTax(preview.totalIncome))}
                <br />
                <strong>Thu nhập thực nhận:</strong> {formatNumber(calculateNetIncome(preview.totalIncome))}
              </p>
            </div>
          ) : null}
        </div>

        <div className="segment-modal-actions">
          <button className="segment-secondary-button ds-button ds-button-secondary" type="button" onClick={onClose}>
            Đóng
          </button>
        </div>
      </section>
    </div>
  );
}

function ReconciliationListPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reviewLoan, setReviewLoan] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [appliedSaleId, setAppliedSaleId] = useState('');
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewItems, setPreviewItems] = useState([]);
  const [previewSaleName, setPreviewSaleName] = useState('');
  const [previewBankAccount, setPreviewBankAccount] = useState('');
  const [teamLeadPreview, setTeamLeadPreview] = useState(null);
  const [teamLeadModalOpen, setTeamLeadModalOpen] = useState(false);
  const [teamLeadLoading, setTeamLeadLoading] = useState(false);
  const [teamLeadError, setTeamLeadError] = useState('');

  const runSearch = async (nextPage = 1) => {
    setLoading(true);
    setError('');

    try {
      const result = await fetchReconciliationLoans({
        reportDate: filters.reportDate,
        phone: filters.phone.trim(),
        saleId: filters.saleId.trim(),
        page: nextPage - 1,
        size: PAGE_SIZE,
      });

      setItems(result.items);
      setPage(nextPage);
      setTotalPages(result.totalPages);
      setTotalElements(result.totalElements);

      return result;
    } catch (requestError) {
      setItems([]);
      setTotalPages(1);
      setTotalElements(0);
      setError(getApiErrorMessage(requestError, 'Không thể tải danh sách đối soát. Vui lòng thử lại.'));

      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runSearch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateFilter = (name, value) => {
    setFilters((current) => ({ ...current, [name]: value }));
  };

  // Sau khi tim kiem, neu co nhap ma sale nhung KHONG co don nao (CTV thuong se co don, Team Lead
  // thi khong bao gio co don) -> thu kiem tra xem ma sale do co phai Team Lead dang quan ly 1
  // team khong, de hien nut preview rieng cho truong hop nay (xem teamReconciliationApi.js).
  const applyFilters = async () => {
    const saleId = filters.saleId.trim();

    setAppliedSaleId(saleId);
    setTeamLeadPreview(null);
    setTeamLeadError('');

    const result = await runSearch(1);

    if (!saleId || (result && result.totalElements > 0)) return;

    setTeamLeadLoading(true);

    try {
      const preview = await fetchTeamLeadReconciliationPreview({ reportDate: filters.reportDate, leadSaleId: saleId });

      setTeamLeadPreview(preview);
    } catch (teamLeadRequestError) {
      setTeamLeadError(getApiErrorMessage(teamLeadRequestError, 'Không thể kiểm tra dữ liệu Team Lead.'));
    } finally {
      setTeamLeadLoading(false);
    }
  };

  // Nut "Xem truoc doi soat" chi xuat hien khi dang tim theo 1 ma sale cu the va co ket qua -
  // bam vao se tai toan bo don vay cua ma sale do trong ky (khong phan trang) de xem truoc, cong
  // STK ngan hang (khong co san trong search-disbursed) de hien day du nhu file mau.
  const openPreview = async () => {
    setPreviewModalOpen(true);
    setPreviewLoading(true);
    setPreviewError('');
    setPreviewBankAccount('');

    try {
      const allItems = await fetchAllReconciliationLoans({ reportDate: filters.reportDate, saleId: appliedSaleId });

      setPreviewItems(allItems);
      setPreviewSaleName(allItems.find((item) => item.saleName)?.saleName || '');

      try {
        const userLookup = await fetchUserIdBySaleId(appliedSaleId);

        if (userLookup?.userId) {
          const profile = await fetchUserProfileById(userLookup.userId);

          setPreviewBankAccount(profile?.bankAccountNumber || '');
        }
      } catch {
        // STK chi de hien thi tham khao, khong chan luong xem truoc neu tra cuu loi.
      }
    } catch (previewRequestError) {
      setPreviewItems([]);
      setPreviewError(getApiErrorMessage(previewRequestError, 'Không thể tải dữ liệu xem trước. Vui lòng thử lại.'));
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewModalOpen(false);
  };

  const handleLogout = () => {
    clearAccessToken();
    navigate('/login', { replace: true });
  };

  const goToPage = (nextPage) => {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) return;

    runSearch(nextPage);
  };

  // "Xac nhan doi soat" chua co API that - chi patch truc tiep dong tuong ung tren client, khong
  // goi runSearch lai (se bi API that ghi de mat thay doi vua lam).
  const handleReviewSubmit = async (payload) => {
    const updated = await updateReconciliationLoanReview(payload);

    setItems((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
    setReviewLoan(null);
    setToastMessage({
      type: 'success',
      text: 'Đã cập nhật kết quả đối soát (chỉ trên giao diện, chưa có API lưu lại).',
    });
  };

  const paginationItems = getPaginationItems(page, totalPages);
  const totalElementsLabel = totalElements.toLocaleString('vi-VN');

  return (
    <div className="dashboard-shell">
      <Sidebar />
      <div className="dashboard-main">
        <Topbar
          breadcrumbs={['Hệ thống quản trị', 'Quản lý đối soát', 'Danh sách đối soát']}
          isRefreshing={loading}
          onLogout={handleLogout}
          onRefresh={() => runSearch(page)}
        />

        <main className="dashboard-content segment-page">
          <div className="dashboard-heading-row">
            <div>
              <h1>Danh sách đối soát</h1>
              <p>Theo dõi và xác nhận kết quả đối soát hoa hồng theo từng đơn vay.</p>
            </div>
          </div>

          <section className="segment-filter-card">
            <div className="segment-card-header">
              <h2>Danh sách đơn vay</h2>
            </div>
            <div className="recon-filter-grid">
              <label className="segment-field">
                <span>Thời gian</span>
                <div className="recon-month-picker">
                  <MonthPicker
                    value={filters.reportDate}
                    onChange={(value) => updateFilter('reportDate', value)}
                    label={filters.reportDate ? formatReportMonth(filters.reportDate) : ''}
                    placeholder="Chọn tháng đối soát"
                    ariaLabel="Chọn tháng đối soát"
                  />
                </div>
              </label>
              <label className="segment-field">
                <span>Số điện thoại</span>
                <input
                  type="text"
                  value={filters.phone}
                  onChange={(event) => updateFilter('phone', event.target.value)}
                  placeholder="Nhập số điện thoại"
                />
              </label>
              <label className="segment-field">
                <span>Mã sale</span>
                <input
                  type="text"
                  value={filters.saleId}
                  onChange={(event) => updateFilter('saleId', event.target.value)}
                  placeholder="Nhập mã sale"
                />
              </label>
            </div>
            <div className="segment-filter-actions">
              <button
                className="segment-primary-button ds-button ds-button-primary"
                type="button"
                onClick={applyFilters}
                disabled={loading}
              >
                Áp dụng
              </button>
            </div>
          </section>

          <section className="segment-table-card">
            {appliedSaleId && totalElements > 0 ? (
              <div className="segment-table-header recon-list-toolbar">
                <button
                  className="segment-primary-button ds-button ds-button-primary"
                  type="button"
                  onClick={openPreview}
                >
                  Xem trước đối soát
                </button>
              </div>
            ) : null}

            {appliedSaleId && totalElements === 0 && teamLeadPreview?.isTeamLead ? (
              <div className="segment-table-header recon-list-toolbar">
                <button
                  className="segment-primary-button ds-button ds-button-primary"
                  type="button"
                  onClick={() => setTeamLeadModalOpen(true)}
                >
                  Xem trước đối soát (Team Lead)
                </button>
              </div>
            ) : null}

            <div className="segment-table-wrap">
              <table className="segment-table recon-list-table">
                <thead>
                  <tr>
                    <th>Mã Sale</th>
                    <th>Tên Sale</th>
                    <th>Mã đơn vay</th>
                    <th>Mã sản phẩm</th>
                    <th>Tên sản phẩm</th>
                    <th>Tên khách hàng</th>
                    <th>Số điện thoại</th>
                    <th>Số tiền</th>
                    <th>Trạng thái</th>
                    <th>Hoa hồng</th>
                    <th>Trạng thái xác nhận</th>
                    <th>Ghi chú phản hồi</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td className="segment-table-state" colSpan={13}>
                        Đang tải dữ liệu...
                      </td>
                    </tr>
                  ) : null}

                  {!loading && error ? (
                    <tr>
                      <td className="segment-table-state segment-table-error" colSpan={13}>
                        {error}
                      </td>
                    </tr>
                  ) : null}

                  {!loading && !error && items.length === 0 ? (
                    <tr>
                      <td className="segment-table-state" colSpan={13}>
                        Không tìm thấy đơn vay phù hợp.
                      </td>
                    </tr>
                  ) : null}

                  {!loading && !error
                    ? items.map((item) => (
                        <tr key={item.id}>
                          <td>{item.saleId || '--'}</td>
                          <td>{item.saleName || '--'}</td>
                          <td>{item.loanId || '--'}</td>
                          <td>{item.productCode || '--'}</td>
                          <td>{item.productName || '--'}</td>
                          <td>{item.customerName || '--'}</td>
                          <td>{item.phone || '--'}</td>
                          <td>{formatNumber(item.amount)}</td>
                          <td>{item.loanStatus || '--'}</td>
                          <td>{formatNumber(item.commission)}</td>
                          <td>
                            <span
                              className={`recon-confirm-status ${REVIEW_STATUS_CLASSES[item.reviewStatus] || 'recon-confirm-pending'}`}
                            >
                              {REVIEW_STATUS_LABELS[item.reviewStatus] || item.reviewStatus || '--'}
                            </span>
                          </td>
                          <td>
                            {item.note || '--'}
                            {item.noteHighlight ? (
                              <>
                                {' | '}
                                <span className={`recon-note-highlight recon-note-${item.noteVariant || 'neutral'}`}>
                                  {item.noteHighlight}
                                </span>
                              </>
                            ) : null}
                          </td>
                          <td>
                            <div className="segment-row-actions">
                              <button
                                className="ds-icon-button ds-icon-button-primary segment-action-edit"
                                type="button"
                                onClick={() => setReviewLoan(item)}
                                aria-label="Xác nhận đối soát"
                                title="Xác nhận đối soát"
                              />
                            </div>
                          </td>
                        </tr>
                      ))
                    : null}
                </tbody>
              </table>
            </div>

            <div className="segment-pagination">
              <span>Tổng số {totalElementsLabel} bản ghi</span>
              <div className="segment-page-buttons">
                <button type="button" onClick={() => goToPage(page - 1)} disabled={page <= 1 || loading}>
                  ← Trước
                </button>
                {paginationItems.map((item) =>
                  typeof item === 'number' ? (
                    <button
                      className={`segment-page-number${item === page ? ' is-active' : ''}`}
                      type="button"
                      onClick={() => goToPage(item)}
                      disabled={loading || item === page}
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
                <button type="button" onClick={() => goToPage(page + 1)} disabled={page >= totalPages || loading}>
                  Sau →
                </button>
              </div>
            </div>
          </section>
        </main>

        <ReviewLoanModal
          open={Boolean(reviewLoan)}
          loan={reviewLoan}
          onClose={() => setReviewLoan(null)}
          onSubmit={handleReviewSubmit}
        />

        <ReconciliationPreviewModal
          open={previewModalOpen}
          saleId={appliedSaleId}
          saleName={previewSaleName}
          bankAccountNumber={previewBankAccount}
          reportDate={filters.reportDate}
          loading={previewLoading}
          error={previewError}
          items={previewItems}
          onClose={closePreview}
        />

        <TeamLeadPreviewModal
          open={teamLeadModalOpen}
          reportDate={filters.reportDate}
          loading={teamLeadLoading}
          error={teamLeadError}
          preview={teamLeadPreview}
          onClose={() => setTeamLeadModalOpen(false)}
        />

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
    </div>
  );
}

export default ReconciliationListPage;
