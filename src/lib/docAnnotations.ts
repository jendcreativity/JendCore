/**
 * Document annotation model, operations and hit-testing.
 *
 * Geometry is stored in **document space** — normalised `[0, 1]` against the
 * page box, never against the viewport — so zooming, panning, resizing or
 * another participant's screen size can never move a mark. See `documentView.ts`
 * for the display transform that keeps the rendered ink on top of the document
 * content it was drawn on.
 *
 * Lengths (stroke width, circle radius, font size) are stored as fractions of
 * the **shorter page edge**, so a mark keeps its visual weight on a portrait A4
 * page and a landscape drawing alike, and stays independent of zoom.
 *
 * Every annotation belongs to exactly one document **and one page**: page 1 and
 * page 2 of a PDF never share a layer, which is why page-scoped operations are
 * part of the wire format rather than something derived on arrival.
 */

import type { DocPoint } from './documentView';

export type DocTool = 'pen' | 'arrow' | 'rect' | 'circle' | 'text';

/** High-contrast default ink; a single colour keeps the toolbar honest. */
export const DOC_COLOR = '#ef4444';
/** Default stroke weight, as a fraction of the shorter page edge (≈0.45%). */
export const DOC_WIDTH = 0.0045;
/** Default text size, as a fraction of the shorter page edge (≈3.5%). */
export const DOC_FONT = 0.035;

/** Ceilings that keep one participant from bloating every other peer's memory. */
export const DOC_ANNOTATION_LIMITS = {
  pointsPerStroke: 5000,
  patchAppendPoints: 512,
  textLength: 500,
  annotationsPerPage: 2000,
  annotationsTotal: 8000,
} as const;

interface DocBase {
  id: string;
  /** Peer id of the author (used to keep undo to your own work). */
  author: string;
  /** 1-based page this mark belongs to. */
  page: number;
  color: string;
  /** Stroke weight as a fraction of the shorter page edge. */
  width: number;
  createdAt: number;
}

export interface DocPen extends DocBase {
  tool: 'pen';
  /** Stroke path in document space, in drawing order. */
  points: DocPoint[];
  /** False while the author is still dragging; true once the stroke is finished. */
  done: boolean;
}

export interface DocArrow extends DocBase {
  tool: 'arrow';
  start: DocPoint;
  end: DocPoint;
  done: boolean;
}

export interface DocRect extends DocBase {
  tool: 'rect';
  /** Top-left corner in document space (always normalised to be the minimum). */
  x: number;
  y: number;
  /** Positive extents in document space. */
  w: number;
  h: number;
}

export interface DocCircle extends DocBase {
  tool: 'circle';
  center: DocPoint;
  /** Radius as a fraction of the shorter page edge. */
  radius: number;
}

export interface DocText extends DocBase {
  tool: 'text';
  position: DocPoint;
  text: string;
  /** Size as a fraction of the shorter page edge. */
  fontSize: number;
}

export type DocAnnotation = DocPen | DocArrow | DocRect | DocCircle | DocText;

let seq = 0;
function nextAnnotationId(): string {
  seq += 1;
  return `n_${Date.now().toString(36)}_${seq.toString(36)}`;
}

let opSeq = 0;
/** Unique operation id — the key that makes undo idempotent on every peer. */
export function nextOpId(): string {
  opSeq += 1;
  return `o_${Date.now().toString(36)}_${opSeq.toString(36)}`;
}

/** Fields a live patch may carry. Everything else is fixed at creation. */
export interface DocPatch {
  /** New pen points, appended in order (a stroke grows; it is never rewritten). */
  append?: DocPoint[];
  /** Marks a pen stroke or arrow as finished. */
  done?: boolean;
  /** Arrow end point while dragging. */
  end?: DocPoint;
  /** Rectangle extents while dragging (already normalised by the caller). */
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** Circle radius while dragging. */
  radius?: number;
  /** Final text, when a text mark is committed. */
  text?: string;
}

export function createDocAnnotation(
  tool: DocTool,
  author: string,
  page: number,
  init: {
    point?: DocPoint;
    color?: string;
    width?: number;
    text?: string;
  } = {},
): DocAnnotation {
  const base = {
    id: nextAnnotationId(),
    author,
    page,
    color: init.color ?? DOC_COLOR,
    width: init.width ?? DOC_WIDTH,
    createdAt: Date.now(),
  };
  const p: DocPoint = init.point ?? [0.5, 0.5];
  switch (tool) {
    case 'pen':
      return { ...base, tool, points: [p], done: false };
    case 'arrow':
      return { ...base, tool, start: p, end: p, done: false };
    case 'rect':
      return { ...base, tool, x: p[0], y: p[1], w: 0, h: 0 };
    case 'circle':
      return { ...base, tool, center: p, radius: 0 };
    case 'text':
      return {
        ...base,
        tool,
        position: p,
        text: (init.text ?? '').slice(0, DOC_ANNOTATION_LIMITS.textLength),
        fontSize: DOC_FONT,
      };
  }
}

