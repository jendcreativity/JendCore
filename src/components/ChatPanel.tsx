import { FormEvent, useEffect, useRef, useState } from 'react';
import { ChatMessage } from '../lib/chat';

interface Props {
  messages: ChatMessage[];
  selfId: string;
  onSend: (text: string) => void;
  onClose?: () => void;
}

/**
 * Lightweight real-time chat. Auto-scrolls to the latest message and
 * keeps a small buffer. Empty messages are silently rejected.
 *
 * We deliberately avoid emoji pickers, attachments, and read receipts.
 */
export default function ChatPanel({ messages, selfId, onSend, onClose }: Props) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = draft.trim();
    if (!value) return;
    onSend(value);
    setDraft('');
  }

  return (
    <div className="flex flex-col h-full bg-ink-800 border-l border-ink-700 w-full sm:w-80">
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink-700">
        <h2 className="font-semibold text-white">Chat</h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-ink-300 hover:text-white text-sm"
            aria-label="Close chat"
          >
            Close
          </button>
        )}
      </div>

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
        role="log"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <p className="text-sm text-ink-400 text-center mt-8">
            No messages yet. Say hello.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.author === selfId;
          return (
            <div
              key={m.id}
              className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  mine
                    ? 'bg-accent-500 text-white rounded-br-sm'
                    : 'bg-ink-700 text-ink-50 rounded-bl-sm'
                }`}
              >
                {m.text}
              </div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wider text-ink-400">
                {mine ? 'You' : m.author.slice(0, 6)}
              </div>
            </div>
          );
        })}
      </div>

      <form
        onSubmit={submit}
        className="border-t border-ink-700 p-3 flex gap-2 safe-bottom"
      >
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <input
          id="chat-input"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          autoComplete="off"
          className="flex-1 h-11 rounded-xl bg-ink-700 border border-ink-600 px-3 text-white placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500"
        />
        <button
          type="submit"
          className="h-11 px-4 rounded-xl bg-accent-500 hover:bg-accent-600 text-white font-semibold disabled:opacity-50"
          disabled={!draft.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}
