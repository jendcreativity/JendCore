import {
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Annotation,
  AnnotationTool,
  createAnnotation,
} from '../lib/annotations';

interface Props {
  annotations: Annotation[];
  selfId: string;
  tool: AnnotationTool | null;
  onCommit: (annotation: Annotation) => void;
  onPatch?: (id: string, patch: Partial<Annotation>) => void;
}

/**
 * Transparent SVG overlay that sits on top of the video element.
 *
 * Coordinates are normalised to the displayed overlay box, then handed
 * off to the parent in the same normalised space, so the renderer can
 * scale them up at draw time and we don't lose precision across screens.
 *
 * We use Pointer Events so the same code path serves mouse and touch.
 */
export default function AnnotationCanvas({
  annotations,
  selfId,
  tool,
  onCommit,
  onPatch,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [pointerId, setPointerId] = useState<number | null>(null);
  const [textDraft, setTextDraft] = useState<{
    x: number;
    y: number;
    value: string;
  } | null>(null);

  const drawing = tool !== null;

  const toLocal = useCallback(
    (e: { clientX: number; clientY: number }): [number, number] => {
      const svg = svgRef.current;
      if (!svg) return [0, 0];
      const rect = svg.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      return [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
    },
    [],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (!tool || !drawing) return;
      if (!e.isPrimary) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setPointerId(e.pointerId);
      const [x, y] = toLocal(e);

      if (tool === 'text') {
        setTextDraft({ x, y, value: '' });
        return;
      }
      if (tool === 'freehand') {
        setDraft(createAnnotation('freehand', selfId, { points: [[x, y]] }));
        return;
      }
      if (tool === 'arrow' || tool === 'line') {
        setDraft(
          createAnnotation(tool, selfId, {
            start: [x, y],
            end: [x, y],
          } as Partial<Annotation>),
        );
        return;
      }
      if (tool === 'circle') {
        setDraft(
          createAnnotation('circle', selfId, {
            center: [x, y],
            radius: 0,
          } as Partial<Annotation>),
        );
        return;
      }
    },
    [tool, drawing, selfId, toLocal],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (!draft || e.pointerId !== pointerId) return;
      const [x, y] = toLocal(e);
      if (draft.tool === 'freehand') {
        const points = [...draft.points, [x, y] as [number, number]];
        setDraft({ ...draft, points });
        onPatch?.(draft.id, { points });
        return;
      }
      if (draft.tool === 'arrow' || draft.tool === 'line') {
        const next = { ...draft, end: [x, y] as [number, number] };
        setDraft(next);
        onPatch?.(draft.id, { end: next.end });
        return;
      }
      if (draft.tool === 'circle') {
        const dx = x - draft.center[0];
        const dy = y - draft.center[1];
        const radius = Math.sqrt(dx * dx + dy * dy);
        const next = { ...draft, radius };
        setDraft(next);
        onPatch?.(draft.id, { radius });
        return;
      }
    },
    [draft, pointerId, toLocal, onPatch],
  );

  const finishShape = useCallback(() => {
    if (!draft) return;
    onCommit(draft);
    setDraft(null);
    setPointerId(null);
  }, [draft, onCommit]);

  useEffect(() => {
    if (!textDraft) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter') {
        if (textDraft && textDraft.value.trim() !== '') {
          onCommit(
            createAnnotation('text', selfId, {
              position: [textDraft.x, textDraft.y],
              text: textDraft.value.trim(),
            } as Partial<Annotation>),
          );
        }
        setTextDraft(null);
      } else if (e.key === 'Escape') {
        setTextDraft(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [textDraft, selfId, onCommit]);

  const cursor = useMemo(() => {
    if (!tool) return 'default';
    if (tool === 'text') return 'text';
    return 'crosshair';
  }, [tool]);

  return (
    <div
      className="absolute inset-0"
      style={{ pointerEvents: drawing ? 'auto' : 'none' }}
    >
      <svg
        ref={svgRef}
        className="w-full h-full touch-none select-none"
        style={{ cursor }}
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishShape}
        onPointerCancel={finishShape}
        onPointerLeave={(e) => {
          if (e.pointerId === pointerId) finishShape();
        }}
        aria-label="Annotation overlay"
      >
        {annotations.map(renderAnnotation)}
        {draft && renderAnnotation(draft)}
      </svg>

      {textDraft && (
        <input
          autoFocus
          value={textDraft.value}
          onChange={(e) =>
            setTextDraft((d) => (d ? { ...d, value: e.target.value } : d))
          }
          onBlur={() => {
            if (textDraft.value.trim() !== '') {
              onCommit(
                createAnnotation('text', selfId, {
                  position: [textDraft.x, textDraft.y],
                  text: textDraft.value.trim(),
                } as Partial<Annotation>),
              );
            }
            setTextDraft(null);
          }}
          style={{
            position: 'absolute',
            left: `${textDraft.x * 100}%`,
            top: `${textDraft.y * 100}%`,
            transform: 'translate(0, -50%)',
            pointerEvents: 'auto',
          }}
          className="bg-black/70 text-white border border-white/40 rounded px-2 py-1 outline-none text-lg min-w-[120px]"
          placeholder="Label…"
        />
      )}
    </div>
  );
}

function renderAnnotation(a: Annotation) {
  const sw = Math.max(2, a.width);
  switch (a.tool) {
    case 'freehand': {
      if (a.points.length < 2) return null;
      const d = a.points
        .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x * 1000} ${y * 1000}`)
        .join(' ');
      return (
        <path
          key={a.id}
          d={d}
          stroke={a.color}
          strokeWidth={sw}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    }
    case 'line':
      return (
        <line
          key={a.id}
          x1={a.start[0] * 1000}
          y1={a.start[1] * 1000}
          x2={a.end[0] * 1000}
          y2={a.end[1] * 1000}
          stroke={a.color}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      );
    case 'arrow':
      return (
        <g key={a.id}>
          <line
            x1={a.start[0] * 1000}
            y1={a.start[1] * 1000}
            x2={a.end[0] * 1000}
            y2={a.end[1] * 1000}
            stroke={a.color}
            strokeWidth={sw}
            strokeLinecap="round"
          />
          {renderArrowHead(a.start, a.end, a.color, sw)}
        </g>
      );
    case 'circle':
      return (
        <circle
          key={a.id}
          cx={a.center[0] * 1000}
          cy={a.center[1] * 1000}
          r={a.radius * 1000}
          fill="none"
          stroke={a.color}
          strokeWidth={sw}
        />
      );
    case 'text':
      return (
        <text
          key={a.id}
          x={a.position[0] * 1000}
          y={a.position[1] * 1000}
          fill={a.color}
          stroke="rgba(0,0,0,0.6)"
          strokeWidth={1}
          paintOrder="stroke"
          fontSize={a.fontSize * 1000}
          fontWeight={700}
          fontFamily="Inter, system-ui, sans-serif"
        >
          {a.text}
        </text>
      );
  }
}

function renderArrowHead(
  start: [number, number],
  end: [number, number],
  color: string,
  width: number,
) {
  const [sx, sy] = [start[0] * 1000, start[1] * 1000];
  const [ex, ey] = [end[0] * 1000, end[1] * 1000];
  const angle = Math.atan2(ey - sy, ex - sx);
  const len = Math.max(18, width * 4);
  const a1 = angle + Math.PI - Math.PI / 7;
  const a2 = angle + Math.PI + Math.PI / 7;
  const x1 = ex + Math.cos(a1) * len;
  const y1 = ey + Math.sin(a1) * len;
  const x2 = ex + Math.cos(a2) * len;
  const y2 = ey + Math.sin(a2) * len;
  return (
    <polygon
      points={`${ex},${ey} ${x1},${y1} ${x2},${y2}`}
      fill={color}
    />
  );
}