/** Geometry for a drag, normalised so width/height are always positive. */
export function rectFromDrag(
  from: DocPoint,
  to: DocPoint,
): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.min(from[0], to[0]),
    y: Math.min(from[1], to[1]),
    w: Math.abs(to[0] - from[0]),
    h: Math.abs(to[1] - from[1]),
  };
}

/** Radius from a centre to the current pointer, as a fraction of the short edge. */
export function radiusFromDrag(center: DocPoint, to: DocPoint, page: { width: number; height: number }): number {
  const unit = Math.min(page.width, page.height) || 1;
  const dx = (to[0] - center[0]) * page.width;
  const dy = (to[1] - center[1]) * page.height;
  return Math.hypot(dx, dy) / unit;
}

/* ────────────────────────────── operations ────────────────────────────── */

export type DocOpType = 'add' | 'patch' | 'delete' | 'clear-page';

interface DocOpBase {
  /** Unique operation id: the same op applied twice is a no-op. */
  opId: string;
  /** Scopes the op to one document; ops for another document are ignored. */
  docId: string;
  author: string;
  ts: number;
}

export interface DocAddOp extends DocOpBase {
  type: 'add';
  page: number;
  annotation: DocAnnotation;
}
export interface DocPatchOp extends DocOpBase {
  type: 'patch';
  page: number;
  id: string;
  patch: DocPatch;
}
export interface DocDeleteOp extends DocOpBase {
  type: 'delete';
  page: number;
  id: string;
}
export interface DocClearPageOp extends DocOpBase {
  type: 'clear-page';
  page: number;
}

export type DocOp = DocAddOp | DocPatchOp | DocDeleteOp | DocClearPageOp;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: unknown, min = -0.25, max = 1.25): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

function point(value: unknown): DocPoint | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const x = finite(value[0]);
  const y = finite(value[1]);
  return x === null || y === null ? null : [x, y];
}

const HEX_COLOR = /^#[0-9a-f]{3,8}$/i;

/**
 * Validates a single annotation from an inbound op.
 *
 * Structural only — every number must be finite and inside a sane window, every
 * string capped, and the page forced inside the real page count, so a peer
 * cannot inject an annotation that makes the renderer draw or allocate something
 * absurd.
 */
export function parseDocAnnotation(raw: unknown, pageCount: number): DocAnnotation | null {
  if (!isRecord(raw)) return null;
  const tool = raw.tool;
  if (
    tool !== 'pen' &&
    tool !== 'arrow' &&
    tool !== 'rect' &&
    tool !== 'circle' &&
    tool !== 'text'
  ) {
    return null;
  }
  if (typeof raw.id !== 'string' || !raw.id || raw.id.length > 64) return null;
  if (typeof raw.author !== 'string' || !raw.author || raw.author.length > 64) return null;
  const page = finite(raw.page, 1, Math.max(1, pageCount));
  if (page === null || !Number.isInteger(page)) return null;
  const color = typeof raw.color === 'string' && HEX_COLOR.test(raw.color) ? raw.color : DOC_COLOR;
  const width = finite(raw.width, 0.0005, 0.2) ?? DOC_WIDTH;
  const createdAt =
    typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt)
      ? raw.createdAt
      : Date.now();
  const base = { id: raw.id, author: raw.author, page, color, width, createdAt };

  if (tool === 'pen') {
    if (!Array.isArray(raw.points)) return null;
    const points: DocPoint[] = [];
    for (const p of raw.points.slice(0, DOC_ANNOTATION_LIMITS.pointsPerStroke)) {
      const parsed = point(p);
      if (parsed) points.push(parsed);
    }
    if (points.length === 0) return null;
    return { ...base, tool, points, done: raw.done !== false };
  }
  if (tool === 'arrow') {
    const start = point(raw.start);
    const end = point(raw.end);
    if (!start || !end) return null;
    return { ...base, tool, start, end, done: raw.done !== false };
  }
  if (tool === 'rect') {
    const x = finite(raw.x);
    const y = finite(raw.y);
    const w = finite(raw.w, 0, 4);
    const h = finite(raw.h, 0, 4);
    if (x === null || y === null || w === null || h === null) return null;
    return { ...base, tool, x, y, w, h };
  }
  if (tool === 'circle') {
    const center = point(raw.center);
    const radius = finite(raw.radius, 0, 2);
    if (!center || radius === null) return null;
    return { ...base, tool, center, radius };
  }
  const position = point(raw.position);
  if (!position) return null;
  return {
    ...base,
    tool: 'text',
    position,
    text:
      typeof raw.text === 'string'
        ? raw.text.slice(0, DOC_ANNOTATION_LIMITS.textLength)
        : '',
    fontSize: finite(raw.fontSize, 0.002, 0.5) ?? DOC_FONT,
  };
}

