import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { fetchSyncConfig, updateSyncConfig as saveSyncConfig } from '../api/syncConfigApi.js';
import ToggleSwitch from '../components/common/ToggleSwitch.jsx';
import Sidebar from '../components/layout/Sidebar.jsx';
import Topbar from '../components/layout/Topbar.jsx';
import { useAppSettings } from '../context/AppSettingsContext.jsx';
import { clearAccessToken } from '../utils/storage.js';

// Tung field so trong section "Cau hinh dong bo" - dung chung 1 template render de khong lap
// lai JSX 7 lan. Them tuy chon moi (server/utils/syncConfigStore.cjs) chi can them 1 dong o day.
// recommendedMin/Max: khoang duoc coi la an toan (du nhanh, du chậm de khong bi TNEX rate-limit
// hay lam qua tai API that). recommendedValue: gia tri dung khi bam "Dung khuyen nghi".
const SYNC_TUNING_FIELDS = [
  {
    key: 'userListDelayMs',
    label: 'Delay đồng bộ DS user',
    description: 'Thời gian chờ giữa mỗi trang khi tải danh sách user.',
    unit: 'ms',
    min: 0,
    max: 10000,
    recommendedMin: 100,
    recommendedMax: 300,
    recommendedValue: 150,
  },
  {
    key: 'userDetailConcurrency',
    label: 'Số luồng song song - chi tiết user',
    description: 'Số user được gọi API chi tiết cùng lúc.',
    unit: 'luồng',
    min: 1,
    max: 20,
    recommendedMin: 3,
    recommendedMax: 8,
    recommendedValue: 5,
  },
  {
    key: 'userDetailDelayMs',
    label: 'Delay đồng bộ chi tiết user',
    description: 'Thời gian chờ giữa mỗi request lấy chi tiết user.',
    unit: 'ms',
    min: 0,
    max: 10000,
    recommendedMin: 100,
    recommendedMax: 300,
    recommendedValue: 150,
  },
  {
    key: 'loanListDelayMs',
    label: 'Delay đồng bộ DS đơn vay',
    description: 'Thời gian chờ giữa mỗi trang khi tải danh sách đơn vay.',
    unit: 'ms',
    min: 0,
    max: 10000,
    recommendedMin: 100,
    recommendedMax: 300,
    recommendedValue: 150,
  },
  {
    key: 'loanDetailDelayMs',
    label: 'Delay đồng bộ chi tiết đơn vay',
    description: 'Thời gian chờ giữa mỗi request lấy chi tiết đơn vay.',
    unit: 'ms',
    min: 0,
    max: 10000,
    recommendedMin: 100,
    recommendedMax: 300,
    recommendedValue: 150,
  },
  {
    key: 'loanDetailConcurrency',
    label: 'Số luồng song song - chi tiết đơn vay',
    description: 'Số đơn vay được gọi API chi tiết cùng lúc (mới bật chạy song song, để mặc định thấp hơn cho an toàn).',
    unit: 'luồng',
    min: 1,
    max: 20,
    recommendedMin: 2,
    recommendedMax: 5,
    recommendedValue: 3,
  },
  {
    key: 'staleRefreshBatchLimit',
    label: 'Giới hạn record cũ refresh mỗi lần',
    description: 'Số user/đơn vay cũ được đồng bộ lại thêm trong 1 lần chạy job (ngoài record mới).',
    unit: 'record',
    min: 1,
    max: 20000,
    recommendedMin: 500,
    recommendedMax: 2000,
    recommendedValue: 1000,
  },
  {
    key: 'staleRefreshDays',
    label: 'Số ngày coi là "cũ" cần đồng bộ lại',
    description: 'Record chi tiết đã đồng bộ quá số ngày này sẽ được tính vào diện cần refresh.',
    unit: 'ngày',
    min: 1,
    max: 90,
    recommendedMin: 3,
    recommendedMax: 14,
    recommendedValue: 7,
  },
];

