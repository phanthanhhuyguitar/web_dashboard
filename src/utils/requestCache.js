const inflightRequests = new Map();
const responseCache = new Map();

export function createRequestKey(name, params = {}) {
  return `${name}:${JSON.stringify(params)}`;
}

export async function dedupeRequest(key, requestFn, options = {}) {
  const ttl = options.ttl || 0;
  const force = options.force || false;
  const now = Date.now();

  if (!force) {
    const cached = responseCache.get(key);

    if (cached && now - cached.createdAt < ttl) {
      return cached.data;
    }
  }

  if (inflightRequests.has(key)) {
    return inflightRequests.get(key);
  }

  const promise = requestFn()
    .then((data) => {
      responseCache.set(key, {
        data,
        createdAt: Date.now(),
      });
      return data;
    })
    .finally(() => {
      inflightRequests.delete(key);
    });

  inflightRequests.set(key, promise);
  return promise;
}

export function clearRequestCache(keyPrefix) {
  if (!keyPrefix) {
    responseCache.clear();
    return;
  }

  for (const key of responseCache.keys()) {
    if (key.startsWith(keyPrefix)) {
      responseCache.delete(key);
    }
  }
}
