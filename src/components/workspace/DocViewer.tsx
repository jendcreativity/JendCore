/**
 * Shared-document viewer.
 *
 * Renders the active document (image or PDF) with pan / zoom, and hosts
 * `DocAnnotationLayer` above the page so marks stay glued to the document as it
 * moves. Zoom is wheel-driven and anchored to the cursor; panning is
 * middle-drag, or left-drag while no tool is armed.
 *
 * The viewer only ever deals in the two coordinate systems `documentView`
 * relates: container CSS px and normalised document units. Page bytes and
 * annotation state come from `useSharedDocument` via `doc`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { openPdf, pdfErrorMessage, type PdfDocument } from '../../lib/pdf';
import type { SharedDocumentApi } from '../../hooks/useSharedDocument';
import {
  clampOffset,
  contentRect,
  fitView,
  isViewable,
  panBy,
  wheelZoomFactor,
  zoomAt,
  zoomAtCenter,
  zoomPercent,
  ZOOM_STEP,
  type ContainerPoint,
  type ContainerSize,
  type ContentSize,
  type ViewState,
} from '../../lib/documentView';
import DocAnnotationLayer, { type DocPointerTool } from './DocAnnotationLayer';
import DocToolbar from './DocToolbar';

interface Props {
  doc: SharedDocumentApi;
  selfId: string;
  tool: DocPointerTool | null;
  color: string;
  onToolChange: (tool: DocPointerTool | null) => void;
  onColorChange: (color: string) => void;
  onClose: () => void;
}

/**
 * Re-rasterise only when the display outgrows the cached resolution by more
 * than this factor. Zooming out keeps the sharper canvas; panning never
 * touches it.
 */
const RASTER_GROWTH = 1.1;

