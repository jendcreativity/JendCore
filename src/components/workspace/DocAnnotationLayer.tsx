/**
 * Document annotation layer.
 *
 * Marks are **stored** in document space (normalised `[0, 1]`) and **painted**
 * in container space (CSS px), converting through `documentView` — the single
 * module allowed to relate the two. That is why a mark stays glued to the same
 * spot on the page through zoom, pan, resize and on another participant's very
 * different screen.
 *
 * Stroke weights, radii and font sizes are stored as a fraction of the page's
 * shorter edge, so they scale with the document rather than the viewport: a
 * stroke drawn at 100 % and the same stroke seen at 250 % are the same mark, not
 * a thicker one.
 *
 * The eraser removes whole *objects* by hit-testing stored geometry. It never
 * touches the document underneath, and the removal is undoable because the
 * hook keeps the removed mark as the inverse operation.
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  DOC_ANNOTATION_LIMITS,
  createDocAnnotation,
  radiusFromDrag,
  rectFromDrag,
  type DocAnnotation,
  type DocTool,
} from '../../lib/docAnnotations';
import {
  docToScreen,
  screenToDoc,
  type ContainerPoint,
  type ContainerSize,
  type ContentSize,
  type DocPoint,
  type ViewState,
} from '../../lib/documentView';

/** Every pointer tool the layer understands; `erase` is a tool, not a mode. */
export type DocPointerTool = DocTool | 'erase';

/** Eraser reach in CSS px — constant on screen at any zoom. */
const ERASER_PX = 14;

/** Minimum pointer travel (CSS px) before another eraser hit-test runs. */
const ERASE_STEP_PX = 6;

interface Props {
  /** Page size in content units (image pixels or PDF page units). */
  content: ContentSize;
  /** Viewer box in CSS px. */
  container: ContainerSize;
  /** Display transform for the current page. */
  view: ViewState;
  /** 1-based page currently displayed. */
  page: number;
  /** All annotations for the document; filtered to `page` here. */
  annotations: DocAnnotation[];
  /** Ink for new marks, chosen in the toolbar; fixed once a mark exists. */
  color: string;
  tool: DocPointerTool | null;
  selfId: string;
  onAdd: (annotation: DocAnnotation) => void;
  onPatch: (id: string, page: number, patch: Record<string, unknown>) => void;
  onFinish: (id: string, page: number, patch: Record<string, unknown>) => void;
  onErase: (page: number, point: DocPoint, tolerance: number, pageSize: ContentSize) => boolean;
}

/** Screen-space metrics derived once per render for one page size. */
interface Metrics {
  unit: number;
  scale: number;
}

function metricsOf(content: ContentSize, view: ViewState): Metrics {
  return { unit: Math.min(content.width, content.height) || 1, scale: view.scale };
}

/** Pen stroke as an SVG path in container space. */
function penPath(points: DocPoint[], view: ViewState, content: ContentSize): string {
  if (points.length === 0) return '';
  let d = '';
  for (let i = 0; i < points.length; i += 1) {
    const p = docToScreen(view, content, points[i]);
    d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    if (i < points.length - 1) d += ' ';
  }
  return d;
}

