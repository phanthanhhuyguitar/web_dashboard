// Goi endpoint local (Vite dev middleware, server/modules/assistantChat.cjs) - KHONG phai
// API that cua TNEX. AI doc du lieu tu ban dong bo local san co, khong phat sinh request moi
// toi backend that.
export async function sendAssistantMessage(messages) {
  const response = await fetch('/api/assistant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.success) {
    throw new Error(data?.message || 'Trợ lý AI đang gặp lỗi. Vui lòng thử lại.');
  }

  return data.reply;
}
