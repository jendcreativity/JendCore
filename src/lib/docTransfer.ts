/**
 * Document transfer — chunking, reassembly and integrity.
 *
 * Pure logic plus `crypto.subtle`, so the protocol can be exercised without a
 * browser or a peer.
 *
 * Protocol
 * --------
 * The bytes of a shared document travel over the **WebRTC data channel** as
 * binary messages — one chunk per message — with a small JSON header in front
 * of each chunk on the same ordered channel:
 *
 *     { t: 'chunk', docId, transferId, index, count, bytes }
 *     <ArrayBuffer chunk>
 *
 * Ordered delivery means header *n* is always followed by body *n*, so the pair
 * reassembles without per-chunk framing overhead or base64 inflation (4/3 on the
 * wire, plus JSON escaping). A document is transferred **once per share**;
 * annotations and page changes are separate compact events that never re-send
 * the file.
 *
 * Why a data channel rather than the broadcast channel: the signalling service
 * caps a payload at 256 KB on its free plan (3 MB on Pro), counts every message
 * against a per-second budget, and gives no delivery guarantee — none of which
 * suits a multi-megabyte file. WebRTC provides an ordered, reliable,
 * peer-to-peer byte stream with backpressure and no per-message cost.
 */

/** 64 KB per chunk: comfortably inside every browser's data-channel limits. */
export const CHUNK_BYTES = 64 * 1024;

/** Highest chunk index accepted, as a guard against absurd headers. */
export const MAX_CHUNKS = 4096;

/** Silent for this long mid-transfer, and the transfer is treated as stalled. */
export const TRANSFER_TIMEOUT_MS = 25_000;

/** Hard ceiling on how long one transfer may take end to end. */
export const TRANSFER_MAX_MS = 10 * 60 * 1000;

/** A chunk header, sent immediately before its binary body. */
export interface ChunkHeader {
  t: 'chunk';
  docId: string;
  transferId: string;
  index: number;
  count: number;
  bytes: number;
}

/** Transfer lifecycle frames — all JSON, all on the same data channel. */
export interface TransferBeginFrame {
  t: 'begin';
  docId: string;
  transferId: string;
  sha256: string;
  size: number;
  count: number;
  /** Peer that holds the document — the sharer. */
  from: string;
}
export interface TransferDoneFrame {
  t: 'done';
  docId: string;
  transferId: string;
}
export interface TransferAckFrame {
  t: 'ack';
  transferId: string;
  /** Chunks accepted so far — this is the end-to-end progress number. */
  received: number;
}
export interface TransferCancelFrame {
  t: 'cancel';
  docId: string;
  transferId: string;
  reason: string;
}
export interface TransferRequestFrame {
  t: 'need';
  docId: string;
}

export type TransferFrame =
  | ChunkHeader
  | TransferBeginFrame
  | TransferDoneFrame
  | TransferAckFrame
  | TransferCancelFrame
  | TransferRequestFrame;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function str(value: unknown, max = 64): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
}

function int(value: unknown, max = Number.MAX_SAFE_INTEGER): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max
    ? value
    : null;
}

/**
 * Validates an inbound frame. Anything unrecognised is dropped — the same
 * posture `parseIncomingMessage` takes for chat — so a malformed or hostile
 * frame cannot desynchronise the reassembler.
 */
export function parseTransferFrame(raw: unknown): TransferFrame | null {
  if (!isRecord(raw)) return null;
  const t = raw.t;
  if (t === 'chunk') {
    const docId = str(raw.docId);
    const transferId = str(raw.transferId, 80);
    const index = int(raw.index, MAX_CHUNKS);
    const count = int(raw.count, MAX_CHUNKS);
    const bytes = int(raw.bytes, CHUNK_BYTES * 4);
    if (!docId || !transferId || index === null || count === null || bytes === null) return null;
    if (count < 1 || index >= count || bytes < 1) return null;
    return { t: 'chunk', docId, transferId, index, count, bytes };
  }
  if (t === 'begin') {
    const docId = str(raw.docId);
    const transferId = str(raw.transferId, 80);
    const sha256 = str(raw.sha256, 64);
    const from = str(raw.from);
    const size = int(raw.size, Number.MAX_SAFE_INTEGER);
    const count = int(raw.count, MAX_CHUNKS);
    if (!docId || !transferId || !sha256 || !from || size === null || count === null) return null;
    if (!/^[0-9a-f]{64}$/i.test(sha256) || count < 1 || size < 1) return null;
    return { t: 'begin', docId, transferId, sha256: sha256.toLowerCase(), size, count, from };
  }
  if (t === 'done') {
    const docId = str(raw.docId);
    const transferId = str(raw.transferId, 80);
    if (!docId || !transferId) return null;
    return { t: 'done', docId, transferId };
  }
  if (t === 'ack') {
    const transferId = str(raw.transferId, 80);
    const received = int(raw.received, MAX_CHUNKS);
    if (!transferId || received === null) return null;
    return { t: 'ack', transferId, received };
  }
  if (t === 'cancel') {
    const docId = str(raw.docId);
    const transferId = str(raw.transferId, 80);
    const reason = str(raw.reason, 200);
    if (!docId || !transferId) return null;
    return { t: 'cancel', docId, transferId, reason: reason ?? 'cancelled' };
  }
  if (t === 'need') {
    const docId = str(raw.docId);
    if (!docId) return null;
    return { t: 'need', docId };
  }
  return null;
}

