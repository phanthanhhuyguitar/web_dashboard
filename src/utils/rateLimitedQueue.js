function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Hang doi chay song song co gioi han (concurrency + delay giua moi request cua TUNG worker),
// ho tro tam dung (poll trang thai moi 300ms) va huy giua chung - dung cho cac tac vu goi API
// THAT so luong lon tu phia client (vd tra cuu CTV khi xuat file doi soat), noi nguoi dung can
// chu dong dung lai neu thay bat thuong thay vi phai cho chay het.
//
// isPaused()/isCancelled(): ham tra ve boolean, doc "song" moi lan kiem tra (nen truyen ve tu 1
// useRef o React, KHONG truyen gia tri boolean tinh, vi worker dang chay ben trong 1 Promise cu,
// khong tu doc lai state moi duoc).
export async function runRateLimitedQueue(items, { concurrency = 2, delayMs = 0, onProgress, isPaused, isCancelled, taskFn }) {
  const queue = [...items];
  const total = items.length;
  const results = [];
  let doneCount = 0;

  async function worker() {
    while (queue.length > 0) {
      if (isCancelled?.()) return;

      while (isPaused?.() && !isCancelled?.()) {
        await sleep(300);
      }

      if (isCancelled?.()) return;

      const item = queue.shift();

      if (item === undefined) return;

      try {
        const value = await taskFn(item);

        results.push({ item, value });
      } catch (error) {
        results.push({ item, error });
      }

      doneCount += 1;
      onProgress?.(doneCount, total);

      if (delayMs > 0 && queue.length > 0 && !isCancelled?.()) {
        await sleep(delayMs);
      }
    }
  }

  const workerCount = Math.min(Math.max(Number(concurrency) || 1, 1), items.length || 1);

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}