/**
 * Document view geometry.
 *
 * Pure math — no DOM, no React — so every invariant the annotation layer
 * depends on can be checked directly (see `scripts/verify-doc-coords.ts`).
 *
 * Coordinate spaces
 * -----------------
 * - **container space**: CSS pixels, origin at the top-left of the viewer box.
 * - **content space**: the document's own units — intrinsic image pixels for an
 *   image, PDF page units from `getViewport({ scale: 1 })` for a PDF page.
 *   Zoom and pan never change this space.
 * - **document space**: normalised `[0, 1]` against the content box, `(0, 0)`
 *   top-left, `(1, 1)` bottom-right.
 *
 * **Annotations are stored in document space and only in document space.** The
 * viewport may change freely (zoom, pan, letterbox, resize, device pixel ratio,
 * another participant's screen) without ever rewriting a stored coordinate.
 * That is the point of this module: the document defines the coordinate system;
 * the view only decides how it is displayed.
 *
 * The three spaces are related by exactly one affine transform:
 *
 *     container = contentOrigin + document * contentSize * scale
 *
 * and the document and its annotation layer are both rendered under that same
 * transform, so geometry can never drift between the two.
 */

/** Intrinsic size of the content (image pixels, or PDF page units). */
export interface ContentSize {
  width: number;
  height: number;
}

/** Size of the viewer box, in CSS pixels. */
export interface ContainerSize {
  width: number;
  height: number;
}

/** A point in container space (CSS px, relative to the viewer box). */
export interface ContainerPoint {
  x: number;
  y: number;
}

/** Displayed rectangle of the content, in container space. */
export interface ContentRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The display transform. `scale` is CSS px per content unit. */
export interface ViewState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** A point in document space: normalised `[0, 1]` against the content box. */
export type DocPoint = [number, number];

/** Hard floor so a degenerate scale can never divide by ~0. */
export const MIN_ABS_SCALE = 0.02;
/** Most zoomed in we ever allow, in CSS px per content unit. */
export const MAX_ABS_SCALE = 16;
/** How far below fit-to-view the user may zoom out. */
export const MIN_ZOOM_OF_FIT = 0.2;
/** How far above fit-to-view the user may zoom in. */
export const MAX_ZOOM_OF_FIT = 12;

/** Touch-friendly zoom step for the +/- keys (a deliberate, readable ratio). */
export const ZOOM_STEP = 1.25;

function isPositive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

/** True when both boxes are measurable; callers use this to skip layout math. */
export function isViewable(
  content: ContentSize | null,
  container: ContainerSize | null,
): boolean {
  return (
    !!content &&
    !!container &&
    isPositive(content.width) &&
    isPositive(content.height) &&
    isPositive(container.width) &&
    isPositive(container.height)
  );
}

/**
 * The scale that fits the whole document inside the viewer box (contain-fit,
 * i.e. letterboxed rather than cropped): `min(cw / iw, ch / ih)`.
 */
export function fitScale(content: ContentSize, container: ContainerSize): number {
  if (!isViewable(content, container)) return 1;
  return Math.min(container.width / content.width, container.height / content.height);
}

/** Bounds for `scale` — derived from fit, so every document stays usable. */
export function scaleBounds(
  content: ContentSize,
  container: ContainerSize,
): { min: number; max: number } {
  const fit = fitScale(content, container);
  return {
    min: Math.max(MIN_ABS_SCALE, fit * MIN_ZOOM_OF_FIT),
    max: Math.max(MIN_ABS_SCALE, Math.min(MAX_ABS_SCALE, Math.max(fit * MAX_ZOOM_OF_FIT, 1))),
  };
}

export function clampScale(scale: number, content: ContentSize, container: ContainerSize): number {
  const { min, max } = scaleBounds(content, container);
  if (!Number.isFinite(scale)) return min;
  return Math.min(max, Math.max(min, scale));
}

/**
 * Keeps the content glued to the viewer: each axis is centred when the content
 * is smaller than the box, otherwise the offset is clamped so an edge can never
 * be dragged inside the box (no endless empty panning).
 */
export function clampOffset(
  view: ViewState,
  content: ContentSize,
  container: ContainerSize,
): ViewState {
  if (!isViewable(content, container)) return { ...view, offsetX: 0, offsetY: 0 };
  const w = content.width * view.scale;
  const h = content.height * view.scale;
  const offsetX =
    w <= container.width ? (container.width - w) / 2 : Math.min(0, Math.max(container.width - w, view.offsetX));
  const offsetY =
    h <= container.height ? (container.height - h) / 2 : Math.min(0, Math.max(container.height - h, view.offsetY));
  return { scale: view.scale, offsetX, offsetY };
}

/** Displayed content rectangle in container space. */
export function contentRect(view: ViewState, content: ContentSize): ContentRect {
  return {
    x: view.offsetX,
    y: view.offsetY,
    width: content.width * view.scale,
    height: content.height * view.scale,
  };
}