/** Splits bytes into `CHUNK_BYTES` pieces. Chunks are views, never copies. */
export function sliceChunks(bytes: Uint8Array): Uint8Array[] {
  if (bytes.byteLength === 0) return [];
  const count = Math.ceil(bytes.byteLength / CHUNK_BYTES);
  const out: Uint8Array[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(bytes.subarray(i * CHUNK_BYTES, Math.min(bytes.byteLength, (i + 1) * CHUNK_BYTES)));
  }
  return out;
}

/** Hex SHA-256 of the bytes — the proof that the received copy is the sent one. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const view = new Uint8Array(bytes.byteLength);
  view.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', view);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

let transferSeq = 0;
/** A fresh transfer id per attempt; two shares of one doc never collide. */
export function newTransferId(): string {
  transferSeq += 1;
  return `t_${Date.now().toString(36)}_${transferSeq.toString(36)}`;
}

/**
 * Everything the sender needs for one transfer, computed **before** the first
 * chunk moves, so the receiver is told the size, the chunk count and the digest
 * up front — which is what makes integrity checking possible and progress
 * reporting honest.
 */
export async function prepareTransfer(
  docId: string,
  bytes: Uint8Array,
  from: string,
  transferId: string,
): Promise<{ begin: TransferBeginFrame; chunks: Uint8Array[] }> {
  const chunks = sliceChunks(bytes);
  const sha256 = await sha256Hex(bytes);
  return {
    begin: {
      t: 'begin',
      docId,
      transferId,
      sha256,
      size: bytes.byteLength,
      count: chunks.length,
      from,
    },
    chunks,
  };
}

export class TransferMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransferMismatchError';
  }
}

/**
 * Reassembles one inbound transfer.
 *
 * Defensive by construction: chunks for the wrong transfer are filtered by the
 * caller (every frame carries `transferId`), duplicates are ignored, an
 * out-of-range index is dropped, and `finalize()` refuses to hand back bytes
 * whose length or digest does not match the manifest. A stalled transfer is
 * reported as expired rather than left spinning.
 */
export class TransferAssembler {
  readonly docId: string;
  readonly transferId: string;
  readonly count: number;
  readonly size: number;
  readonly sha256: string;
  readonly from: string;

  private readonly parts: (Uint8Array | null)[];
  private received = 0;
  private readonly startedAt: number;
  private lastChunkAt: number;

  constructor(begin: TransferBeginFrame, now = Date.now()) {
    this.docId = begin.docId;
    this.transferId = begin.transferId;
    this.count = begin.count;
    this.size = begin.size;
    this.sha256 = begin.sha256;
    this.from = begin.from;
    this.parts = new Array<Uint8Array | null>(begin.count).fill(null);
    this.startedAt = now;
    this.lastChunkAt = now;
  }

  /** Chunks accepted so far. */
  get accepted(): number {
    return this.received;
  }

  get complete(): boolean {
    return this.received === this.count;
  }

  /** 0..1, for the progress bar on the receiving side. */
  get ratio(): number {
    return this.count > 0 ? this.received / this.count : 0;
  }

  /**
   * Accepts one chunk body. Returns `true` when it was new and accepted, so the
   * caller can decide when to acknowledge progress.
   */
  push(index: number, body: ArrayBuffer | Uint8Array, now = Date.now()): boolean {
    this.lastChunkAt = now;
    if (!Number.isInteger(index) || index < 0 || index >= this.count) return false;
    if (this.parts[index]) return false;
    const view = body instanceof Uint8Array ? body : new Uint8Array(body);
    // A single chunk larger than the whole document is a broken frame.
    if (view.byteLength === 0 || view.byteLength > this.size) return false;
    this.parts[index] = view.slice();
    this.received += 1;
    return true;
  }

  /** True when the transfer has stalled or run past its overall ceiling. */
  isExpired(now = Date.now()): boolean {
    if (this.complete) return false;
    return now - this.lastChunkAt > TRANSFER_TIMEOUT_MS || now - this.startedAt > TRANSFER_MAX_MS;
  }

  /**
   * Verifies and returns the document bytes. Throws `TransferMismatchError` when
   * anything does not add up, so a partial or corrupted copy can never be
   * adopted as the active document.
   */
  async finalize(): Promise<Uint8Array> {
    if (!this.complete) {
      throw new TransferMismatchError(
        `The transfer stopped early — ${this.received} of ${this.count} parts arrived.`,
      );
    }
    const out = new Uint8Array(this.size);
    let offset = 0;
    for (let i = 0; i < this.count; i += 1) {
      const part = this.parts[i];
      if (!part) {
        throw new TransferMismatchError('Part of the document is missing. Please share it again.');
      }
      out.set(part, offset);
      offset += part.byteLength;
      this.parts[i] = null; // release each buffer as it is folded in
    }
    if (offset !== this.size) {
      throw new TransferMismatchError('The document arrived at the wrong size. Please share it again.');
    }
    const actual = await sha256Hex(out);
    if (actual !== this.sha256) {
      throw new TransferMismatchError(
        'The document did not arrive intact, so it was discarded. Please share it again.',
      );
    }
    return out;
  }
}