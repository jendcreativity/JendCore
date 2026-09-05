/**
 * Annotation model.
 *
 * Every coordinate is stored in *normalised* space [0, 1] against the
 * video frame, so an arrow drawn on a phone looks in roughly the same
 * spot on a laptop — the renderer scales them up to whatever the
 * actual displayed size is. This is critical for cross-device fidelity.
 *
 * Stroke colour and width are also stored per-shape so future themes
 * are possible without a migration.
 */

export type AnnotationTool =
  | 'freehand'
  | 'arrow'
  | 'circle'
  | 'line'
  | 'text';

export interface BaseAnnotation {
  id: string;
  author: string; // peer id of who created it
  tool: AnnotationTool;
  color: string;
  width: number; // normalised against 1000px height (see renderer)
  createdAt: number;
}

export interface FreehandAnnotation extends BaseAnnotation {
  tool: 'freehand';
  /** Sequence of points, each [x, y] in 0..1 space. */
  points: [number, number][];
}

export interface ArrowAnnotation extends BaseAnnotation {
  tool: 'arrow';
  start: [number, number];
  end: [number, number];
}

export interface LineAnnotation extends BaseAnnotation {
  tool: 'line';
  start: [number, number];
  end: [number, number];
}

export interface CircleAnnotation extends BaseAnnotation {
  tool: 'circle';
  center: [number, number];
  /** Radius in 0..1 units (relative to the shorter video edge). */
  radius: number;
}

export interface TextAnnotation extends BaseAnnotation {
  tool: 'text';
  position: [number, number];
  text: string;
  /** Font size in 0..1 units (relative to video height). */
  fontSize: number;
}

export type Annotation =
  | FreehandAnnotation
  | ArrowAnnotation
  | LineAnnotation
  | CircleAnnotation
  | TextAnnotation;

export const DEFAULT_COLOR = '#ef4444'; // tailwind red-500, high contrast
export const DEFAULT_WIDTH = 4;

let counter = 0;
function nextId(): string {
  counter += 1;
  return `a_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export function createAnnotation(
  tool: AnnotationTool,
  author: string,
  init: Partial<Annotation> = {},
): Annotation {
  const base = {
    id: nextId(),
    author,
    tool,
    color: DEFAULT_COLOR,
    width: DEFAULT_WIDTH,
    createdAt: Date.now(),
  };
  switch (tool) {
    case 'freehand':
      return {
        ...base,
        tool,
        points: init && 'points' in init ? init.points ?? [] : [],
      } satisfies FreehandAnnotation;
    case 'arrow':
      return {
        ...base,
        tool,
        start: (init as ArrowAnnotation).start ?? [0.1, 0.5],
        end: (init as ArrowAnnotation).end ?? [0.9, 0.5],
      } satisfies ArrowAnnotation;
    case 'line':
      return {
        ...base,
        tool,
        start: (init as LineAnnotation).start ?? [0.1, 0.5],
        end: (init as LineAnnotation).end ?? [0.9, 0.5],
      } satisfies LineAnnotation;
    case 'circle':
      return {
        ...base,
        tool,
        center: (init as CircleAnnotation).center ?? [0.5, 0.5],
        radius: (init as CircleAnnotation).radius ?? 0.1,
      } satisfies CircleAnnotation;
    case 'text':
      return {
        ...base,
        tool,
        position: (init as TextAnnotation).position ?? [0.5, 0.5],
        text: (init as TextAnnotation).text ?? '',
        fontSize: (init as TextAnnotation).fontSize ?? 0.05,
      } satisfies TextAnnotation;
  }
}
