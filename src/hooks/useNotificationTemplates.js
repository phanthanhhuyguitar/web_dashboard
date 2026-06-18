import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  createNotificationTemplate,
  fetchNotificationTemplates,
  updateNotificationTemplate,
} from '../api/notificationTemplatesApi.js';
import { DASHBOARD_REFRESH_COOLDOWN_MS, DASHBOARD_REQUEST_CACHE_TTL_MS } from '../config/constants.js';
import { isDateInRange } from '../utils/date.js';
import {
  getNotificationTemplateCreateErrorMessage,
  getNotificationTemplateUpdateErrorMessage,
  getSafeErrorMessage,
} from '../utils/error.js';
import { clearRequestCache, createRequestKey, dedupeRequest } from '../utils/requestCache.js';

const DEFAULT_SIZE = 40;
const emptyFilters = {
  fromDate: '',
  toDate: '',
};
const CREATE_LOADING_MESSAGE = 'Đang thêm mới nội dung thông báo...';
const CREATE_SUCCESS_MESSAGE = 'Thêm mới nội dung thông báo thành công.';
const UPDATE_LOADING_MESSAGE = 'Đang cập nhật nội dung thông báo...';
const UPDATE_SUCCESS_MESSAGE = 'Cập nhật nội dung thông báo thành công.';

function filterItemsByDate(items, filters) {
  if (!filters.fromDate && !filters.toDate) return items;

  return items.filter((item) => {
    const fromDate = filters.fromDate || '1900-01-01';
    const toDate = filters.toDate || '2999-12-31';

    return isDateInRange(item.createdAt, { fromDate, toDate });
  });
}

export function useNotificationTemplates() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [size] = useState(DEFAULT_SIZE);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('idle');
  const [submitMessage, setSubmitMessage] = useState('');
  const lastRefreshRef = useRef(0);
  const latestRequestId = useRef(0);
  const submittingRef = useRef(false);

  const loadTemplates = useCallback(
    async ({ nextPage = 0, force = false } = {}) => {
      const requestId = latestRequestId.current + 1;

      latestRequestId.current = requestId;
      setError('');
      setLoading(true);
      setRefreshing(Boolean(force));

      if (force) {
        clearRequestCache('notification-templates:');
      }

      try {
        const requestKey = createRequestKey('notification-templates:list', {
          page: nextPage,
          size,
        });
        const result = await dedupeRequest(
          requestKey,
          () => fetchNotificationTemplates({ page: nextPage, size }),
          {
            ttl: DASHBOARD_REQUEST_CACHE_TTL_MS,
            force,
          }
        );

        if (latestRequestId.current !== requestId) return;

        setItems(result.items);
        setPage(result.page);
        setTotalElements(result.totalElements);
        setTotalPages(result.totalPages);
      } catch (requestError) {
        if (latestRequestId.current !== requestId) return;

        setError(getSafeErrorMessage(requestError, 'Không tải được danh sách nội dung thông báo'));
      } finally {
        if (latestRequestId.current === requestId) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [size]
  );

  useEffect(() => {
    loadTemplates({ nextPage: 0 });
  }, [loadTemplates]);

  const filteredItems = useMemo(() => filterItemsByDate(items, appliedFilters), [items, appliedFilters]);
  const hasActiveFilter = Boolean(appliedFilters.fromDate || appliedFilters.toDate);

  const search = useCallback(() => {
    setAppliedFilters(filters);
  }, [filters]);

  const refresh = useCallback(async () => {
    const now = Date.now();

    if (loading || refreshing) return;

    if (now - lastRefreshRef.current < DASHBOARD_REFRESH_COOLDOWN_MS) {
      return;
    }

    lastRefreshRef.current = now;
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    await loadTemplates({ nextPage: 0, force: true });
  }, [loadTemplates, loading, refreshing]);

  const goNextPage = useCallback(() => {
    if (loading || refreshing) return;
    if (page >= totalPages - 1) return;

    loadTemplates({ nextPage: page + 1 });
  }, [loadTemplates, loading, page, refreshing, totalPages]);

  const goPreviousPage = useCallback(() => {
    if (loading || refreshing) return;
    if (page <= 0) return;

    loadTemplates({ nextPage: page - 1 });
  }, [loadTemplates, loading, page, refreshing]);

  const clearSubmitStatus = useCallback(() => {
    setSubmitStatus('idle');
    setSubmitMessage('');
  }, []);

  const createTemplate = useCallback(
    async (payload) => {
      if (submittingRef.current) return false;

      submittingRef.current = true;
      setSubmitting(true);
      setSubmitStatus('loading');
      setSubmitMessage(CREATE_LOADING_MESSAGE);

      try {
        await createNotificationTemplate({
          code: payload.code,
          titleTemplate: payload.titleTemplate,
          bodyTemplate: payload.bodyTemplate,
        });

        setSubmitStatus('success');
        setSubmitMessage(CREATE_SUCCESS_MESSAGE);
        setFilters(emptyFilters);
        setAppliedFilters(emptyFilters);
        clearRequestCache('notification-templates:');
        await loadTemplates({ nextPage: 0, force: true });

        return true;
      } catch (requestError) {
        setSubmitStatus('error');
        setSubmitMessage(getNotificationTemplateCreateErrorMessage(requestError));

        return false;
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [loadTemplates]
  );

  const updateTemplate = useCallback(
    async (payload) => {
      if (submittingRef.current) return false;

      submittingRef.current = true;
      setSubmitting(true);
      setSubmitStatus('loading');
      setSubmitMessage(UPDATE_LOADING_MESSAGE);

      try {
        await updateNotificationTemplate({
          id: payload.id,
          code: payload.code,
          titleTemplate: payload.titleTemplate,
          bodyTemplate: payload.bodyTemplate,
        });

        setSubmitStatus('success');
        setSubmitMessage(UPDATE_SUCCESS_MESSAGE);
        clearRequestCache('notification-templates:');
        await loadTemplates({ nextPage: page, force: true });

        return true;
      } catch (requestError) {
        setSubmitStatus('error');
        setSubmitMessage(getNotificationTemplateUpdateErrorMessage(requestError));

        return false;
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [loadTemplates, page]
  );

  return {
    items,
    filteredItems,
    loading,
    refreshing,
    submitting,
    submitStatus,
    submitMessage,
    error,
    page,
    size,
    totalElements,
    totalPages,
    filters,
    setFilters,
    hasActiveFilter,
    search,
    refresh,
    goNextPage,
    goPreviousPage,
    createTemplate,
    updateTemplate,
    clearSubmitStatus,
  };
}
