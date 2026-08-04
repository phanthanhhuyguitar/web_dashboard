export function parseDateBoundary(dateValue, isEndOfDay = false) {
  if (!dateValue) return null;

  const [year, month, day] = String(dateValue).split('-').map(Number);
  const date = new Date(year, month - 1, day);

  if (Number.isNaN(date.getTime())) return null;

  if (isEndOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }

  return date;
}

export function parseDateValue(dateValue) {
  if (!dateValue) return null;

  const normalizedValue = String(dateValue).trim();
  const timezoneAwareIsoMatch = normalizedValue.match(
    /^\d{4}-\d{1,2}-\d{1,2}T\d{1,2}:\d{1,2}(?::\d{1,2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i
  );

  if (timezoneAwareIsoMatch) {
    const date = new Date(normalizedValue);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  const yearFirstMatch = normalizedValue.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
  );

  if (yearFirstMatch) {
    const [, year, month, day, hour = 0, minute = 0, second = 0] = yearFirstMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));

    return Number.isNaN(date.getTime()) ? null : date;
  }

  const dayFirstMatch = normalizedValue.match(
    /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
  );

  if (dayFirstMatch) {
    const [, day, month, year, hour = 0, minute = 0, second = 0] = dayFirstMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));

    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(normalizedValue);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function isDateInRange(dateValue, { fromDate, toDate }) {
  if (!dateValue || !fromDate || !toDate) return false;

  const date = parseDateValue(dateValue);
  const start = parseDateBoundary(fromDate);
  const end = parseDateBoundary(toDate, true);

  if (!date || !start || !end) return false;

  return date >= start && date <= end;
}

export function formatDateTime(value) {
  const date = parseDateValue(value);

  if (!date) return '--';

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');

  return `${year}/${month}/${day} ${hour}:${minute}:${second}`;
}

function toDateValue(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

// Tien do cua khoang thang dang xem: co dang la thang thuc su chay do hay khong (de biet co
// nen du bao/cat cung ky hay khong), da qua bao nhieu ngay va thang co bao nhieu ngay.
// Dung chung cho ca so sanh cung ky (getPreviousMonthRange) lan du bao cuoi thang.
export function getMonthProgress({ fromDate, toDate }) {
  const start = parseDateBoundary(fromDate);

  if (!start) {
    return { isOngoing: false, daysElapsed: 0, daysInMonth: 0 };
  }

  const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const now = new Date();
  const isOngoing = start.getFullYear() === now.getFullYear() && start.getMonth() === now.getMonth();
  const daysElapsed = isOngoing
    ? Math.min(now.getDate(), daysInMonth)
    : parseDateBoundary(toDate)?.getDate() ?? daysInMonth;

  return { isOngoing, daysElapsed, daysInMonth };
}

// So sanh CUNG KY thay vi ca thang: neu thang hien tai dang chay do (VD moi qua 16/31 ngay),
// so voi ca thang truoc (30 ngay day du) se luon ra % giam ao ~50%. Vi vay thang truoc chi
// lay den cung so ngay da troi qua cua thang hien tai (hoac het thang truoc neu it ngay hon).
export function getPreviousMonthRange({ fromDate, toDate }) {
  const currentStart = parseDateBoundary(fromDate);

  if (!currentStart) {
    return {
      fromDate: '',
      toDate: '',
    };
  }

  const { daysElapsed } = getMonthProgress({ fromDate, toDate });
  const previousStart = new Date(currentStart.getFullYear(), currentStart.getMonth() - 1, 1);
  const previousMonthLastDay = new Date(currentStart.getFullYear(), currentStart.getMonth(), 0).getDate();
  const previousEndDay = Math.min(daysElapsed, previousMonthLastDay);
  const previousEnd = new Date(currentStart.getFullYear(), currentStart.getMonth() - 1, previousEndDay);

  return {
    fromDate: toDateValue(previousStart),
    toDate: toDateValue(previousEnd),
  };
}
