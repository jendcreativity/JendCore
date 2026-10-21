import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from 'react';
import { useEffect, useRef, useState } from 'react';
import { IconResize } from '../Icon';

/**
 * Floating corner tile — the Stage's PiP slot, made draggable and resizable.
 *
 * Additive by design: while there is no explicit placement, the wrapper renders
 * with the exact anchor/size classes the corner PiP always had, so the resting
 * layout is untouched. The first grab freezes those CSS values into px (no
 * jump); after that the tile is an absolute overlay that is always clamped
 * inside the stage box — never off-screen, never over the bottom control bar,
 * never slipping under the floating top bar.
 *
 * Gestures are pointer events captured on the tile itself. The AnnotationCanvas
 * below binds its handlers to its own <svg> (and stays pointer-inert unless a
 * tool is armed), and captured moves retarget to this tile, so dragging the
 * video can never leave a mark on the canvas.
 *
 * Placement is held in memory for the lifetime of the mounted session only: it
 * is never written to storage, so a reload or a new session starts from the
 * resting corner again. Clamping keeps any placement valid across rotation and
 * window resizes, and — as with Meet's PiP — the other participant keeps their
 * own placement.
 */
/*
 * Mobile: the tile clears the control bar's quiet row. That row ends at 148px
 * on narrow phones and 156px from 380px up, so 168px leaves a real gap instead
 * of the overlap the old 88px inset produced. Desktop keeps it top-right, where
 * the bar is nowhere near it.
 */
const DEFAULT_ANCHOR = 'bottom-[168px] right-3 sm:bottom-auto sm:right-4 sm:top-[64px]';
const DEFAULT_SIZE = 'w-[104px] min-[380px]:w-[112px] sm:w-[152px] md:w-[184px]';

/** Resize limits, in px of tile width. */
const MIN_W = 96;
const MAX_W = 320;
/** Gap kept between the tile and the stage box edges. */
const EDGE = 8;
/** Top strip reserved for the floating top bar — same offset as the resting anchor. */
const TOP_INSET = 64;
/** The tile is 4:3, so height follows width. */
const ASPECT = 0.75;
const MOVE_STEP = 16;
const SIZE_STEP = 16;

interface Placement {
  x: number;
  y: number;
  w: number;
}

interface StageMetrics {
  width: number;
  height: number;
  left: number;
  top: number;
}

interface Gesture {
  mode: 'drag' | 'resize';
  pointerId: number;
  /** Pointer → tile-left/top offset, so a grab never jumps the tile. */
  grabX: number;
  grabY: number;
  /** Pointer x and tile width when the gesture began (resize math). */
  startX: number;
  width: number;
  /** Edges held fixed while resizing: width grows leftward, height grows downward. */
  rightEdge: number;
  topEdge: number;
}

interface Props {
  children: ReactNode;
  /** Positioned ancestor the tile is clamped inside — the Stage box. */
  boundsRef: RefObject<HTMLDivElement>;
  /** Resting anchor override; defaults to the original corner placement. */
  anchorClass?: string;
}

function clamp(value: number, min: number, max: number) {
  return max < min ? min : Math.min(Math.max(value, min), max);
}

function stageMetrics(el: HTMLElement | null): StageMetrics | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  return { width: r.width, height: r.height, left: r.left, top: r.top };
}

/** Widest tile that still fits: capped by MAX_W, by the room to the left, and by stage height. */
function maxWidth(stage: StageMetrics, roomToLeft: number) {
  return Math.max(MIN_W, Math.min(MAX_W, roomToLeft, (stage.height - TOP_INSET - EDGE) / ASPECT));
}

/** Clamps a placement fully inside the stage box and below the top bar. */
function confine(p: Placement, stage: StageMetrics): Placement {
  const w = clamp(p.w, MIN_W, maxWidth(stage, stage.width - EDGE * 2));
  const h = w * ASPECT;
  // `highest` relaxes the top limit when the stage is too short for the tile to
  // clear the top bar at all, so the clamp can never move it out of the box.
  const highest = Math.min(TOP_INSET, Math.max(EDGE, stage.height - EDGE - h));
  return {
    x: clamp(p.x, EDGE, stage.width - EDGE - w),
    y: clamp(p.y, highest, stage.height - EDGE - h),
    w,
  };
}

