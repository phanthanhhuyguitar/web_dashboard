export function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatPercent(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return '0.0%';
  }

  return `${number.toFixed(1)}%`;
}

export function formatPercentRounded(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return '0%';
  }

  return `${Math.round(number)}%`;
}

export function formatChangePercent(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return '0.0%';
  }

  const sign = number > 0 ? '+' : '';
  return `${sign}${number.toFixed(1)}%`;
}

export function formatSignedNumber(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return '0';
  }

  const sign = number > 0 ? '+' : '';
  return `${sign}${number.toLocaleString('en-US')}`;
}

export function formatVndCompact(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return '0 đ';
  }

  if (number >= 1000000000) {
    const billion = Math.trunc((number / 1000000000) * 10) / 10;

    return `${billion.toLocaleString('vi-VN', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} tỷ`;
  }

  if (number >= 1000000) {
    const million = Math.trunc((number / 1000000) * 10) / 10;

    return `${million.toLocaleString('vi-VN', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} tr`;
  }

  return `${number.toLocaleString('vi-VN')} đ`;
}