/** Validates a patch body. Unknown keys are dropped rather than forwarded. */
export function parseDocPatch(raw: unknown): DocPatch | null {
  if (!isRecord(raw)) return null;
  const patch: DocPatch = {};
  let touched = false;

  if (Array.isArray(raw.append)) {
    const append: DocPoint[] = [];
    for (const p of raw.append.slice(0, DOC_ANNOTATION_LIMITS.patchAppendPoints)) {
      const parsed = point(p);
      if (parsed) append.push(parsed);
    }
    if (append.length > 0) {
      patch.append = append;
      touched = true;
    }
  }
  if (raw.done === true) {
    patch.done = true;
    touched = true;
  }
  const end = raw.end === undefined ? null : point(raw.end);
  if (end) {
    patch.end = end;
    touched = true;
  }
  const x = raw.x === undefined ? null : finite(raw.x);
  const y = raw.y === undefined ? null : finite(raw.y);
  const w = raw.w === undefined ? null : finite(raw.w, 0, 4);
  const h = raw.h === undefined ? null : finite(raw.h, 0, 4);
  if (x !== null && y !== null && w !== null && h !== null) {
    patch.x = x;
    patch.y = y;
    patch.w = w;
    patch.h = h;
    touched = true;
  }
  const radius = raw.radius === undefined ? null : finite(raw.radius, 0, 2);
  if (radius !== null) {
    patch.radius = radius;
    touched = true;
  }
  if (typeof raw.text === 'string') {
    patch.text = raw.text.slice(0, DOC_ANNOTATION_LIMITS.textLength);
    touched = true;
  }
  return touched ? patch : null;
}

/**
 * Validates a whole inbound operation, including its document scope.
 *
 * An op for a different document — or one whose page does not exist in this
 * document — is rejected here, which is the first of the two guards against a
 * previous document's marks leaking onto a replacement (the second is the
 * `docId` check the caller performs against the *active* document).
 */
export function parseDocOp(raw: unknown, docId: string, pageCount: number): DocOp | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.docId !== 'string' || raw.docId !== docId) return null;
  if (typeof raw.opId !== 'string' || !raw.opId || raw.opId.length > 64) return null;
  if (typeof raw.author !== 'string' || !raw.author || raw.author.length > 64) return null;
  const ts = typeof raw.ts === 'number' && Number.isFinite(raw.ts) ? raw.ts : Date.now();
  const type = raw.type;
  const page = finite(raw.page, 1, Math.max(1, pageCount));
  if (page === null || !Number.isInteger(page)) return null;

  if (type === 'add') {
    const annotation = parseDocAnnotation(raw.annotation, pageCount);
    if (!annotation || annotation.page !== page) return null;
    return { opId: raw.opId, docId, author: raw.author, ts, type, page, annotation };
  }
  if (type === 'patch') {
    if (typeof raw.id !== 'string' || !raw.id || raw.id.length > 64) return null;
    const patch = parseDocPatch(raw.patch);
    if (!patch) return null;
    return { opId: raw.opId, docId, author: raw.author, ts, type, page, id: raw.id, patch };
  }
  if (type === 'delete') {
    if (typeof raw.id !== 'string' || !raw.id || raw.id.length > 64) return null;
    return { opId: raw.opId, docId, author: raw.author, ts, type, page, id: raw.id };
  }
  if (type === 'clear-page') {
    return { opId: raw.opId, docId, author: raw.author, ts, type, page };
  }
  return null;
}

/* ────────────────────────────── reducer ────────────────────────────── */

/** Applies one patch to one annotation. Never mutates the input object. */
export function applyDocPatch(annotation: DocAnnotation, patch: DocPatch): DocAnnotation {
  if (annotation.tool === 'pen') {
    const appended = patch.append?.length ? patch.append : null;
    const points = appended
      ? [...annotation.points, ...appended].slice(0, DOC_ANNOTATION_LIMITS.pointsPerStroke)
      : annotation.points;
    return {
      ...annotation,
      points,
      done: patch.done === true ? true : annotation.done,
    };
  }
  if (annotation.tool === 'arrow') {
    return {
      ...annotation,
      end: patch.end ?? annotation.end,
      done: patch.done === true ? true : annotation.done,
    };
  }
  if (annotation.tool === 'rect') {
    return {
      ...annotation,
      x: patch.x ?? annotation.x,
      y: patch.y ?? annotation.y,
      w: patch.w ?? annotation.w,
      h: patch.h ?? annotation.h,
    };
  }
  if (annotation.tool === 'circle') {
    return { ...annotation, radius: patch.radius ?? annotation.radius };
  }
  return { ...annotation, text: patch.text ?? annotation.text };
}

