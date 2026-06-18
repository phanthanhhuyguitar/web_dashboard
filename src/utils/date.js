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

function parseDateValue(dateValue) {
  if (!dateValue) return null;

  const normalizedValue = String(dateValue).trim();
  const yearFirstMatch = normalizedValue.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
  );

  if (yearFirstMatch) {
    const [, year, month, day, hour = 0, minute = 0, second = 0] = yearFirstMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));

    return Number.isNaN(date.getTime()) ? null : date;
  }

  const dayFirstMatch = normalizedValue.match(
    /^(\d{1,2})-(\d{1,2})-(\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
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

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} ${hour}:${minute}`;
}

function toDateValue(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

export function getPreviousMonthRange({ fromDate }) {
  const currentStart = parseDateBoundary(fromDate);

  if (!currentStart) {
    return {
      fromDate: '',
      toDate: '',
    };
  }

  const previousStart = new Date(currentStart.getFullYear(), currentStart.getMonth() - 1, 1);
  const previousEnd = new Date(currentStart.getFullYear(), currentStart.getMonth(), 0);

  return {
    fromDate: toDateValue(previousStart),
    toDate: toDateValue(previousEnd),
  };
}
