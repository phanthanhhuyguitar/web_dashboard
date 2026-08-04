import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from '../../api/notificationCenterApi.js';
import {
  getSyncLoanDetailListStatus,
  getSyncLoanListStatus,
  getSyncUserDetailListStatus,
  getSyncUserListStatus,
} from '../../services/segmentLocalService.js';

const POLL_INTERVAL_MS = 15000;
const ACTIVE_JOB_POLL_MS = 3000;
const SYNC_TYPES = new Set(['SYNC_STARTED', 'SYNC_COMPLETED', 'SYNC_FAILED']);
const PUSH_NOTI_TYPES = new Set(['PUSH_NOTI_STARTED', 'PUSH_NOTI_COMPLETED', 'PUSH_NOTI_FAILED']);
const ORG_MOVE_TYPES = new Set(['ORG_MOVE_STARTED', 'ORG_MOVE_COMPLETED', 'ORG_MOVE_FAILED']);
const SEVERITY_LABEL = { error: 'Lỗi', warning: 'Cảnh báo', info: 'Thông tin' };
const STATUS_FETCHERS = {
  USER_LIST: getSyncUserListStatus,
  USER_DETAIL: getSyncUserDetailListStatus,
  LOAN: getSyncLoanListStatus,
  LOAN_DETAIL: getSyncLoanDetailListStatus,
};

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function formatRelativeTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);

  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;

  const diffHour = Math.floor(diffMin / 60);

  if (diffHour < 24) return `${diffHour} giờ trước`;

  const diffDay = Math.floor(diffHour / 24);

  return `${diffDay} ngày trước`;
}

function getJobId(item) {
  return item?.meta?.jobId || item?.sourceKey;
}

function getDataQualityCheckId(item) {
  return String(item?.sourceKey || '').replace(/^dq:/, '');
}

function NotificationBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [liveProgress, setLiveProgress] = useState({});
  const containerRef = useRef(null);

  const loadNotifications = async () => {
    try {
      const result = await fetchNotifications(50);

      setItems(result.items);
      setUnreadCount(result.unreadCount);
    } catch {
      // Fail-open: loi tai chuong khong duoc lam gian doan trang chinh.
    }
  };

  useEffect(() => {
    loadNotifications();

    const interval = setInterval(loadNotifications, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleRefreshEvent() {
      loadNotifications();
    }

    window.addEventListener('tnex:notifications-refresh', handleRefreshEvent);

    return () => window.removeEventListener('tnex:notifications-refresh', handleRefreshEvent);
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Job "SYNC_STARTED" nhung chua co dong "SYNC_COMPLETED"/"SYNC_FAILED" cung sourceKey (jobId)
  // -> con dang chay, can hoi tien do live tu dung endpoint status theo jobType.
  const activeSyncItems = useMemo(() => {
    const finishedJobIds = new Set(
      items.filter((item) => item.type === 'SYNC_COMPLETED' || item.type === 'SYNC_FAILED').map((item) => item.sourceKey)
    );

    return items.filter((item) => item.type === 'SYNC_STARTED' && !finishedJobIds.has(item.sourceKey));
  }, [items]);

  useEffect(() => {
    if (!isOpen || activeSyncItems.length === 0) return undefined;

    let cancelled = false;

    const pollActiveJobs = async () => {
      const updates = {};

      await Promise.all(
        activeSyncItems.map(async (item) => {
          const jobId = getJobId(item);
          const fetcher = STATUS_FETCHERS[item.meta?.jobType];

          if (!jobId || !fetcher) return;

          try {
            updates[jobId] = await fetcher(jobId);
          } catch {
            // Bo qua loi 1 job rieng le, khong lam hong ca danh sach thong bao.
          }
        })
      );

      if (!cancelled) setLiveProgress((current) => ({ ...current, ...updates }));
    };

    pollActiveJobs();

    const interval = setInterval(pollActiveJobs, ACTIVE_JOB_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeSyncItems.map(getJobId).join(',')]);

  const handleToggle = () => {
    setIsOpen((open) => !open);

    if (!isOpen) loadNotifications();
  };

  const handleItemClick = async (item) => {
    if (!item.isRead) {
      setItems((current) => current.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
      setUnreadCount((count) => Math.max(0, count - 1));

      try {
        await markNotificationRead(item.id);
      } catch {
        loadNotifications();
      }
    }

    if (SYNC_TYPES.has(item.type)) {
      setIsOpen(false);
      navigate('/data-quality', { state: { focusJobId: getJobId(item), focusJobType: item.meta?.jobType } });
      return;
    }

    if (item.type === 'TEAM_RISK') {
      setIsOpen(false);
      navigate('/dashboard', { state: { focusTeamRisk: true } });
      return;
    }

    if (item.type === 'DATA_QUALITY') {
      setIsOpen(false);
      navigate('/data-quality', { state: { focusCheckId: getDataQualityCheckId(item) } });
      return;
    }

    if (PUSH_NOTI_TYPES.has(item.type) && item.meta?.segmentId) {
      setIsOpen(false);
      navigate(`/segments/${encodeURIComponent(item.meta.segmentId)}/detail`);
      return;
    }

    if (ORG_MOVE_TYPES.has(item.type)) {
      setIsOpen(false);
      navigate('/organization');
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return;

    setItems((current) => current.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);

    try {
      await markAllNotificationsRead();
    } catch {
      loadNotifications();
    }
  };

  return (
    <div className="notification-bell-wrap" ref={containerRef}>
      <button
        className="notification-bell-button"
        type="button"
        onClick={handleToggle}
        aria-label="Thông báo"
        aria-expanded={isOpen}
      >
        <BellIcon />
        {unreadCount > 0 ? <span className="notification-bell-badge">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
      </button>

      {isOpen ? (
        <section className="notification-bell-panel" role="dialog" aria-label="Danh sách thông báo">
          <header className="notification-bell-panel-header">
            <strong>Thông báo</strong>
            <button type="button" onClick={handleMarkAllRead} disabled={unreadCount === 0}>
              Đánh dấu tất cả đã đọc
            </button>
          </header>

          <div className="notification-bell-list">
            {items.length === 0 ? <div className="notification-bell-empty">Chưa có thông báo nào</div> : null}

            {items.map((item) => {
              const isActive = SYNC_TYPES.has(item.type) && activeSyncItems.some((active) => active.id === item.id);
              const live = isActive ? liveProgress[getJobId(item)] : null;
              const progressPercent = Math.min(Math.max(Number(live?.progress) || 0, 0), 100);

              return (
                <button
                  key={item.id}
                  type="button"
                  className={`notification-bell-item notification-bell-item-${item.severity}${item.isRead ? ' is-read' : ''}${
                    item.resolvedAt ? ' is-resolved' : ''
                  }`}
                  onClick={() => handleItemClick(item)}
                >
                  <div className="notification-bell-item-header">
                    <span className="notification-bell-item-title">{item.title}</span>
                    {!item.isRead ? <span className="notification-bell-dot" aria-hidden="true" /> : null}
                  </div>
                  {item.message ? <p className="notification-bell-item-message">{item.message}</p> : null}

                  {isActive ? (
                    <div className="notification-bell-progress">
                      <div className="notification-bell-progress-track">
                        <span style={{ width: `${live?.progressIndeterminate ? 100 : progressPercent}%` }} />
                      </div>
                      <span className="notification-bell-progress-label">
                        {live?.progressIndeterminate ? 'Đang xử lý...' : `${Math.round(progressPercent)}%`}
                      </span>
                    </div>
                  ) : null}

                  <div className="notification-bell-item-meta">
                    <span>{SEVERITY_LABEL[item.severity] || item.severity}</span>
                    <span>{formatRelativeTime(item.createdAt)}</span>
                    {item.resolvedAt ? <span className="notification-bell-resolved-tag">Đã hết</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default NotificationBell;
