import { useEffect, useMemo, useRef, useState } from 'react';

import { sendAssistantMessage } from '../../api/assistantApi.js';

const BUTTON_SIZE = 56;
const PANEL_WIDTH = 360;
const PANEL_HEIGHT = 480;
const STORAGE_KEY = 'tnex-assistant-position';
const DRAG_THRESHOLD = 6;

const WELCOME_MESSAGE = {
  role: 'assistant',
  content:
    'Chào bạn, mình là trợ lý AI của TNEX Partner. Bạn có thể hỏi mình về số liệu, ví dụ: "tháng này có bao nhiêu CTV", "tổng số đơn vay tháng này"...',
  isWelcome: true,
};

function getDefaultPosition() {
  const margin = 24;

  return {
    x: Math.max(margin, window.innerWidth - BUTTON_SIZE - margin),
    y: Math.max(margin, window.innerHeight - BUTTON_SIZE - margin),
  };
}

function clampPosition(position) {
  const margin = 8;
  const maxX = Math.max(margin, window.innerWidth - BUTTON_SIZE - margin);
  const maxY = Math.max(margin, window.innerHeight - BUTTON_SIZE - margin);

  return {
    x: Math.min(Math.max(position.x, margin), maxX),
    y: Math.min(Math.max(position.y, margin), maxY),
  };
}

function loadStoredPosition() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) return null;

    const parsed = JSON.parse(raw);

    if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
      return clampPosition(parsed);
    }
  } catch {
    // ignore - fall back to default position
  }

  return null;
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function ChatAssistant() {
  const [position, setPosition] = useState(() => loadStoredPosition() || getDefaultPosition());
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');

  const dragStateRef = useRef(null);
  const bodyRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!bodyRef.current) return;

    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, isOpen, isSending]);

  useEffect(() => {
    function handleResize() {
      setPosition((current) => clampPosition(current));
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  function handlePointerDown(event) {
    if (event.button !== 0) return;

    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      moved: false,
    };

    buttonRef.current?.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event) {
    const dragState = dragStateRef.current;

    if (!dragState) return;

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;

    if (!dragState.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;

    dragState.moved = true;
    setPosition(clampPosition({ x: dragState.originX + deltaX, y: dragState.originY + deltaY }));
  }

  function handlePointerUp(event) {
    const dragState = dragStateRef.current;

    buttonRef.current?.releasePointerCapture?.(event.pointerId);

    if (dragState?.moved) {
      setPosition((current) => {
        const clamped = clampPosition(current);

        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clamped));
        } catch {
          // ignore - position just won't persist across reloads
        }

        return clamped;
      });
    } else {
      setIsOpen((open) => !open);
    }

    dragStateRef.current = null;
  }

  const panelStyle = useMemo(() => {
    const margin = 12;
    const openLeft = position.x + BUTTON_SIZE + margin + PANEL_WIDTH > window.innerWidth;
    const openUp = position.y + BUTTON_SIZE + margin + PANEL_HEIGHT > window.innerHeight;

    return {
      left: openLeft
        ? Math.max(margin, position.x - PANEL_WIDTH + BUTTON_SIZE)
        : Math.min(position.x, window.innerWidth - PANEL_WIDTH - margin),
      top: openUp
        ? Math.max(margin, position.y - PANEL_HEIGHT - margin)
        : Math.min(position.y + BUTTON_SIZE + margin, window.innerHeight - PANEL_HEIGHT - margin),
    };
  }, [position]);

  async function handleSend() {
    const text = input.trim();

    if (!text || isSending) return;

    const nextMessages = [...messages, { role: 'user', content: text }];

    setMessages(nextMessages);
    setInput('');
    setIsSending(true);
    setError('');

    try {
      const reply = await sendAssistantMessage(
        nextMessages
          .filter((message) => !message.isWelcome)
          .slice(-12)
          .map(({ role, content }) => ({ role, content }))
      );

      setMessages((current) => [...current, { role: 'assistant', content: reply }]);
    } catch (err) {
      setError(err.message || 'Có lỗi xảy ra, vui lòng thử lại.');
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="assistant-fab"
        style={{ left: position.x, top: position.y }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        aria-label="Mở trợ lý AI"
      >
        <ChatIcon />
      </button>

      {isOpen ? (
        <section className="assistant-panel" style={panelStyle} role="dialog" aria-label="Trợ lý AI">
          <header className="assistant-panel-header">
            <div>
              <strong>Trợ lý AI</strong>
              <span>TNEX Partner</span>
            </div>
            <button type="button" className="assistant-panel-close" onClick={() => setIsOpen(false)} aria-label="Đóng">
              <CloseIcon />
            </button>
          </header>

          <div className="assistant-panel-body" ref={bodyRef}>
            {messages.map((message, index) => (
              <div key={index} className={`assistant-message assistant-message-${message.role}`}>
                {message.content}
              </div>
            ))}
            {isSending ? (
              <div className="assistant-message assistant-message-assistant assistant-message-loading">
                <span />
                <span />
                <span />
              </div>
            ) : null}
            {error ? <div className="assistant-message assistant-message-error">{error}</div> : null}
          </div>

          <div className="assistant-panel-input">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Hỏi về số liệu, ví dụ: tháng này có bao nhiêu CTV..."
              rows={2}
              disabled={isSending}
            />
            <button type="button" onClick={handleSend} disabled={isSending || !input.trim()} aria-label="Gửi">
              <SendIcon />
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}

export default ChatAssistant;
