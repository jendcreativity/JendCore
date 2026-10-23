/**
 * Shared document state: transport, transfer orchestration, operations and
 * lifecycle.
 *
 * One hook owns the whole feature, so `SessionPage` stays a composition rather
 * than a second implementation of the protocol.
 *
 * Division of labour (approved architecture)
 * -----------------------------------------
 * - **Document bytes** travel over the peer-to-peer **WebRTC data channel**:
 *   chunked, integrity-checked, acknowledged end to end.
 * - **Metadata, annotations, page changes and lifecycle events** travel over the
 *   existing Supabase broadcast channel as compact JSON under `kind: 'doc'`,
 *   which is exactly the traffic that channel is good at.
 *
 * Everything is scoped to one document: every annotation operation carries a
 * `docId` and an op for a document that is not active is dropped, so a replaced
 * document cannot inherit the previous one's marks and a stale transfer cannot
 * overwrite the current document.
 *
 * Nothing is persisted: bytes live in memory for the lifetime of the share,
 * annotations live in React state, and every buffer, timer, listener and object
 * URL is released on close, replace, unmount and teardown.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { newDocId, parseDocumentMeta, type DocumentMeta } from '../lib/documents';
import {
  applyDocOp,
  hitTest,
  // Exported as `nextOpId`; aliased so the nine call sites below stay unchanged.
  nextOpId as newOpId,
  parseDocAnnotation,
  parseDocOp,
  type DocAnnotation,
  type DocOp,
} from '../lib/docAnnotations';
import {
  CHUNK_BYTES,
  TransferAssembler,
  newTransferId,
  parseTransferFrame,
  prepareTransfer,
} from '../lib/docTransfer';
import type { InspectedDocument } from '../lib/documentInspect';
import type { DataChannelControls, SignalEnvelope } from './usePeerConnection';

/** Wire kinds for document traffic (nested under a top-level `kind: 'doc'`). */
type DocEventKind =
  | 'doc-meta'
  | 'doc-state-request'
  | 'doc-snapshot-page'
  | 'doc-page'
  | 'doc-annop'
  | 'doc-close';

export interface DocEventPayload {
  kind: DocEventKind;
  doc?: unknown;
  docId?: string;
  revision?: number;
  page?: number;
  annotations?: unknown;
  op?: unknown;
}

export type TransferStage = 'idle' | 'sending' | 'receiving' | 'error';

/** Live transfer state for the progress UI — honest numbers only. */
export interface TransferState {
  stage: TransferStage;
  docId: string;
  name: string;
  direction: 'out' | 'in';
  /** 0..1. Receiving: parts accepted. Sending: parts acknowledged. */
  ratio: number;
  /** Bytes confirmed moved, clamped to the real total. */
  moved: number;
  total: number;
  message?: string;
}

export interface SharedDocumentApi {
  /** The active shared document, this user's or a peer's. */
  meta: DocumentMeta | null;
  /** True when this browser holds the bytes for `meta`. */
  ready: boolean;
  /** Object URL for an image document; null for PDFs or while transferring. */
  imageUrl: string | null;
  /** Image and PDF bytes, held only while the document is active. */
  bytes: Uint8Array | null;
  /** Shared page (1-based); page navigation is synchronised by default. */
  page: number;
  /** Annotations for the active document, across all pages. */
  annotations: DocAnnotation[];
  transfer: TransferState | null;
  error: string | null;
  /** True while this peer holds the active document (the late-joiner source). */
  isHolder: boolean;
  canUndo: boolean;
  canRedo: boolean;

  share: (doc: InspectedDocument) => Promise<void>;
  closeDocument: () => void;
  setPage: (page: number) => void;
  addAnnotation: (annotation: DocAnnotation) => void;
  streamPatch: (id: string, page: number, patch: Record<string, unknown>) => void;
  finishAnnotation: (id: string, page: number, patch: Record<string, unknown>) => void;
  eraseAt: (
    page: number,
    point: [number, number],
    tolerance: number,
    pageSize: { width: number; height: number },
  ) => boolean;
  clearPage: () => void;
  undo: () => void;
  redo: () => void;
  dismissError: () => void;
}