/** Fit-to-view, centred. The starting point for every document. */
export function fitView(content: ContentSize, container: ContainerSize): ViewState {
  if (!isViewable(content, container)) return { scale: 1, offsetX: 0, offsetY: 0 };
  return clampOffset(
    { scale: fitScale(content, container), offsetX: 0, offsetY: 0 },
    content,
    container,
  );
}

/** Reset to actual size (one CSS px per content unit), centred. */
export function actualSizeView(content: ContentSize, container: ContainerSize): ViewState {
  const scale = clampScale(1, content, container);
  return clampOffset({ scale, offsetX: 0, offsetY: 0 }, content, container);
}

/**
 * Container space -> document space.
 *
 * Raw normalised coordinates are returned (values outside `[0, 1]` are
 * meaningful — a stroke may legitimately end just past the page edge), or
 * `null` when there is no transform to invert.
 */
export function screenToDoc(
  view: ViewState,
  content: ContentSize,
  point: ContainerPoint,
): DocPoint | null {
  const rect = contentRect(view, content);
  if (!isPositive(rect.width) || !isPositive(rect.height)) return null;
  return [(point.x - rect.x) / rect.width, (point.y - rect.y) / rect.height];
}

/** Document space -> container space (CSS px relative to the viewer box). */
export function docToScreen(
  view: ViewState,
  content: ContentSize,
  uv: DocPoint,
): ContainerPoint {
  const rect = contentRect(view, content);
  return { x: rect.x + uv[0] * rect.width, y: rect.y + uv[1] * rect.height };
}

/** Clamps into `[0, 1]` — used when a pointer must land *on* the document. */
export function clampDocPoint(uv: DocPoint): DocPoint {
  return [Math.min(1, Math.max(0, uv[0])), Math.min(1, Math.max(0, uv[1]))];
}

/** True when a document point falls inside the content box. */
export function isInsideDoc(uv: DocPoint): boolean {
  return uv[0] >= 0 && uv[0] <= 1 && uv[1] >= 0 && uv[1] <= 1;
}

/** Pans by a delta in CSS px (drag). */
export function panBy(
  view: ViewState,
  dx: number,
  dy: number,
  content: ContentSize,
  container: ContainerSize,
): ViewState {
  return clampOffset(
    { scale: view.scale, offsetX: view.offsetX + dx, offsetY: view.offsetY + dy },
    content,
    container,
  );
}

/**
 * Zooms about an anchor in container space, keeping the document point under
 * that anchor exactly where it was (pinch centre / cursor position). Zooming
 * therefore always moves *towards the anchor*, never towards a fixed corner.
 */
export function zoomAt(
  view: ViewState,
  content: ContentSize,
  container: ContainerSize,
  factor: number,
  anchor: ContainerPoint,
): ViewState {
  const nextScale = clampScale(view.scale * factor, content, container);
  if (nextScale === view.scale) return clampOffset(view, content, container);
  const ratio = nextScale / view.scale;
  const offsetX = anchor.x - (anchor.x - view.offsetX) * ratio;
  const offsetY = anchor.y - (anchor.y - view.offsetY) * ratio;
  return clampOffset({ scale: nextScale, offsetX, offsetY }, content, container);
}

/** Zooms about the centre of the viewer (keyboard / button zoom). */
export function zoomAtCenter(
  view: ViewState,
  content: ContentSize,
  container: ContainerSize,
  factor: number,
): ViewState {
  return zoomAt(view, content, container, factor, {
    x: container.width / 2,
    y: container.height / 2,
  });
}

/**
 * Zoom level for display. **100% means actual size** (one CSS pixel per content
 * unit), matching how image and PDF viewers report zoom; fit-to-view is
 * therefore whatever that document happens to need.
 */
export function zoomPercent(view: ViewState): number {
  return Math.round(view.scale * 100);
}

/** True when the view is unchanged from fit-to-view (within rounding). */
export function isAtFit(
  view: ViewState,
  content: ContentSize,
  container: ContainerSize,
): boolean {
  if (!isViewable(content, container)) return true;
  const fit = fitView(content, container);
  const eps = 0.0005;
  return (
    Math.abs(view.scale - fit.scale) < eps &&
    Math.abs(view.offsetX - fit.offsetX) < eps &&
    Math.abs(view.offsetY - fit.offsetY) < eps
  );
}

/**
 * Wheel delta -> zoom factor. A trackpad pinch arrives as a wheel event with
 * `ctrlKey` set and needs a gentler curve than a mouse wheel notch.
 */
export function wheelZoomFactor(deltaY: number, ctrlKey: boolean): number {
  const clamped = Math.max(-240, Math.min(240, deltaY));
  const strength = ctrlKey ? 0.008 : 0.0022;
  return Math.exp(-clamped * strength);
}