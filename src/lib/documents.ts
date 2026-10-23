/**
 * Shared-document model, limits and inbound validation.
 *
 * Everything here describes a document that exists **in memory only**: the
 * bytes live in a `Blob` for the lifetime of the share, metadata travels as a
 * compact JSON envelope, and nothing is written to storage, a database or a
 * bucket. The same lifecycle as chat text, participant names and voice notes.
 */

export type DocumentKind = 'image' | 'pdf';

/** Metadata every participant agrees on before any bytes move. */
export interface DocumentMeta {
  /** Stable identity within the session. Every annotation/op references it. */
  docId: string;
  kind: DocumentKind;
  /** Display name, already truncated for the UI. */
  name: string;
  /** Uniform MIME type, from a fixed allow-list. */
  mime: string;
  /** Exact byte length of the transferred document. */
  size: number;
  /** Content units of page 1 (images: the image) — see `documentView.ts`. */
  width: number;
  height: number;
  /** 1 for images, the parsed page count for PDFs. */
  pageCount: number;
  /** Peer id of the sharer; the holder that answers late-joiner requests. */
  sharedBy: string;
  sharedByName?: string;
  /** epoch ms, used only for display and tie-breaking. */
  ts: number;
  /** Bumped by the sharer on every replace; stale revisions are ignored. */
  revision: number;
  /** SHA-256 of the bytes, hex — the receiver verifies it before adopting. */
  sha256: string;
}

/** Per-document ceilings. Deliberately conservative, and stated in the UI. */
export const DOC_LIMITS = {
  /** Images are decoded and painted whole, so they get the tighter cap. */
  imageBytes: 15 * 1024 * 1024,
  /** PDFs are streamed page by page, so they can be larger. */
  pdfBytes: 30 * 1024 * 1024,
  /** Page-count ceiling: parsing stays bounded and the page strip stays honest. */
  pdfPages: 200,
  /** Sanity bounds on a page's own dimensions (PDF user units). */
  minPageUnits: 20,
  maxPageUnits: 20_000,
} as const;

/** Longest display name we keep for a document. */
export const DOC_NAME_MAX = 64;

/** Only formats this app can render reliably. */
const MIME_TO_KIND: Record<string, DocumentKind> = {
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'application/pdf': 'pdf',
};

/** `accept` attribute for the file input — one source of truth. */
export const DOC_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Trims a filename for display; it is never used as an identifier. */
export function truncateName(name: string): string {
  // Control characters are filtered by code point rather than with a range
  // regex (which linters flag), and non-ASCII names are preserved intact.
  const clean =
    (name ?? '')
      .split('')
      .filter((ch) => {
        const code = ch.charCodeAt(0);
        return code >= 32 && code !== 127;
      })
      .join('')
      .trim() || 'Document';
  return clean.length > DOC_NAME_MAX ? `${clean.slice(0, DOC_NAME_MAX - 1)}…` : clean;
}

let counter = 0;
/** Stable, session-scoped document id (`d_<time><seq>`); never persisted. */
export function newDocId(): string {
  counter += 1;
  return `d_${Date.now().toString(36)}_${counter.toString(36)}`;
}

/**
 * Maps a picked file to a supported kind.
 *
 * MIME type is preferred, but browsers occasionally hand back an empty or
 * generic type for a perfectly valid file, so the extension is accepted as a
 * corroborating signal — never as the only one.
 */
export function kindForFile(mime: string, name: string): DocumentKind | null {
  const normalized = (mime ?? '').toLowerCase().split(';')[0].trim();
  const byMime = MIME_TO_KIND[normalized];
  if (byMime) return byMime;
  const ext = (name ?? '').split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp') return 'image';
  if (ext === 'pdf') return 'pdf';
  return null;
}