/**
 * The single reducer every participant runs.
 *
 * Idempotent by construction: a duplicated `add` (same annotation id) or a
 * `patch`/`delete` for something already gone is a no-op, so a re-delivered or
 * out-of-order frame cannot duplicate or resurrect a mark.
 */
export function applyDocOp(list: DocAnnotation[], op: DocOp): DocAnnotation[] {
  switch (op.type) {
    case 'add': {
      if (list.some((a) => a.id === op.annotation.id)) return list;
      const onPage = list.reduce((n, a) => (a.page === op.annotation.page ? n + 1 : n), 0);
      if (onPage >= DOC_ANNOTATION_LIMITS.annotationsPerPage) return list;
      if (list.length >= DOC_ANNOTATION_LIMITS.annotationsTotal) return list;
      return [...list, op.annotation];
    }
    case 'patch': {
      let changed = false;
      const next = list.map((a) => {
        if (a.id !== op.id) return a;
        changed = true;
        return applyDocPatch(a, op.patch);
      });
      return changed ? next : list;
    }
    case 'delete': {
      const next = list.filter((a) => a.id !== op.id);
      return next.length === list.length ? list : next;
    }
    case 'clear-page': {
      const next = list.filter((a) => a.page !== op.page);
      return next.length === list.length ? list : next;
    }
  }
}

export function annotationsForPage(list: DocAnnotation[], page: number): DocAnnotation[] {
  return list.filter((a) => a.page === page);
}

/* ────────────────────────────── hit-testing ────────────────────────────── */

function distanceToSegment(p: DocPoint, a: DocPoint, b: DocPoint, page: { width: number; height: number }): number {
  // Work in page units so a hit tolerance expressed in page units is uniform.
  const px = p[0] * page.width;
  const py = p[1] * page.height;
  const ax = a[0] * page.width;
  const ay = a[1] * page.height;
  const bx = b[0] * page.width;
  const by = b[1] * page.height;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * The topmost annotation within `tolerance` of a point, or null.
 *
 * Used by the eraser: the *object* is removed, never the pixels underneath it,
 * and the original document is never touched. Tolerance arrives already
 * converted into page units by the caller (so it stays a constant number of
 * screen pixels at any zoom).
 */
export function hitTest(
  list: DocAnnotation[],
  page: number,
  at: DocPoint,
  tolerance: number,
  pageSize: { width: number; height: number },
): DocAnnotation | null {
  const unit = Math.min(pageSize.width, pageSize.height) || 1;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const a = list[i];
    if (a.page !== page) continue;
    const reach = tolerance + (a.tool === 'text' ? 0 : (a.width * unit) / 2);
    if (a.tool === 'pen') {
      if (a.points.length === 1) {
        if (distanceToSegment(at, a.points[0], a.points[0], pageSize) <= reach) return a;
        continue;
      }
      for (let j = 1; j < a.points.length; j += 1) {
        if (distanceToSegment(at, a.points[j - 1], a.points[j], pageSize) <= reach) return a;
      }
      continue;
    }
    if (a.tool === 'arrow') {
      if (distanceToSegment(at, a.start, a.end, pageSize) <= reach) return a;
      continue;
    }
    if (a.tool === 'rect') {
      const corners: DocPoint[] = [
        [a.x, a.y],
        [a.x + a.w, a.y],
        [a.x + a.w, a.y + a.h],
        [a.x, a.y + a.h],
      ];
      for (let j = 0; j < 4; j += 1) {
        if (distanceToSegment(at, corners[j], corners[(j + 1) % 4], pageSize) <= reach) return a;
      }
      continue;
    }
    if (a.tool === 'circle') {
      const r = a.radius * unit;
      const dx = (at[0] - a.center[0]) * pageSize.width;
      const dy = (at[1] - a.center[1]) * pageSize.height;
      if (Math.abs(Math.hypot(dx, dy) - r) <= reach) return a;
      continue;
    }
    // Text: an approximate box around the label, measured from its baseline.
    const size = a.fontSize * unit;
    const boxWidth = Math.max(size, a.text.length * size * 0.55);
    const dx = (at[0] - a.position[0]) * pageSize.width;
    const dy = (at[1] - a.position[1]) * pageSize.height;
    if (dx >= -size && dx <= boxWidth + size && dy >= -size && dy <= size * 0.5) return a;
  }
  return null;
}