/** One stored mark, painted. Memoised: panning a page must not re-walk paths. */
const Mark = memo(function Mark({
  annotation: a,
  view,
  content,
}: {
  annotation: DocAnnotation;
  view: ViewState;
  content: ContentSize;
}) {
  const { unit, scale } = metricsOf(content, view);
  const stroke = Math.max(1, a.width * unit * scale);

  if (a.tool === 'pen') {
    // A tap is a legitimate one-point stroke: render it as a dot rather than
    // an invisible zero-length path.
    if (a.points.length === 1) {
      const dot = docToScreen(view, content, a.points[0]);
      return <circle cx={dot.x} cy={dot.y} r={stroke / 2} fill={a.color} stroke="none" />;
    }
    return (
      <path
        d={penPath(a.points, view, content)}
        fill="none"
        stroke={a.color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  if (a.tool === 'arrow') {
    const from = docToScreen(view, content, a.start);
    const to = docToScreen(view, content, a.end);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const head = Math.max(7, stroke * 3.2);
    const spread = Math.PI / 7;
    const p1 = {
      x: to.x - head * Math.cos(angle - spread),
      y: to.y - head * Math.sin(angle - spread),
    };
    const p2 = {
      x: to.x - head * Math.cos(angle + spread),
      y: to.y - head * Math.sin(angle + spread),
    };
    return (
      <g stroke={a.color} fill={a.color} strokeWidth={stroke} strokeLinecap="round">
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
        <polygon
          points={`${to.x},${to.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`}
          stroke="none"
        />
      </g>
    );
  }

  if (a.tool === 'rect') {
    const tl = docToScreen(view, content, [a.x, a.y]);
    return (
      <rect
        x={tl.x}
        y={tl.y}
        width={a.w * content.width * scale}
        height={a.h * content.height * scale}
        fill="none"
        stroke={a.color}
        strokeWidth={stroke}
      />
    );
  }

  if (a.tool === 'circle') {
    const c = docToScreen(view, content, a.center);
    return (
      <circle
        cx={c.x}
        cy={c.y}
        r={a.radius * unit * scale}
        fill="none"
        stroke={a.color}
        strokeWidth={stroke}
      />
    );
  }

  const at = docToScreen(view, content, a.position);
  return (
    <text
      x={at.x}
      y={at.y}
      fill={a.color}
      fontSize={Math.max(9, a.fontSize * unit * scale)}
      fontFamily="Inter, system-ui, sans-serif"
      fontWeight={600}
    >
      {a.text}
    </text>
  );
});

/** The committed marks for the current page. */
const Committed = memo(function Committed({
  annotations,
  page,
  view,
  content,
}: {
  annotations: DocAnnotation[];
  page: number;
  view: ViewState;
  content: ContentSize;
}) {
  return (
    <g>
      {annotations.map((a) =>
        a.page === page ? <Mark key={a.id} annotation={a} view={view} content={content} /> : null,
      )}
    </g>
  );
});

/** The live patch a shape needs in order to match `live` exactly. */
function patchFor(a: DocAnnotation): Record<string, unknown> {
  if (a.tool === 'arrow') return { end: a.end };
  if (a.tool === 'rect') return { x: a.x, y: a.y, w: a.w, h: a.h };
  if (a.tool === 'circle') return { radius: a.radius };
  return {};
}

export default function DocAnnotationLayer({
  content,
  container,
  view,
  page,
  annotations,
  color,
  tool,
  selfId,
  onAdd,
  onPatch,
  onFinish,
  onErase,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /** The annotation being drawn, and the geometry already broadcast for it. */
  const dragRef = useRef<{ id: string; tool: DocTool } | null>(null);
  const liveRef = useRef<DocAnnotation | null>(null);
  /** Pen points in order; `sentCountRef` marks how many are already on the wire. */
  const pointsRef = useRef<DocPoint[]>([]);
  const sentCountRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const erasingRef = useRef(false);
  const lastEraseRef = useRef<ContainerPoint | null>(null);

  /** Locally previewed geometry — instant feedback, independent of the wire. */
  const [live, setLive] = useState<DocAnnotation | null>(null);
  const [textAt, setTextAt] = useState<{ uv: DocPoint; screen: ContainerPoint } | null>(null);
  const [text, setText] = useState('');

  const toLocal = useCallback((e: { clientX: number; clientY: number }): ContainerPoint | null => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return null;
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  }, []);

  /**
   * Coalesces geometry into one patch per animation frame. Without this a fast
   * stroke would queue hundreds of patches per second; the hook then merges them
   * again on a 90 ms cadence before anything reaches the peer.
   */
  const schedulePatch = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const drag = dragRef.current;
      const current = liveRef.current;
      if (!drag || !current) return;
      if (current.tool === 'pen') {
        const from = sentCountRef.current;
        if (pointsRef.current.length <= from) return;
        const batch = pointsRef.current.slice(from);
        sentCountRef.current = pointsRef.current.length;
        onPatch(drag.id, page, { append: batch });
        return;
      }
      onPatch(drag.id, page, patchFor(current));
    });
  }, [onPatch, page]);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (!tool) return;
      const local = toLocal(e);
      if (!local) return;
      const uv = screenToDoc(view, content, local);
      if (!uv) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety; dragging still works without it */
      }

      if (tool === 'erase') {
        erasingRef.current = true;
        lastEraseRef.current = local;
        // Tolerance is in page units, so the eraser keeps the same size on
        // screen whatever the zoom.
        onErase(page, uv, ERASER_PX / view.scale, content);
        return;
      }

      if (tool === 'text') {
        setTextAt({ uv, screen: local });
        setText('');
        return;
      }

      const created = createDocAnnotation(tool, selfId, page, { point: uv, color });
      dragRef.current = { id: created.id, tool };
      liveRef.current = created;
      pointsRef.current = created.tool === 'pen' ? [uv] : [];
      sentCountRef.current = 0;
      setLive(created);
      onAdd(created);
    },
    [color, content, onAdd, onErase, page, selfId, toLocal, tool, view],
  );
  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const local = toLocal(e);
      if (!local) return;

      if (erasingRef.current) {
        const last = lastEraseRef.current;
        // Sample the path instead of hit-testing every event: erasing is a
        // gesture, and a sub-pixel step cannot reach a new mark.
        if (last && Math.hypot(local.x - last.x, local.y - last.y) < ERASE_STEP_PX) return;
        lastEraseRef.current = local;
        const uv = screenToDoc(view, content, local);
        if (uv) onErase(page, uv, ERASER_PX / view.scale, content);
        return;
      }

      const drag = dragRef.current;
      const current = liveRef.current;
      if (!drag || !current) return;
      const uv = screenToDoc(view, content, local);
      if (!uv) return;

      if (current.tool === 'pen') {
        const pts = pointsRef.current;
        const last = pts[pts.length - 1];
        // Drop points that land on the same screen pixel: they add nothing to
        // the path but do add to every peer's memory.
        if (last) {
          const dx = (uv[0] - last[0]) * content.width;
          const dy = (uv[1] - last[1]) * content.height;
          if (Math.hypot(dx, dy) * view.scale < 1) return;
        }
        if (pts.length >= DOC_ANNOTATION_LIMITS.pointsPerStroke) return;
        pts.push(uv);
        liveRef.current = { ...current, points: pts };
      } else if (current.tool === 'arrow') {
        liveRef.current = { ...current, end: uv };
      } else if (current.tool === 'rect') {
        liveRef.current = { ...current, ...rectFromDrag([current.x, current.y], uv) };
      } else if (current.tool === 'circle') {
        liveRef.current = { ...current, radius: radiusFromDrag(current.center, uv, content) };
      } else {
        return;
      }
      setLive(liveRef.current);
      schedulePatch();
    },
    [content, onErase, page, schedulePatch, toLocal, view],
  );

  const endDrag = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* already released */
      }
      erasingRef.current = false;
      lastEraseRef.current = null;

      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      const drag = dragRef.current;
      const current = liveRef.current;
      dragRef.current = null;
      liveRef.current = null;
      setLive(null);
      if (!drag || !current) return;

      if (current.tool === 'pen') {
        const from = sentCountRef.current;
        const finalPatch =
          pointsRef.current.length > from ? { append: pointsRef.current.slice(from) } : {};
        pointsRef.current = [];
        sentCountRef.current = 0;
        onFinish(drag.id, page, finalPatch);
        return;
      }
      onFinish(drag.id, page, patchFor(current));
    },
    [onFinish, page],
  );
  /** Escape must cancel without the blur handler committing the old text. */
  const cancelTextRef = useRef(false);

  useEffect(() => {
    if (textAt) inputRef.current?.focus();
  }, [textAt]);

  const commitText = useCallback(() => {
    if (cancelTextRef.current) {
      cancelTextRef.current = false;
      return;
    }
    const at = textAt;
    const value = text.trim();
    setTextAt(null);
    setText('');
    if (!at || !value) return;
    onAdd(createDocAnnotation('text', selfId, page, { point: at.uv, text: value, color }));
  }, [color, onAdd, page, selfId, text, textAt]);

  // Nothing to paint into yet (first layout pass, or a collapsed panel).
  if (container.width <= 0 || container.height <= 0) return null;

  return (
    <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full touch-none"
        viewBox={`0 0 ${container.width} ${container.height}`}
        style={{
          pointerEvents: tool ? 'auto' : 'none',
          cursor: tool === 'text' ? 'text' : 'crosshair',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <Committed annotations={annotations} page={page} view={view} content={content} />
        {live ? <Mark annotation={live} view={view} content={content} /> : null}
      </svg>
      {textAt ? (
        <form
          className="absolute z-10"
          style={{ left: textAt.screen.x, top: textAt.screen.y, pointerEvents: 'auto' }}
          onSubmit={(e) => {
            e.preventDefault();
            commitText();
          }}
        >
          <input
            ref={inputRef}
            value={text}
            maxLength={DOC_ANNOTATION_LIMITS.textLength}
            onChange={(e) => setText(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              cancelTextRef.current = true;
              setTextAt(null);
              setText('');
            }}
            placeholder="Type, then Enter"
            aria-label="Annotation text"
            className="min-w-[9rem] -translate-y-[1.1em] rounded border border-dashed border-red-400 bg-graphite-900/90 px-2 py-1 text-sm font-semibold text-red-400 outline-none placeholder:text-titanium-400"
          />
        </form>
      ) : null}
    </div>
  );
}



