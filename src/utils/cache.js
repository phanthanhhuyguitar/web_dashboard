export function getCache(key) {
  try {
    const rawValue = sessionStorage.getItem(key);

    if (!rawValue) return null;

    const parsedValue = JSON.parse(rawValue);

    if (!parsedValue || parsedValue.expiresAt <= Date.now()) {
      sessionStorage.removeItem(key);
      return null;
    }

    return parsedValue.data;
  } catch {
    return null;
  }
}

export function setCache(key, data, ttlMs) {
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({
        data,
        expiresAt: Date.now() + ttlMs,
      })
    );
  } catch {
    // Cache is an optimization only; ignore storage failures.
  }
}

export function removeCache(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Cache is an optimization only; ignore storage failures.
  }
}