export default function FloatingTile({ children, boundsRef, anchorClass }: Props) {
  const tileRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  // Latest placement, so clamping and resize math never depend on render timing.
  const liveRef = useRef<Placement | null>(null);
  // null = resting CSS placement (the original corner anchor); otherwise px in the stage box.
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [mode, setMode] = useState<'drag' | 'resize' | null>(null);

  // Rotation / window resize must never strand the tile outside the stage box.
  // The resting CSS placement is deliberately left untouched.
  useEffect(() => {
    const el = boundsRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const stage = stageMetrics(el);
      const prev = liveRef.current;
      if (!stage || !prev) return;
      const next = confine(prev, stage);
      liveRef.current = next;
      setPlacement(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [boundsRef]);

  /** Current tile geometry in stage-box px, whether resting or free-positioned. */
  function currentPlacement(stage: StageMetrics, tile: HTMLElement): Placement {
    const r = tile.getBoundingClientRect();
    return { x: r.left - stage.left, y: r.top - stage.top, w: r.width };
  }

  function beginGesture(e: ReactPointerEvent<HTMLElement>, next: 'drag' | 'resize') {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const stage = stageMetrics(boundsRef.current);
    const tile = tileRef.current;
    if (!stage || !tile) return;
    const r = tile.getBoundingClientRect();
    const current = currentPlacement(stage, tile);
    gestureRef.current = {
      mode: next,
      pointerId: e.pointerId,
      grabX: e.clientX - r.left,
      grabY: e.clientY - r.top,
      startX: e.clientX,
      width: r.width,
      rightEdge: current.x + current.w,
      topEdge: current.y,
    };
    try {
      tile.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort; the gesture still tracks without it */
    }
    // Freeze the resting CSS position into px so nothing moves on grab.
    liveRef.current = current;
    setPlacement(current);
    setMode(next);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const stage = stageMetrics(boundsRef.current);
    if (!stage) return;
    if (g.mode === 'drag') {
      const next = confine(
        {
          x: e.clientX - g.grabX - stage.left,
          y: e.clientY - g.grabY - stage.top,
          w: g.width,
        },
        stage,
      );
      liveRef.current = next;
      setPlacement(next);
      return;
    }
    // Resize: the right edge stays put, so the tile grows leftward from the handle.
    const w = clamp(g.width + (g.startX - e.clientX), MIN_W, maxWidth(stage, g.rightEdge - EDGE));
    const next = confine({ x: g.rightEdge - w, y: g.topEdge, w }, stage);
    liveRef.current = next;
    setPlacement(next);
  }

  function endGesture(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gestureRef.current = null;
    setMode(null);
    const tile = tileRef.current;
    if (tile) {
      try {
        if (tile.hasPointerCapture(e.pointerId)) tile.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  }

  function resetPlacement() {
    liveRef.current = null;
    setPlacement(null);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const stage = stageMetrics(boundsRef.current);
    const tile = tileRef.current;
    if (!stage || !tile) return;
    const current = currentPlacement(stage, tile);
    if (e.key === '0' || e.key === 'Home') {
      e.preventDefault();
      resetPlacement();
      return;
    }
    const step = e.shiftKey ? MOVE_STEP * 3 : MOVE_STEP;
    const right = current.x + current.w;
    let next: Placement | null = null;
    switch (e.key) {
      case 'ArrowLeft':
        next = { ...current, x: current.x - step };
        break;
      case 'ArrowRight':
        next = { ...current, x: current.x + step };
        break;
      case 'ArrowUp':
        next = { ...current, y: current.y - step };
        break;
      case 'ArrowDown':
        next = { ...current, y: current.y + step };
        break;
      case '+':
      case '=': {
        const w = clamp(current.w + SIZE_STEP, MIN_W, maxWidth(stage, right - EDGE));
        next = { x: right - w, y: current.y, w };
        break;
      }
      case '-':
      case '_': {
        const w = clamp(current.w - SIZE_STEP, MIN_W, maxWidth(stage, right - EDGE));
        next = { x: right - w, y: current.y, w };
        break;
      }
      default:
        return;
    }
    e.preventDefault();
    const safe = confine(next, stage);
    liveRef.current = safe;
    setPlacement(safe);
  }

  const free = placement !== null;
  const style: CSSProperties | undefined = placement
    ? {
        left: placement.x,
        top: placement.y,
        width: placement.w,
        height: placement.w * ASPECT,
      }
    : undefined;

  return (
    <div
      className={
        'pointer-events-none absolute z-20 ' + (free ? '' : (anchorClass ?? DEFAULT_ANCHOR))
      }
      style={style}
    >
      <div
        ref={tileRef}
        role="group"
        tabIndex={0}
        title="Drag to move · double-click to reset"
        aria-label="Small video view. Drag to move it, arrow keys to nudge, plus and minus to resize, double-click to reset."
        onPointerDown={(e) => beginGesture(e, 'drag')}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onLostPointerCapture={endGesture}
        onDoubleClick={resetPlacement}
        onKeyDown={onKeyDown}
        className={
          'group pointer-events-auto relative aspect-[4/3] touch-none select-none overflow-hidden rounded-2xl border bg-graphite-900 shadow-jc-float transition-colors duration-150 motion-reduce:transition-none ' +
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 ' +
          (free ? '' : DEFAULT_SIZE + ' ') +
          (mode === 'drag'
            ? 'cursor-grabbing border-accent-500/70'
            : 'cursor-grab ' +
              (mode === 'resize'
                ? 'border-accent-500/70'
                : 'border-white/[0.12] hover:border-white/25'))
        }
      >
        {children}
        {/* Resize handle — drag left/right to resize. Kept visible on touch (no
            hover there) and revealed on hover/focus for fine pointers. */}
        <span
          aria-hidden="true"
          title="Drag to resize"
          onPointerDown={(e) => {
            e.stopPropagation();
            beginGesture(e, 'resize');
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          className={
            'absolute left-1.5 top-1.5 z-10 flex h-6 w-6 cursor-nwse-resize items-center justify-center rounded-lg border border-white/10 bg-black/45 text-white/85 backdrop-blur transition-opacity duration-150 motion-reduce:transition-none sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 ' +
            (mode === 'resize' ? 'opacity-100' : 'opacity-100 sm:opacity-0')
          }
        >
          <IconResize size={13} />
        </span>
      </div>
    </div>
  );
}
