import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { IconChevronDown, IconMic, IconSend, IconTrash } from './Icon';
import ChatVoiceNote from './ChatVoiceNote';
import { ChatMessage, VoiceNote } from '../lib/chat';
import { VOICE_MAX_MS, formatClock, formatDay, formatDuration } from '../lib/voice';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';

interface Props {
  messages: ChatMessage[];
  selfId: string;
  /** This user's chosen display name, attributed to their messages. */
  selfName: string;
  onSend: (text: string) => void;
  /** Sends a recorded voice note. */
  onSendVoice: (note: VoiceNote) => void;
  /**
   * The session's live microphone track. Reused for recording so a voice note
   * cannot fight the call for the device.
   */
  voiceTrack?: MediaStreamTrack | null;
}

/** Distance from the bottom (px) that still counts as "reading the latest". */
const NEAR_BOTTOM_PX = 48;
/** A gap larger than this starts a new timestamp/name cluster. */
const CLUSTER_MS = 5 * 60 * 1000;

/**
 * Lightweight real-time chat: text plus in-memory voice notes.
 *
 * Scrolling is reader-respecting: the list only follows new messages while the
 * reader is already at the bottom. Scroll up to read history and the position
 * is left exactly where it is, with an explicit "new messages" control to jump
 * down — nothing yanks the transcript out from under you.
 *
 * Deliberately still no emoji picker, no attachments and no read receipts.
 */
