/**
 * Chat message model.
 *
 * Everything in a `ChatMessage` lives in memory for the lifetime of the
 * session only: text, the author's display name and any voice-note payload.
 * Nothing is written to storage, so ending the session discards all of it.
 */

/** A recorded voice note, carried as base64 over the signalling channel. */
export interface VoiceNote {
  /** Recording MIME type, e.g. 'audio/webm;codecs=opus'. */
  mime: string;
  /** base64 audio (no `data:` prefix) — in memory only, never uploaded. */
  data: string;
  /** Measured recording length, used for the duration label. */
  durationMs: number;
}

export interface ChatMessage {
  id: string;
  /** Author's peer id. */
  author: string;
  /** Author's display name at send time (in-memory only, may be absent). */
  authorName?: string;
  /** Message body. Empty for a voice note. */
  text: string;
  /** epoch ms */
  ts: number;
  /** Present when this message is a voice note. */
  voice?: VoiceNote;
}

/** Hard cap on a text message. */
export const TEXT_MAX = 1000;
/**
 * Ceiling on a voice note's base64 payload. The recorder tops out at 30 s at
 * 24 kbps (~90 kB), so this only rejects malformed or hostile input.
 */
export const VOICE_B64_MAX = 400_000;

/**
 * Structural check for standard, padded base64 — the only shape
 * `FileReader.readAsDataURL` produces. Cheap, and it keeps a corrupt payload
 * from reaching `atob()` during render, where it would throw.
 */
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
function isBase64(data: string): boolean {
  return data.length % 4 === 0 && BASE64_RE.test(data);
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `m_${Date.now().toString(36)}_${counter.toString(36)}`;
}

/** Names are display-only and capped so a peer cannot flood the roster. */
function cleanName(name?: string): string | undefined {
  if (typeof name !== 'string') return undefined;
  const trimmed = name.replace(/\s+/g, ' ').trim().slice(0, 32);
  return trimmed || undefined;
}

export function createMessage(author: string, text: string, authorName?: string): ChatMessage {
  return {
    id: nextId(),
    author,
    authorName: cleanName(authorName),
    text: text.slice(0, TEXT_MAX), // hard cap to prevent abuse
    ts: Date.now(),
  };
}

/** A voice note is a chat message whose body is audio instead of text. */
export function createVoiceMessage(
  author: string,
  voice: VoiceNote,
  authorName?: string,
): ChatMessage {
  return {
    id: nextId(),
    author,
    authorName: cleanName(authorName),
    text: '',
    ts: Date.now(),
    voice,
  };
}

/**
 * Validates an inbound message before it enters the transcript. Anything that
 * does not match the shape is dropped rather than rendered, so a malformed or
 * oversized payload from the channel cannot break the chat.
 */
export function parseIncomingMessage(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Partial<ChatMessage>;
  if (typeof m.id !== 'string' || !m.id) return null;
  if (typeof m.author !== 'string' || !m.author) return null;
  if (typeof m.ts !== 'number' || !Number.isFinite(m.ts)) return null;

  const message: ChatMessage = {
    id: m.id,
    author: m.author,
    authorName: cleanName(m.authorName),
    text: typeof m.text === 'string' ? m.text.slice(0, TEXT_MAX) : '',
    ts: m.ts,
  };

  if (m.voice !== undefined) {
    const v = m.voice as Partial<VoiceNote>;
    if (typeof v.mime !== 'string' || typeof v.data !== 'string' || typeof v.durationMs !== 'number') {
      return null;
    }
    if (!v.data || v.data.length > VOICE_B64_MAX || !isBase64(v.data)) return null;
    message.voice = {
      mime: v.mime.slice(0, 64) || 'audio/webm',
      data: v.data,
      durationMs: Math.max(0, Math.min(120_000, v.durationMs)),
    };
  }

  if (!message.text && !message.voice) return null;
  return message;
}
