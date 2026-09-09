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
    <div className="flex flex-col h-full bg-ink-900 border-l border-ink-700 w-full max-w-md mx-auto">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-ink-700">
        <h2 className="font-semibold text-base text-white">Chat</h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-ink-700 rounded-lg transition-colors"
            aria-label="Close chat"
          >
            <svg className="w-5 h-5 text-ink-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 min-h-0"
        role="log"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-ink-400">
            <p className="text-sm text-center">No messages yet.<br/>Say hello!</p>
          </div>
        )}
        {messages.map((m) => {
          const mine = m.author === selfId;
          return (
            <div
              key={m.id}
              className={`flex ${mine ? 'justify-end' : 'justify-start'} mb-1.5`}
            >
              <div
                className={`inline-block max-w-[85%] sm:max-w-xs rounded-2xl px-3 py-2 text-sm font-medium shadow-sm ${
                  mine
                    ? 'bg-accent-500 text-white rounded-br-sm'
                    : 'bg-ink-700 text-ink-50 rounded-bl-sm border border-ink-600'
                }`}
              >
                {m.text}
              </div>
            </div>
          );
        })}
      </div>

      <form
        onSubmit={submit}
        className="border-t border-ink-700 p-2.5 flex gap-1.5 safe-bottom bg-ink-900/95 backdrop-blur-sm"
      >
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <input
          id="chat-input"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message..."
          autoComplete="off"
          className="flex-1 h-9 sm:h-10 rounded-full bg-ink-800/80 border border-ink-600 px-4 text-sm text-white placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:bg-ink-800/100 transition-all"
        />
        <button
          type="submit"
          className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-accent-500 hover:bg-accent-600 active:bg-accent-700 text-white font-semibold disabled:opacity-50 flex items-center justify-center transition-colors shadow-sm"
          disabled={!draft.trim()}
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 4v-7h-4v3l-9-4v-3h4V9l-7-4v13l4 2z" />
          </svg>
        </button>
      </form>
    </div>
  );
}