/** The MIME actually transmitted for a kind (jpg is normalised to image/jpeg). */
export function mimeForKind(kind: DocumentKind, mime: string, name: string): string {
  if (kind === 'pdf') return 'application/pdf';
  const normalized = (mime ?? '').toLowerCase().split(';')[0].trim();
  if (normalized === 'image/jpg') return 'image/jpeg';
  if (MIME_TO_KIND[normalized]) return normalized;
  const ext = (name ?? '').split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export interface FileRejection {
  ok: false;
  message: string;
}

/**
 * Cheap, synchronous gate: type and size only. Decode/parse limits are checked
 * afterwards, where the real failure mode lives.
 */
export function validateFileBasics(
  file: File,
): { ok: true; kind: DocumentKind } | FileRejection {
  if (!file || typeof file.size !== 'number') {
    return { ok: false, message: 'That file could not be read. Please choose it again.' };
  }
  if (file.size === 0) {
    return { ok: false, message: 'That file is empty. Please choose another one.' };
  }
  const kind = kindForFile(file.type, file.name);
  if (!kind) {
    return {
      ok: false,
      message: 'Unsupported file type. Share a JPEG, PNG or WebP image, or a PDF document.',
    };
  }
  const limit = kind === 'pdf' ? DOC_LIMITS.pdfBytes : DOC_LIMITS.imageBytes;
  if (file.size > limit) {
    return {
      ok: false,
      message: `That ${kind === 'pdf' ? 'PDF' : 'image'} is ${formatBytes(file.size)} — the limit is ${formatBytes(limit)}. Try a smaller file.`,
    };
  }
  return { ok: true, kind };
}

function isFinitePositive(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/**
 * Structural validation for an inbound `DocumentMeta`.
 *
 * A peer's payload is never trusted: anything that does not match the shape is
 * dropped, exactly as `parseIncomingMessage` does for chat. The digest must look
 * like a hex SHA-256 and every dimension must be sane, so a malformed — or
 * hostile — metadata frame cannot make the viewer allocate a nonsense buffer or
 * claim a page count the renderer cannot serve.
 */
export function parseDocumentMeta(raw: unknown): DocumentMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Partial<DocumentMeta>;
  if (typeof m.docId !== 'string' || !m.docId || m.docId.length > 64) return null;
  if (m.kind !== 'image' && m.kind !== 'pdf') return null;
  if (typeof m.sharedBy !== 'string' || !m.sharedBy) return null;
  if (typeof m.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(m.sha256)) return null;
  if (!isFinitePositive(m.size)) return null;
  const limit = m.kind === 'pdf' ? DOC_LIMITS.pdfBytes : DOC_LIMITS.imageBytes;
  if (m.size > limit) return null;
  if (!isFinitePositive(m.width) || !isFinitePositive(m.height)) return null;
  if (m.width < DOC_LIMITS.minPageUnits || m.height < DOC_LIMITS.minPageUnits) return null;
  if (m.width > DOC_LIMITS.maxPageUnits || m.height > DOC_LIMITS.maxPageUnits) return null;
  if (!isFinitePositive(m.pageCount) || m.pageCount > DOC_LIMITS.pdfPages) return null;
  if (m.kind === 'image' && m.pageCount !== 1) return null;
  if (typeof m.revision !== 'number' || !Number.isFinite(m.revision) || m.revision < 0) return null;
  if (typeof m.ts !== 'number' || !Number.isFinite(m.ts)) return null;

  const kind = m.kind;
  return {
    docId: m.docId,
    kind,
    name: truncateName(
      typeof m.name === 'string' && m.name.trim()
        ? m.name
        : kind === 'pdf'
          ? 'Document.pdf'
          : 'Image',
    ),
    mime:
      typeof m.mime === 'string' && MIME_TO_KIND[m.mime.toLowerCase()]
        ? m.mime.toLowerCase()
        : kind === 'pdf'
          ? 'application/pdf'
          : 'image/png',
    size: m.size,
    width: m.width,
    height: m.height,
    pageCount: Math.max(1, Math.round(m.pageCount)),
    sharedBy: m.sharedBy,
    sharedByName:
      typeof m.sharedByName === 'string' && m.sharedByName.trim()
        ? m.sharedByName.trim().slice(0, 32)
        : undefined,
    ts: m.ts,
    revision: Math.round(m.revision),
    sha256: m.sha256.toLowerCase(),
  };
}

/**
 * The same document at a newer revision, or a different document altogether?
 * Used to decide between "update in place" and "reset the workspace".
 */
export function isSameDocument(a: DocumentMeta | null, b: DocumentMeta | null): boolean {
  return !!a && !!b && a.docId === b.docId;
}