/** Stroke patch cadence — coalesced, never one broadcast per pointer move. */
const PATCH_INTERVAL_MS = 90;
/** Parts between receiver acknowledgements. */
const ACK_EVERY = 8;
/** How often stale-transfer sweeps run. */
const SWEEP_INTERVAL_MS = 4000;

/** The slice of the session transport this feature needs. */
export interface DocSignalChannel {
  send: (env: SignalEnvelope) => void;
  subscribe: (handler: (env: SignalEnvelope) => void) => () => void;
}

/** What this peer knows about the session it is sharing a document with. */
export interface DocSessionInfo {
  /** The peer we are connected to, if any (`null` while alone). */
  remoteId: string | null;
  /** True once the peer connection is live. */
  connected: boolean;
}

export function useSharedDocument(
  selfId: string,
  signal: DocSignalChannel,
  data: DataChannelControls,
  session: DocSessionInfo,
): SharedDocumentApi {

  const [meta, setMeta] = useState<DocumentMeta | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [page, setPageState] = useState(1);
  const [annotations, setAnnotations] = useState<DocAnnotation[]>([]);
  const [transfer, setTransfer] = useState<TransferState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });

  /* Mirrors for the async transfer path, which must not re-bind on each render. */
  const metaRef = useRef<DocumentMeta | null>(null);
  const bytesRef = useRef<Uint8Array | null>(null);
  const pageRef = useRef(1);
  const pendingPatchRef = useRef<Map<string, { page: number; patch: Record<string, unknown> }>>(new Map());
  const patchTimerRef = useRef<number | null>(null);
  const sweepTimerRef = useRef<number | null>(null);
  const sendAbortRef = useRef<{ cancelled: boolean } | null>(null);
  const assemblerRef = useRef<TransferAssembler | null>(null);
  /** Header of the part whose binary body is expected next. */
  const expectRef = useRef<{ docId: string; transferId: string; index: number } | null>(null);
  const ackCountRef = useRef(0);
  const ackStateRef = useRef({ acked: 0, sent: 0, count: 0 });
  /** The transfer this peer is currently sending, for matching acknowledgements. */
  const sendInfoRef = useRef<{ transferId: string; count: number; size: number } | null>(null);
  /** Live annotation list, for handlers that run outside React's render cycle. */
  const annotationsRef = useRef<DocAnnotation[]>([]);
  /** The object URL we own, revoked imperatively so unmount cannot leak it. */
  const imageUrlRef = useRef<string | null>(null);
  const undoStackRef = useRef<{ op: DocOp; inverse: DocOp }[]>([]);
  const redoStackRef = useRef<{ op: DocOp; inverse: DocOp }[]>([]);

  const clearImageUrl = useCallback(() => {
    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = null;
    }
    setImageUrl(null);
  }, []);

  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  const stopTimers = useCallback(() => {
    if (patchTimerRef.current !== null) {
      window.clearInterval(patchTimerRef.current);
      patchTimerRef.current = null;
    }
    if (sweepTimerRef.current !== null) {
      window.clearInterval(sweepTimerRef.current);
      sweepTimerRef.current = null;
    }
    pendingPatchRef.current.clear();
  }, []);

  /** Full teardown of everything this feature allocated. */
  const reset = useCallback(() => {
    stopTimers();
    if (sendAbortRef.current) sendAbortRef.current.cancelled = true;
    sendAbortRef.current = null;
    assemblerRef.current = null;
    expectRef.current = null;
    ackCountRef.current = 0;
    ackStateRef.current = { acked: 0, sent: 0, count: 0 };
    undoStackRef.current = [];
    redoStackRef.current = [];
    clearImageUrl();
    bytesRef.current = null;
    setBytes(null);
    metaRef.current = null;
    setMeta(null);
    setAnnotations([]);
    setTransfer(null);
    setHistory({ undo: 0, redo: 0 });
    pageRef.current = 1;
    setPageState(1);
  }, [clearImageUrl, stopTimers]);

  /**
   * Publishes a document event on the broadcast channel. Chat and annotations
   * already use this envelope shape (a `kind` with a nested payload kind), so
   * the transport needs no new capability for any of it.
   */
  const emit = useCallback(
    (payload: DocEventPayload) => {
      signal.send({
        from: selfId,
        to: '*',
        kind: 'doc',
        payload: { ...payload, from: selfId },
      });
    },
    [selfId, signal],
  );

  /** Applies an operation locally and tells the session about it. */
  const emitOp = useCallback(
    (op: DocOp) => {
      setAnnotations((list) => applyDocOp(list, op));
      emit({ kind: 'doc-annop', docId: op.docId, page: op.page, op });
    },
    [emit],
  );

  /**
   * Applies an operation *this* user initiated and records how to reverse it.
   * Undo is therefore local and predictable: it reverses your most recent
   * eligible operation and never reaches for someone else's work.
   */
  const applyLocalOp = useCallback(
    (op: DocOp, inverse: DocOp | null) => {
      emitOp(op);
      if (inverse) {
        undoStackRef.current.push({ op, inverse });
        redoStackRef.current = [];
        setHistory({ undo: undoStackRef.current.length, redo: 0 });
      }
    },
    [emitOp],
  );

  const holder = useMemo(
    () => !!meta && !!bytes && meta.sharedBy === selfId,
    [meta, bytes, selfId],
  );

  /** Adopts verified bytes as the active document's content. */
  const adoptBytes = useCallback(
    (next: Uint8Array, docMeta: DocumentMeta) => {
      bytesRef.current = next;
      setBytes(next);
      clearImageUrl();
      if (docMeta.kind === 'image') {
        try {
          // Object URL owned by this hook, revoked on replace/close/unmount.
          // A `Uint8Array` is a valid `BlobPart` at runtime; TS 5.7 typed-array
          // generics don't narrow `ArrayBufferLike` to `ArrayBuffer`, so the
          // assertion is explicit rather than a silent `any`.
          const url = URL.createObjectURL(
            new Blob([next as BlobPart], { type: docMeta.mime }),
          );
          imageUrlRef.current = url;
          setImageUrl(url);
        } catch {
          setError('The shared image could not be displayed on this device.');
        }
      }
      setTransfer(null);
    },
    [clearImageUrl],
  );

  /** Announces the active document so peers know what to ask for. */
  const announce = useCallback(
    (docMeta: DocumentMeta, atPage?: number) => {
      emit({
        kind: 'doc-meta',
        doc: docMeta,
        docId: docMeta.docId,
        revision: docMeta.revision,
        page: atPage ?? pageRef.current,
      });
    },
    [emit],
  );

  /**
   * Streams the document over the data channel, part by part.
   *
   * The manifest goes first, so the receiver knows the size, the part count and
   * the digest before a single byte moves. Progress is reported from the
   * receiver's acknowledgements, not from a guess — "sent" and "confirmed" are
   * never conflated.
   */
  const sendDocument = useCallback(
    async (docMeta: DocumentMeta, source: Uint8Array) => {
      const abort = { cancelled: false };
      if (sendAbortRef.current) sendAbortRef.current.cancelled = true;
      sendAbortRef.current = abort;

      const report = (message?: string) => {
        const { acked, sent, count } = ackStateRef.current;
        setTransfer({
          stage: 'sending',
          docId: docMeta.docId,
          name: docMeta.name,
          direction: 'out',
          ratio: count > 0 ? Math.min(1, acked / count) : 0,
          moved: Math.min(docMeta.size, acked * CHUNK_BYTES),
          total: docMeta.size,
          message: message ?? (sent < count ? 'Sending…' : 'Waiting for confirmation…'),
        });
      };

      setTransfer({
        stage: 'sending',
        docId: docMeta.docId,
        name: docMeta.name,
        direction: 'out',
        ratio: 0,
        moved: 0,
        total: docMeta.size,
        message: 'Preparing…',
      });

      try {
        const transferId = newTransferId();
        const { begin, chunks } = await prepareTransfer(docMeta.docId, source, selfId, transferId);
        if (abort.cancelled) return;
        ackStateRef.current = { acked: 0, sent: 0, count: begin.count };
        sendInfoRef.current = { transferId, count: begin.count, size: docMeta.size };

        if (!(await data.send(JSON.stringify(begin)))) {
          throw new Error('The direct link to the other participant is not open yet.');
        }
        for (let i = 0; i < chunks.length; i += 1) {
          if (abort.cancelled) return;
          const header = {
            t: 'chunk',
            docId: docMeta.docId,
            transferId,
            index: i,
            count: begin.count,
            bytes: chunks[i].byteLength,
          };
          if (!(await data.send(JSON.stringify(header)))) {
            throw new Error('The transfer was interrupted before it finished.');
          }
          // A copy, because the channel may hold the buffer until it drains.
          if (!(await data.send(chunks[i].slice().buffer as ArrayBuffer))) {
            throw new Error('The transfer was interrupted before it finished.');
          }
          ackStateRef.current.sent = i + 1;
          if (i % 4 === 3 || i === chunks.length - 1) report();
        }
        if (abort.cancelled) return;
        if (!(await data.send(JSON.stringify({ t: 'done', docId: docMeta.docId, transferId })))) {
          throw new Error('The transfer could not be completed.');
        }
        report(ackStateRef.current.acked >= ackStateRef.current.count ? 'Sent' : undefined);
      } catch (err) {
        if (!abort.cancelled) {
          setTransfer(null);
          setError(err instanceof Error ? err.message : 'The document could not be sent.');
        }
      } finally {
        if (sendAbortRef.current === abort) sendAbortRef.current = null;
        if (sendInfoRef.current && ackStateRef.current.acked >= sendInfoRef.current.count) {
          sendInfoRef.current = null;
        }
      }
    },
    [data, selfId],
  );

  /* ────────────── inbound: document bytes, over the data channel ────────────── */

  useEffect(() => {
    const receiveStart = (assembler: TransferAssembler, name: string) => {
      setTransfer({
        stage: 'receiving',
        docId: assembler.docId,
        name,
        direction: 'in',
        ratio: assembler.ratio,
        moved: Math.min(assembler.size, assembler.accepted * CHUNK_BYTES),
        total: assembler.size,
        message: 'Receiving…',
      });
    };

    const unsubscribe = data.subscribe((payload) => {
      // A binary body belongs to the part header that arrived immediately before
      // it on the same ordered channel.
      if (typeof payload !== 'string') {
        const expect = expectRef.current;
        const assembler = assemblerRef.current;
        expectRef.current = null;
        if (!expect || !assembler || assembler.transferId !== expect.transferId) return;
        if (!assembler.push(expect.index, payload)) return;
        receiveStart(assembler, metaRef.current?.name ?? 'Document');
        ackCountRef.current += 1;
        if (ackCountRef.current % ACK_EVERY === 0 || assembler.complete) {
          void data.send(
            JSON.stringify({ t: 'ack', transferId: assembler.transferId, received: assembler.accepted }),
          );
        }
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        return;
      }
      const frame = parseTransferFrame(parsed);
      if (!frame) return;
      const active = metaRef.current;

      if (frame.t === 'chunk') {
        // A part for a document that is no longer active is dropped: this is what
        // stops a superseded transfer from writing into the new document.
        if (!active || frame.docId !== active.docId) return;
        const assembler = assemblerRef.current;
        if (!assembler || assembler.transferId !== frame.transferId) return;
        expectRef.current = { docId: frame.docId, transferId: frame.transferId, index: frame.index };
        return;
      }

      if (frame.t === 'begin') {
        if (!active || frame.docId !== active.docId) return;
        if (bytesRef.current && active.sha256 === frame.sha256) {
          // These exact bytes are already held — confirm and take nothing.
          void data.send(JSON.stringify({ t: 'done', docId: frame.docId, transferId: frame.transferId }));
          return;
        }
        const assembler = new TransferAssembler(frame);
        assemblerRef.current = assembler;
        expectRef.current = null;
        ackCountRef.current = 0;
        receiveStart(assembler, active.name);
        return;
      }

      if (frame.t === 'done') {
        const assembler = assemblerRef.current;
        if (!assembler || assembler.transferId !== frame.transferId) return;
        const docMeta = active;
        assemblerRef.current = null;
        expectRef.current = null;
        void (async () => {
          try {
            const verified = await assembler.finalize();
            // The document may have been replaced while the bytes were in flight.
            if (!docMeta || docMeta.docId !== assembler.docId) {
              await data.send(JSON.stringify({ t: 'ack', transferId: assembler.transferId, received: assembler.count }));
              return;
            }
            adoptBytes(verified, docMeta);
            await data.send(
              JSON.stringify({ t: 'ack', transferId: assembler.transferId, received: assembler.count }),
            );
          } catch (err) {
            setTransfer(null);
            setError(
              err instanceof Error ? err.message : 'The document did not arrive intact, so it was discarded.',
            );
            void data.send(
              JSON.stringify({
                t: 'cancel',
                docId: assembler.docId,
                transferId: assembler.transferId,
                reason: 'integrity',
              }),
            );
          }
        })();
        return;
      }

      if (frame.t === 'ack') {
        const info = sendInfoRef.current;
        if (!info || info.transferId !== frame.transferId) return;
        ackStateRef.current.acked = Math.min(info.count, Math.max(ackStateRef.current.acked, frame.received));
        setTransfer((current) =>
          current && current.direction === 'out'
            ? {
                ...current,
                ratio: info.count > 0 ? Math.min(1, ackStateRef.current.acked / info.count) : current.ratio,
                moved: Math.min(info.size, ackStateRef.current.acked * CHUNK_BYTES),
                message: ackStateRef.current.acked >= info.count ? 'Sent and confirmed' : 'Sending…',
              }
            : current,
        );
        return;
      }

      if (frame.t === 'cancel') {
        if (sendInfoRef.current?.transferId === frame.transferId) {
          if (sendAbortRef.current) sendAbortRef.current.cancelled = true;
          sendInfoRef.current = null;
          setTransfer(null);
          setError('The other participant could not receive the document intact. Please share it again.');
          return;
        }
        if (assemblerRef.current?.transferId === frame.transferId) {
          assemblerRef.current = null;
          expectRef.current = null;
          setTransfer(null);
          setError('The transfer was cancelled.');
        }
        return;
      }

      // 'need': a peer (usually a late joiner) is asking for the bytes.
      if (frame.t === 'need') {
        const held = metaRef.current;
        if (held && bytesRef.current && held.sharedBy === selfId && held.docId === frame.docId) {
          void sendDocument(held, bytesRef.current);
        }
      }
    });

    return unsubscribe;
  }, [data, adoptBytes, sendDocument, selfId]);

  /* ── inbound: metadata, snapshots, pages and operations (broadcast) ── */

  useEffect(() => {
    /** One message per annotated page; the receiver merges by id. */
    const sendSnapshots = (docMeta: DocumentMeta) => {
      const byPage = new Map<number, DocAnnotation[]>();
      for (const annotation of annotationsRef.current) {
        const bucket = byPage.get(annotation.page);
        if (bucket) bucket.push(annotation);
        else byPage.set(annotation.page, [annotation]);
      }
      for (const [pageNo, items] of byPage) {
        emit({
          kind: 'doc-snapshot-page',
          docId: docMeta.docId,
          revision: docMeta.revision,
          page: pageNo,
          annotations: items,
        });
      }
    };

    const unsubscribe = signal.subscribe((env: SignalEnvelope) => {
      // The transport echoes our own broadcasts back (self: true); ignore them.
      if (env.kind !== 'doc' || env.from === selfId) return;
      const payload = env.payload as DocEventPayload | undefined;
      if (!payload || typeof payload !== 'object' || typeof payload.kind !== 'string') return;
      const active = metaRef.current;

      if (payload.kind === 'doc-meta') {
        const incoming = parseDocumentMeta(payload.doc);
        if (!incoming) return;
        if (active) {
          if (incoming.docId === active.docId) {
            // Same document at an older (or equal) revision: stale, ignore.
            if (incoming.revision <= active.revision) return;
          } else {
            // A different document replaces the active one: release the old one
            // completely, so no mark and no buffer can leak across.
            reset();
          }
        }
        metaRef.current = incoming;
        setMeta(incoming);
        if (
          typeof payload.page === 'number' &&
          payload.page >= 1 &&
          payload.page <= incoming.pageCount
        ) {
          pageRef.current = Math.round(payload.page);
          setPageState(pageRef.current);
        }
        const haveExact = !!bytesRef.current && bytesRef.current.byteLength === incoming.size;
        if (!haveExact) {
          bytesRef.current = null;
          setBytes(null);
          clearImageUrl();
          if (data.readyState === 'open' && incoming.sharedBy !== selfId) {
            void data.send(JSON.stringify({ t: 'need', docId: incoming.docId }));
          }
        }
        return;
      }

      if (payload.kind === 'doc-state-request') {
        const held = metaRef.current;
        if (!held) return;
        // Every peer answers with what it holds: the holder re-announces the
        // document, and anyone with marks contributes them. Snapshots merge by
        // id, so two answers are harmless.
        emit({
          kind: 'doc-meta',
          doc: held,
          docId: held.docId,
          revision: held.revision,
          page: pageRef.current,
        });
        sendSnapshots(held);
        return;
      }

      if (payload.kind === 'doc-snapshot-page') {
        if (!active || payload.docId !== active.docId) return;
        if (typeof payload.page !== 'number' || !Array.isArray(payload.annotations)) return;
        const pageNo = Math.round(payload.page);
        if (pageNo < 1 || pageNo > active.pageCount) return;
        const incoming: DocAnnotation[] = [];
        for (const raw of payload.annotations) {
          const parsed = parseDocAnnotation(raw, active.pageCount);
          if (parsed && parsed.page === pageNo) incoming.push(parsed);
        }
        if (incoming.length === 0) return;
        // Union by id: a snapshot backfills history, it never destroys local work.
        setAnnotations((list) => {
          const known = new Set(list.map((a) => a.id));
          const added = incoming.filter((a) => !known.has(a.id));
          return added.length === 0 ? list : [...list, ...added];
        });
        return;
      }

      if (payload.kind === 'doc-page') {
        if (!active || payload.docId !== active.docId) return;
        const next = Math.round(payload.page ?? 0);
        if (next < 1 || next > active.pageCount) return;
        pageRef.current = next;
        setPageState(next);
        return;
      }

      if (payload.kind === 'doc-annop') {
        if (!active) return;
        const op = parseDocOp(payload.op, active.docId, active.pageCount);
        if (!op || op.author === selfId) return;
        setAnnotations((list) => applyDocOp(list, op));
        return;
      }

      if (payload.kind === 'doc-close') {
        if (active && payload.docId && payload.docId !== active.docId) return;
        reset();
      }
    });

    return unsubscribe;
  }, [data, clearImageUrl, emit, reset, selfId, signal]);

  /* ── joining and reconnecting: ask for the current document state ── */

  useEffect(() => {
    if (!session.remoteId) return;
    emit({ kind: 'doc-state-request' });
    const held = metaRef.current;
    if (held && !bytesRef.current && held.sharedBy !== selfId && data.readyState === 'open') {
      void data.send(JSON.stringify({ t: 'need', docId: held.docId }));
    }
  }, [session.remoteId, session.connected, data, emit, selfId]);

  /** A document announced before the direct link opened is fetched here. */
  useEffect(() => {
    if (data.readyState !== 'open') return;
    const held = metaRef.current;
    if (held && !bytesRef.current && held.sharedBy !== selfId) {
      void data.send(JSON.stringify({ t: 'need', docId: held.docId }));
    }
  }, [data, data.readyState, selfId]);

  /* ── a stalled transfer fails loudly instead of hanging forever ── */

  useEffect(() => {
    sweepTimerRef.current = window.setInterval(() => {
      const assembler = assemblerRef.current;
      if (assembler && assembler.isExpired()) {
        assemblerRef.current = null;
        expectRef.current = null;
        setTransfer(null);
        setError(
          'The document stopped arriving part-way through, so it was discarded. Ask the other participant to share it again.',
        );
      }
    }, SWEEP_INTERVAL_MS) as unknown as number;
    return () => {
      if (sweepTimerRef.current !== null) {
        window.clearInterval(sweepTimerRef.current);
        sweepTimerRef.current = null;
      }
    };
  }, []);

  /* ── release everything when this hook goes away ── */

  useEffect(() => () => reset(), [reset]);

  /* ────────────────────────── local operations ────────────────────────── */

  /** Flushes coalesced stroke patches: at most one broadcast per part per tick. */
  const flushPatches = useCallback(() => {
    const held = metaRef.current;
    if (!held) {
      pendingPatchRef.current.clear();
      return;
    }
    if (pendingPatchRef.current.size === 0) {
      if (patchTimerRef.current !== null) {
        window.clearInterval(patchTimerRef.current);
        patchTimerRef.current = null;
      }
      return;
    }
    const queued = Array.from(pendingPatchRef.current.entries());
    pendingPatchRef.current.clear();
    for (const [id, item] of queued) {
      emitOp({
        opId: newOpId(),
        docId: held.docId,
        author: selfId,
        ts: Date.now(),
        type: 'patch',
        page: item.page,
        id,
        patch: item.patch,
      });
    }
  }, [emitOp, selfId]);

  const addAnnotation = useCallback(
    (annotation: DocAnnotation) => {
      const held = metaRef.current;
      if (!held) return;
      const stamp = Date.now();
      applyLocalOp(
        {
          opId: newOpId(),
          docId: held.docId,
          author: selfId,
          ts: stamp,
          type: 'add',
          page: annotation.page,
          annotation,
        },
        {
          opId: newOpId(),
          docId: held.docId,
          author: selfId,
          ts: stamp,
          type: 'delete',
          page: annotation.page,
          id: annotation.id,
        },
      );
    },
    [applyLocalOp, selfId],
  );

  /**
   * Queues a live patch. Drawing sends the newest points at a fixed cadence
   * instead of one message per pointer move, so a fast stroke cannot flood the
   * channel or the other participant's render loop.
   */
  const streamPatch = useCallback(
    (id: string, pageNo: number, patch: Record<string, unknown>) => {
      if (!metaRef.current) return;
      const queued = pendingPatchRef.current.get(id);
      if (queued) queued.patch = mergePatch(queued.patch, patch);
      else pendingPatchRef.current.set(id, { page: pageNo, patch });
      if (patchTimerRef.current === null) {
        patchTimerRef.current = window.setInterval(flushPatches, PATCH_INTERVAL_MS) as unknown as number;
      }
    },
    [flushPatches],
  );

  /** Commits a finished shape, flushing anything still queued for it. */
  const finishAnnotation = useCallback(
    (id: string, pageNo: number, patch: Record<string, unknown>) => {
      const held = metaRef.current;
      if (!held) return;
      const queued = pendingPatchRef.current.get(id);
      const merged = mergePatch(queued?.patch ?? {}, patch);
      pendingPatchRef.current.delete(id);
      emitOp({
        opId: newOpId(),
        docId: held.docId,
        author: selfId,
        ts: Date.now(),
        type: 'patch',
        page: queued?.page ?? pageNo,
        id,
        patch: { ...merged, done: true },
      });
    },
    [emitOp, selfId],
  );

  /**
   * Eraser: removes one whole annotation, chosen by hit-testing the pointer
   * against the stored geometry. The document underneath is never modified, and
   * the deletion is undoable because the removed mark is kept as the inverse.
   */
  const eraseAt = useCallback(
    (
      pageNo: number,
      point: [number, number],
      tolerance: number,
      pageSize: { width: number; height: number },
    ) => {
      const held = metaRef.current;
      if (!held) return false;
      const target = hitTest(annotationsRef.current, pageNo, point, tolerance, pageSize);
      if (!target) return false;
      const stamp = Date.now();
      applyLocalOp(
        {
          opId: newOpId(),
          docId: held.docId,
          author: selfId,
          ts: stamp,
          type: 'delete',
          page: pageNo,
          id: target.id,
        },
        {
          opId: newOpId(),
          docId: held.docId,
          author: selfId,
          ts: stamp,
          type: 'add',
          page: pageNo,
          annotation: target,
        },
      );
      return true;
    },
    [applyLocalOp, selfId],
  );

  /**
   * Clears the page currently on screen. Deliberately *not* undoable: restoring
   * a wholesale deletion would mean holding the entire prior page on every peer,
   * so the UI asks for confirmation instead.
   */
  const clearPage = useCallback(() => {
    const held = metaRef.current;
    if (!held) return;
    emitOp({
      opId: newOpId(),
      docId: held.docId,
      author: selfId,
      ts: Date.now(),
      type: 'clear-page',
      page: pageRef.current,
    });
  }, [emitOp, selfId]);

  /** Reverses this user's most recent eligible operation, and only theirs. */
  const undo = useCallback(() => {
    const entry = undoStackRef.current.pop();
    if (!entry) return;
    emitOp({ ...entry.inverse, opId: newOpId(), ts: Date.now() } as DocOp);
    redoStackRef.current.push(entry);
    setHistory({ undo: undoStackRef.current.length, redo: redoStackRef.current.length });
  }, [emitOp]);

  const redo = useCallback(() => {
    const entry = redoStackRef.current.pop();
    if (!entry) return;
    emitOp({ ...entry.op, opId: newOpId(), ts: Date.now() } as DocOp);
    undoStackRef.current.push(entry);
    setHistory({ undo: undoStackRef.current.length, redo: redoStackRef.current.length });
  }, [emitOp]);

  /**
   * Shares a validated document: announce first (so a peer can show the name and
   * ask for the bytes), then stream them over the data channel. The sharer keeps
   * its own copy and never re-encodes it.
   */
  const share = useCallback(
    async (doc: InspectedDocument) => {
      reset();
      const next: DocumentMeta = {
        docId: newDocId(),
        kind: doc.kind,
        name: doc.name,
        mime: doc.mime,
        size: doc.size,
        width: doc.width,
        height: doc.height,
        pageCount: doc.pageCount,
        sharedBy: selfId,
        ts: Date.now(),
        revision: 0,
        sha256: doc.sha256,
      };
      metaRef.current = next;
      setMeta(next);
      pageRef.current = 1;
      setPageState(1);
      adoptBytes(doc.bytes, next);
      announce(next, 1);
      await sendDocument(next, doc.bytes);
    },
    [adoptBytes, announce, reset, selfId, sendDocument],
  );

  /** Closes the shared document for the session and releases everything. */
  const closeDocument = useCallback(() => {
    const held = metaRef.current;
    if (held) emit({ kind: 'doc-close', docId: held.docId });
    reset();
  }, [emit, reset]);

  /** Page navigation is shared by default; zoom and pan never are. */
  const setPage = useCallback(
    (next: number) => {
      const held = metaRef.current;
      if (!held) return;
      const clamped = Math.min(held.pageCount, Math.max(1, Math.round(next)));
      if (clamped === pageRef.current) return;
      pageRef.current = clamped;
      setPageState(clamped);
      emit({ kind: 'doc-page', docId: held.docId, page: clamped });
    },
    [emit],
  );

  const dismissError = useCallback(() => setError(null), []);

  return {
    meta,
    ready: !!meta && !!bytes,
    imageUrl,
    bytes,
    page,
    annotations,
    transfer,
    error,
    isHolder: holder,
    canUndo: history.undo > 0,
    canRedo: history.redo > 0,
    share,
    closeDocument,
    setPage,
    addAnnotation,
    streamPatch,
    finishAnnotation,
    eraseAt,
    clearPage,
    undo,
    redo,
    dismissError,
  };
}

/**
 * Merges a newly queued patch into one that is already waiting.
 *
 * Pen points are appended (order *is* the stroke), while scalar fields — an
 * arrow's end, a rectangle's extents, a radius, the done flag — take the newest
 * value, which is exactly what "the latest pointer position" means.
 */
function mergePatch(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...a, ...b };
  const first = Array.isArray(a.append) ? (a.append as unknown[]) : [];
  const second = Array.isArray(b.append) ? (b.append as unknown[]) : [];
  if (first.length > 0 || second.length > 0) merged.append = [...first, ...second];
  return merged;
}