export default function ChatPanel({
  messages,
  selfId,
  selfName,
  onSend,
  onSendVoice,
  voiceTrack,
}: Props) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);
  /** Mirror of `atBottom` so the append effect reads the pre-update value. */
  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const prevCountRef = useRef(messages.length);

  const recorder = useVoiceRecorder({ sourceTrack: voiceTrack, onComplete: onSendVoice });

  const scrollToLatest = useCallback((smooth: boolean) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    atBottomRef.current = true;
    setAtBottom(true);
    setUnseen(0);
  }, []);

  // Open on the newest message — instant, never animated on first paint.
  useEffect(() => {
    scrollToLatest(false);
  }, [scrollToLatest]);

  useEffect(() => {
    const added = messages.length - prevCountRef.current;
    prevCountRef.current = messages.length;
    if (added <= 0) return;
    if (atBottomRef.current) scrollToLatest(false);
    else setUnseen((n) => n + added);
  }, [messages.length, scrollToLatest]);

  function onScroll() {
    const el = listRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
    atBottomRef.current = near;
    setAtBottom((prev) => (prev === near ? prev : near));
    if (near) setUnseen(0);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = draft.trim();
    if (!value) return;
    onSend(value);
    setDraft('');
    // Sending is an explicit move to the end of the transcript.
    window.requestAnimationFrame(() => scrollToLatest(true));
  }

  const dayKey = (ts: number) => new Date(ts).toDateString();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={listRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3 space-y-2 scrollbar-thin"
      >
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center px-4">
            <p className="text-center text-sm text-titanium-400">
              No messages yet.
              <br />
              Say hello, or hold the mic to send a voice note.
            </p>
          </div>
        )}

        {messages.map((m, i) => {
          const mine = m.author === selfId;
          const prev = i > 0 ? messages[i - 1] : null;
          const showDay = !prev || dayKey(prev.ts) !== dayKey(m.ts);
          const showTime = !prev || showDay || m.ts - prev.ts > CLUSTER_MS;
          const showName = !mine && (!prev || prev.author !== m.author || showTime);
          const name = m.authorName || (mine ? selfName.trim() || 'You' : 'Guest');
          return (
            <div key={m.id}>
              {showDay && (
                <div className="my-3 flex items-center gap-3" aria-hidden>
                  <span className="h-px flex-1 bg-white/[0.07]" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-titanium-500">
                    {formatDay(m.ts)}
                  </span>
                  <span className="h-px flex-1 bg-white/[0.07]" />
                </div>
              )}
              <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[85%] sm:max-w-[280px]">
                  {showTime || showName ? (
                    <div className={`mb-1 flex items-baseline gap-2 px-1 ${mine ? 'justify-end' : ''}`}>
                      {showName ? (
                        <span className="truncate text-[11px] font-semibold text-titanium-300">{name}</span>
                      ) : null}
                      {showTime ? (
                        <span className="text-[10px] tabular-nums text-titanium-500">{formatClock(m.ts)}</span>
                      ) : null}
                    </div>
                  ) : null}
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm shadow-sm ${
                      mine
                        ? 'rounded-br-sm bg-accent-500 text-white'
                        : 'rounded-bl-sm border border-white/[0.07] bg-white/[0.07] text-titanium-100'
                    }`}
                  >
                    {m.voice ? (
                      <ChatVoiceNote note={m.voice} mine={mine} />
                    ) : (
                      <span className="whitespace-pre-wrap break-words">{m.text}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Only offered when the reader has scrolled away from the end. */}
      {!atBottom ? (
        <div className="relative flex justify-center">
          <button
            type="button"
            onClick={() => scrollToLatest(true)}
            className="absolute -top-12 inline-flex h-10 items-center gap-1.5 rounded-full border border-white/[0.10] bg-graphite-700 px-3.5 text-[11px] font-semibold text-titanium-100 shadow-jc-float transition-colors hover:bg-graphite-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
          >
            <IconChevronDown size={14} />
            {unseen > 0 ? `${unseen} new message${unseen > 1 ? 's' : ''}` : 'Jump to latest'}
          </button>
        </div>
      ) : null}

      <form onSubmit={submit} className="shrink-0 border-t border-white/[0.07] p-2.5">
        {recorder.error ? (
          <p
            role="alert"
            className="mb-2 rounded-xl border border-status-danger/25 bg-status-danger/10 px-2.5 py-1.5 text-[11px] font-medium text-status-danger"
          >
            {recorder.error}
          </p>
        ) : null}

        {recorder.recording ? (
          <div className="flex items-center gap-2">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-status-danger/15 text-status-danger"
              aria-hidden
            >
              <IconMic size={16} />
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-titanium-100">
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-status-danger" aria-hidden />
              Recording
              <span className="font-mono tabular-nums text-titanium-200">
                {formatDuration(recorder.elapsedMs)}
              </span>
              <span className="ml-auto hidden text-[11px] font-normal text-titanium-500 sm:inline">
                max {formatDuration(VOICE_MAX_MS)}
              </span>
            </span>
            <button
              type="button"
              onClick={recorder.cancel}
              aria-label="Discard voice note"
              title="Discard"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.06] text-titanium-200 transition-colors hover:bg-white/[0.12] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
            >
              <IconTrash size={16} />
            </button>
            <button
              type="button"
              onClick={recorder.stop}
              aria-label="Send voice note"
              title="Send voice note"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-500 text-white transition-colors hover:bg-accent-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
            >
              <IconSend size={16} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
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
              className="h-10 min-w-0 flex-1 rounded-full border border-white/[0.12] bg-white/[0.08] px-4 text-sm text-white transition-colors placeholder:text-titanium-500 focus:border-accent-500 focus:bg-white/[0.12] focus:outline-none"
            />
            {/* Rendered only when this browser can actually record. */}
            {recorder.supported ? (
              <button
                type="button"
                onClick={recorder.start}
                aria-label="Record a voice note"
                title="Record voice note"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.06] text-titanium-200 transition-colors hover:bg-white/[0.12] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
              >
                <IconMic size={18} />
              </button>
            ) : null}
            <button
              type="submit"
              aria-label="Send message"
              title="Send"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-500 font-semibold text-white transition-colors hover:bg-accent-600 disabled:opacity-45 disabled:hover:bg-accent-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
              disabled={!draft.trim()}
            >
              <IconSend size={18} />
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