// Trang cau hinh chung cho web (khac voi cau hinh nghiep vu vd Segment/To chuc). Moi tuy chon
// moi sau nay (hien thi, thong bao...) chi can them 1 <div className="settings-row"> vao dung
// section, hoac tao section moi - khong can dung lai kien truc.
function SettingsPage() {
  const navigate = useNavigate();
  const { settings, updateSetting } = useAppSettings();
  const [syncConfig, setSyncConfig] = useState(null);
  const [syncConfigLoading, setSyncConfigLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [savingKey, setSavingKey] = useState(null);
  const [staleDaysDraft, setStaleDaysDraft] = useState(settings.syncStaleDays);
  const [exportEnrichConcurrencyDraft, setExportEnrichConcurrencyDraft] = useState(settings.exportEnrichConcurrency);
  const [exportEnrichDelayDraft, setExportEnrichDelayDraft] = useState(settings.exportEnrichDelayMs);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  useEffect(() => {
    fetchSyncConfig()
      .then((config) => setSyncConfig(config))
      .catch(() => setLoadError('Không tải được cấu hình đồng bộ.'))
      .finally(() => setSyncConfigLoading(false));

    return () => clearTimeout(toastTimerRef.current);
  }, []);

  // Toast goc tren phai, dung chung template voi cac trang khac (org-toast/segment-toast) - tu
  // dong bien mat sau 3s, thay cho thong bao inline duoi tung field truoc day.
  const showToast = (type, text) => {
    clearTimeout(toastTimerRef.current);
    setToast({ type, text });
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  };

  const handleSyncConfigFieldChange = (key, rawValue) => {
    const value = Number(rawValue);

    if (!Number.isFinite(value)) return;

    setSyncConfig((current) => ({ ...current, [key]: value }));
  };

  // Chi luu DUNG 1 field (partial update) - khong dong bo cac field khac dang sua do chua bam
  // Luu, tranh tinh trang bam Luu o 1 field lai vo tinh ghi luon gia tri cua field khac.
  const handleSaveField = async (key) => {
    setSavingKey(key);

    try {
      const saved = await saveSyncConfig({ [key]: syncConfig[key] });

      // Merge (khong thay the toan bo) - neu server dang chay code cu chua biet field moi nay
      // (vd chua duoc restart sau khi them field), response tra ve se thieu field do; thay the
      // toan bo se lam mat gia tri dang go dang tren cac field khac chua kip lam moi.
      setSyncConfig((current) => ({ ...current, ...saved }));

      // Server chay code cu (chua restart) se AM THAM bo qua field moi ma no chua biet - kiem
      // tra field vua luu co thuc su co trong response khong de bao dung tinh trang thay vi
      // bao "Da luu" gia.
      if (saved[key] === undefined) {
        showToast('warning', 'Server chưa nhận field này - cần restart "npm run dev" rồi lưu lại.');
      } else {
        showToast('success', 'Đã lưu cấu hình đồng bộ.');
      }
    } catch (error) {
      showToast('error', error?.message || 'Lỗi khi lưu.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleSaveStaleDays = () => {
    if (!Number.isFinite(staleDaysDraft) || staleDaysDraft < 1) return;

    updateSetting('syncStaleDays', Math.min(staleDaysDraft, 30));
    showToast('success', 'Đã lưu ngưỡng cảnh báo.');
  };

  const handleSaveExportEnrichConcurrency = () => {
    if (!Number.isFinite(exportEnrichConcurrencyDraft) || exportEnrichConcurrencyDraft < 1) return;

    updateSetting('exportEnrichConcurrency', Math.min(exportEnrichConcurrencyDraft, 10));
    showToast('success', 'Đã lưu.');
  };

  const handleSaveExportEnrichDelay = () => {
    if (!Number.isFinite(exportEnrichDelayDraft) || exportEnrichDelayDraft < 0) return;

    updateSetting('exportEnrichDelayMs', Math.min(exportEnrichDelayDraft, 5000));
    showToast('success', 'Đã lưu.');
  };

  const handleLogout = () => {
    clearAccessToken();
    navigate('/login', { replace: true });
  };

  return (
    <div className="dashboard-shell">
      <Sidebar />
      <div className="dashboard-main">
        <Topbar breadcrumbs={['Hệ thống quản trị', 'Cài đặt']} onLogout={handleLogout} />

        <main className="dashboard-content segment-page">
          <div className="dashboard-heading-row">
            <div>
              <h1>Cài đặt</h1>
              <p>Tuỳ chỉnh giao diện và hành vi chung của web - áp dụng ngay, lưu lại trên trình duyệt này.</p>
            </div>
          </div>

          <section className="settings-section">
            <h3>Hiệu ứng giao diện</h3>
            <p className="settings-section-description">Bật/tắt các hiệu ứng trang trí không ảnh hưởng đến dữ liệu.</p>

            <div className="settings-row">
              <div className="settings-row-info">
                <strong>Lá phong rơi</strong>
                <span>Hiệu ứng lá rơi trang trí toàn màn hình, tự né khi rê chuột lại gần.</span>
              </div>
              <ToggleSwitch
                checked={settings.fallingLeavesEnabled}
                onChange={(value) => updateSetting('fallingLeavesEnabled', value)}
                label="Bật/tắt hiệu ứng lá phong rơi"
              />
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <strong>Nền "điện ảnh"</strong>
                <span>Quầng sáng mờ trôi chậm phía sau nội dung, kèm vignette và film grain nhẹ.</span>
              </div>
              <ToggleSwitch
                checked={settings.cinematicBackgroundEnabled}
                onChange={(value) => updateSetting('cinematicBackgroundEnabled', value)}
                label="Bật/tắt nền điện ảnh"
              />
            </div>
          </section>

          <section className="settings-section">
            <h3>Kiểm tra dữ liệu</h3>
            <p className="settings-section-description">Ngưỡng cảnh báo dùng ở trang "Kiểm tra dữ liệu".</p>

            <div className="settings-row">
              <div className="settings-row-info">
                <strong>Ngưỡng cảnh báo dữ liệu đồng bộ cũ</strong>
                <span>Cảnh báo nếu file đồng bộ local (dùng cho Segment) chưa cập nhật quá số ngày này.</span>
              </div>
              <div className="settings-number-field">
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={staleDaysDraft}
                  onChange={(event) => setStaleDaysDraft(Number(event.target.value))}
                />
                <span>ngày</span>
                <button className="ds-button ds-button-secondary settings-inline-save" type="button" onClick={handleSaveStaleDays}>
                  Lưu
                </button>
              </div>
            </div>
          </section>

          <section className="settings-section">
            <h3>Tra cứu CTV khi xuất file Excel (API thật)</h3>
            <p className="settings-section-description">
              Xuất file "Lịch sử đối soát" tra thông tin CTV (số tài khoản, CCCD, trạng thái hợp đồng) trực tiếp từ API
              thật của TNEX theo từng người (không dùng dữ liệu đồng bộ local) để tránh sai lệch khi mã sale đã đổi chủ.
              Mỗi CTV tốn 2 lần gọi API thật - cấu hình dưới đây kiểm soát tốc độ để tránh gọi dồn dập.
            </p>

            <div className="settings-row">
              <div className="settings-row-info">
                <strong>Số luồng song song</strong>
                <span>Số CTV được tra cứu cùng lúc khi xuất file.</span>
                <span className="settings-recommended-hint">
                  Khuyến nghị an toàn: <strong>1–3 luồng</strong>
                </span>
              </div>
              <div className="settings-number-field">
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={exportEnrichConcurrencyDraft}
                  onChange={(event) => setExportEnrichConcurrencyDraft(Number(event.target.value))}
                />
                <span>luồng</span>
                <button
                  className="ds-button ds-button-primary settings-inline-save"
                  type="button"
                  onClick={handleSaveExportEnrichConcurrency}
                >
                  Lưu
                </button>
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <strong>Delay giữa các lượt tra cứu</strong>
                <span>Thời gian chờ của mỗi luồng sau khi tra xong 1 CTV.</span>
                <span className="settings-recommended-hint">
                  Khuyến nghị an toàn: <strong>150–500 ms</strong>
                </span>
              </div>
              <div className="settings-number-field">
                <input
                  type="number"
                  min={0}
                  max={5000}
                  value={exportEnrichDelayDraft}
                  onChange={(event) => setExportEnrichDelayDraft(Number(event.target.value))}
                />
                <span>ms</span>
                <button
                  className="ds-button ds-button-primary settings-inline-save"
                  type="button"
                  onClick={handleSaveExportEnrichDelay}
                >
                  Lưu
                </button>
              </div>
            </div>
          </section>

          <section className="settings-section">
            <h3>Cấu hình đồng bộ (nâng cao)</h3>
            <p className="settings-section-description">
              Điều chỉnh tốc độ các job đồng bộ (gọi API thật lên hệ thống TNEX) - áp dụng từ lần chạy job tiếp theo,
              không cần restart server. Web này chỉ 1 người dùng nên có thể tăng tốc thoải mái hơn mặc định.
            </p>

            {syncConfigLoading ? (
              <p className="settings-section-description">Đang tải cấu hình...</p>
            ) : loadError ? (
              <p className="settings-section-description">{loadError}</p>
            ) : (
              SYNC_TUNING_FIELDS.map((field) => {
                const isOutsideRecommended =
                  syncConfig &&
                  Number.isFinite(syncConfig[field.key]) &&
                  (syncConfig[field.key] < field.recommendedMin || syncConfig[field.key] > field.recommendedMax);

                return (
                  <div className="settings-row" key={field.key}>
                    <div className="settings-row-info">
                      <strong>{field.label}</strong>
                      <span>{field.description}</span>
                      <span className="settings-recommended-hint">
                        Khuyến nghị an toàn:{' '}
                        <strong>
                          {field.recommendedMin}–{field.recommendedMax} {field.unit}
                        </strong>
                        {isOutsideRecommended ? <em> - giá trị hiện tại đang nằm ngoài khoảng này</em> : null}
                      </span>
                    </div>
                    <div className="settings-number-field">
                      <input
                        type="number"
                        min={field.min}
                        max={field.max}
                        value={syncConfig?.[field.key] ?? ''}
                        onChange={(event) => handleSyncConfigFieldChange(field.key, event.target.value)}
                      />
                      <span>{field.unit}</span>
                      <button
                        className="ds-button ds-button-secondary settings-inline-save"
                        type="button"
                        onClick={() => handleSyncConfigFieldChange(field.key, field.recommendedValue)}
                      >
                        Dùng khuyến nghị
                      </button>
                      <button
                        className="ds-button ds-button-primary settings-inline-save"
                        type="button"
                        onClick={() => handleSaveField(field.key)}
                        disabled={savingKey === field.key}
                      >
                        {savingKey === field.key ? 'Đang lưu...' : 'Lưu'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </section>
        </main>
      </div>

      {toast ? (
        <div className={`settings-toast settings-toast-${toast.type}`} role="status" aria-live="polite">
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Đóng thông báo">
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default SettingsPage;