export default function DocViewer({
  doc,
  selfId,
  tool,
  color,
  onToolChange,
  onColorChange,
  onClose,
}: Props) {
  const meta = doc.meta as NonNullable<SharedDocumentApi['meta']>;

  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [container, setContainer] = useState<ContainerSize | null>(null);
  const [view, setView] = useState<ViewState | null>(null);
  const [content, setContent] = useState<ContentSize | null>(null);

  /* ---------- PDF lifecycle: parse the bytes once per document ---------- */

  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    if (meta.kind !== 'pdf' || !doc.bytes) {
      setPdf(null);
      setPdfError(null);
      return;
    }
    let cancelled = false;
    let created: PdfDocument | null = null;
    openPdf(doc.bytes)
      .then((p) => {
        created = p;
        if (!cancelled) {
          setPdf(p);
          setPdfError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setPdfError(pdfErrorMessage(err));
      });
    return () => {
      cancelled = true;
      if (created) void created.destroy();
    };
  }, [doc.bytes, meta.docId, meta.kind]);

  /* ---------- Content size: natural size for images, page box for PDFs ---------- */

  useEffect(() => {
    if (meta.kind === 'image') {
      setContent({ width: meta.width, height: meta.height });
      return;
    }
    setContent(null);
    if (!pdf) return;
    let cancelled = false;
    pdf
      .pageSize(doc.page)
      .then((size) => {
        if (!cancelled) setContent(size);
      })
      .catch(() => {
        /* the page changed while loading — the effect will run again */
      });
    return () => {
      cancelled = true;
    };
  }, [doc.page, meta.height, meta.kind, meta.width, pdf]);

  /* ---------- Viewer box measurement ---------- */

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setContainer({ width: rect.width, height: rect.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---------- View state: fit once per page, clamp on container changes ---------- */

  const contentKeyRef = useRef<string | null>(null);
  const contentKey = `${meta.docId}:${doc.page}`;

  useEffect(() => {
    if (!content || !container || !isViewable(content, container)) return;
    if (contentKeyRef.current !== contentKey) {
      contentKeyRef.current = contentKey;
      setView(fitView(content, container));
      return;
    }
    // Same page, new container size: keep the scale, re-clamp the offset.
    setView((v) => (v ? clampOffset(v, content, container) : v));
  }, [content, container, contentKey]);

  /* ---------- Wheel zoom (native listener so preventDefault works) ---------- */

  const contentRef = useRef<ContentSize | null>(null);
  const containerRef = useRef<ContainerSize | null>(null);
  contentRef.current = content;
  containerRef.current = container;

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = contentRef.current;
      const box = containerRef.current;
      if (!c || !box) return;
      const rect = el.getBoundingClientRect();
      setView((v) =>
        v
          ? zoomAt(v, c, box, wheelZoomFactor(e.deltaY, e.ctrlKey), {
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
            })
          : v,
      );
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /* ---------- Pan: middle-drag always; left-drag while no tool is armed ---------- */

  const panRef = useRef<{ id: number; last: ContainerPoint } | null>(null);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 1 && !(e.button === 0 && !tool)) return;
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety */
      }
      panRef.current = { id: e.pointerId, last: { x: e.clientX, y: e.clientY } };
    },
    [tool],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const s = panRef.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.last.x;
    const dy = e.clientY - s.last.y;
    s.last = { x: e.clientX, y: e.clientY };
    if (!dx && !dy) return;
    setView((v) => {
      const c = contentRef.current;
      const box = containerRef.current;
      return v && c && box ? panBy(v, dx, dy, c, box) : v;
    });
  }, []);

  const endPan = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (panRef.current?.id === e.pointerId) panRef.current = null;
  }, []);


  /* ---------- PDF rasterisation: keep up with zoom, never over-paint ---------- */

  const rasterScaleRef = useRef(0);
  const lastPageRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pdf || !view) return;
    if (lastPageRef.current !== doc.page) {
      lastPageRef.current = doc.page;
      rasterScaleRef.current = 0;
    }
    if (view.scale <= rasterScaleRef.current * RASTER_GROWTH) return;
    rasterScaleRef.current = view.scale;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    void pdf.render(doc.page, canvas, view.scale * dpr).catch(() => {
      /* a newer render cancelled this one */
    });
  }, [doc.page, pdf, view]);

  /* ---------- Toolbar zoom actions ---------- */

  const zoomIn = useCallback(() => {
    const c = contentRef.current;
    const box = containerRef.current;
    setView((v) => (v && c && box ? zoomAtCenter(v, c, box, ZOOM_STEP) : v));
  }, []);

  const zoomOut = useCallback(() => {
    const c = contentRef.current;
    const box = containerRef.current;
    setView((v) => (v && c && box ? zoomAtCenter(v, c, box, 1 / ZOOM_STEP) : v));
  }, []);

  const fit = useCallback(() => {
    const c = contentRef.current;
    const box = containerRef.current;
    if (c && box) setView(fitView(c, box));
  }, []);

  /* ---------- Render ---------- */

  const rect = content && view ? contentRect(view, content) : null;
  const percent = view ? Math.round(zoomPercent(view)) : 100;
  const pageShadow = { boxShadow: '0 10px 34px rgba(0, 0, 0, 0.45)' };

  return (
    <div
      ref={boxRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      className={`relative h-full min-h-0 overflow-hidden bg-graphite-900 ${
        tool ? '' : 'cursor-grab active:cursor-grabbing'
      }`}
      style={{ touchAction: 'none' }}
    >
      {pdfError ? (
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-titanium-300">
          {pdfError}
        </div>
      ) : null}

      {meta.kind === 'image' && doc.imageUrl && rect ? (
        <img
          src={doc.imageUrl}
          alt={meta.name}
          draggable={false}
          className="absolute select-none"
          style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, ...pageShadow }}
        />
      ) : null}

      {meta.kind === 'pdf' && rect ? (
        <canvas ref={canvasRef} className="absolute" style={{ left: rect.x, top: rect.y, ...pageShadow }} />
      ) : null}

      {view && content && container ? (
        <DocAnnotationLayer
          content={content}
          container={container}
          view={view}
          page={doc.page}
          annotations={doc.annotations}
          color={color}
          tool={tool}
          selfId={selfId}
          onAdd={doc.addAnnotation}
          onPatch={doc.streamPatch}
          onFinish={doc.finishAnnotation}
          onErase={doc.eraseAt}
        />
      ) : null}

      {!rect ? (
        <div className="pointer-events-none flex h-full items-center justify-center p-6 text-sm text-titanium-300">
          {meta.kind === 'pdf' ? 'Rendering page…' : 'Loading document…'}
        </div>
      ) : null}

      <DocToolbar
        name={meta.name}
        page={doc.page}
        pageCount={meta.pageCount}
        tool={tool}
        color={color}
        zoomPercent={percent}
        canUndo={doc.canUndo}
        canRedo={doc.canRedo}
        onToolChange={onToolChange}
        onColorChange={onColorChange}
        onPageChange={doc.setPage}
        onUndo={doc.undo}
        onRedo={doc.redo}
        onClearPage={doc.clearPage}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFit={fit}
        onClose={onClose}
        onCloseDocument={doc.closeDocument}
      />
    </div>
  );
}

