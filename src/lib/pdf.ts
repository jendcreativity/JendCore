/**
 * PDF rendering — pdf.js, loaded lazily.
 *
 * pdf.js is a large module plus a ~1.2 MB worker, so nothing here touches the
 * initial bundle: the library is imported the first time a PDF is actually
 * opened, and the worker is emitted as a same-origin asset (`?url`) rather than
 * pulled from a CDN.
 *
 * Rendering contract
 * ------------------
 * One page is rendered at a time into its own canvas. The caller supplies the
 * **display scale in CSS px per PDF user unit** and this module handles device
 * pixel ratio, so the raster is crisp at the current zoom. A new render cancels
 * the previous one, which is what stops rapid page changes (or a burst of zoom
 * steps) from painting a stale page over a newer one.
 *
 * Nothing is written to storage, and the parsed document is destroyed — worker
 * included — the moment the document is replaced or the workspace closes.
 */

import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import type { ContentSize } from './documentView';

/** A parsed PDF, ready to paint. Call `destroy()` when it is replaced. */
export interface PdfDocument {
  /** Page count as parsed from the file (1-based page numbers throughout). */
  pageCount: number;
  /** Page size in PDF user units (i.e. the viewport at scale 1). */
  pageSize(page: number): Promise<ContentSize>;
  /** Paints one page into `canvas` at `cssScale` CSS px per user unit. */
  render(page: number, canvas: HTMLCanvasElement, cssScale: number): Promise<void>;
  /** Cancels any in-flight render; safe to call at any time. */
  cancel(): void;
  /** Releases the parsing worker, the page cache and the render task. */
  destroy(): Promise<void>;
}

type PdfModule = typeof import('pdfjs-dist');

/**
 * Longest canvas edge we will rasterise. Past this the backing store costs
 * memory for no visible gain, so the device-pixel ratio is reduced instead.
 */
const MAX_RASTER_EDGE = 4096;
/** Device-pixel ratio is capped so a 3x phone cannot quadruple the raster. */
const MAX_DPR = 2;

let modulePromise: Promise<PdfModule> | null = null;

/** Loads pdf.js once per document and points it at the bundled worker. */
async function loadModule(): Promise<PdfModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const [pdfjs, worker] = await Promise.all([
        import('pdfjs-dist'),
        import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
      ]);
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })().catch((err: unknown) => {
      // Drop our memo so a later attempt (after a network blip) can retry.
      modulePromise = null;
      throw err;
    });
  }
  return modulePromise;
}

function isRenderCancelled(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name ?? '';
  return name === 'RenderingCancelledException' || name === 'AbortException';
}

/** Pixel ratio that keeps the longest raster edge inside the guard. */
function dprFor(content: ContentSize, cssScale: number): number {
  const raw = Math.min(
    MAX_DPR,
    Math.max(1, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1),
  );
  const longest = Math.max(content.width, content.height) * cssScale * raw;
  if (longest <= MAX_RASTER_EDGE) return raw;
  return Math.max(1, raw * (MAX_RASTER_EDGE / longest));
}

/**
 * Parses a PDF from bytes already held in memory.
 *
 * pdf.js copies `data` into its worker, so the caller may drop its own
 * reference afterwards; we still hand over a copy so a transfer buffer we are
 * finishing with cannot be mutated underneath the parser.
 */
export async function openPdf(bytes: Uint8Array): Promise<PdfDocument> {
  const pdfjs = await loadModule();
  const loadingTask = pdfjs.getDocument({
    data: bytes.slice(),
    // No `cMapUrl` / `standardFontDataUrl` is configured, so pdf.js never
    // fetches a font or CMap from a third party: the page either renders with
    // its embedded fonts or falls back, and the worker stays same-origin.
    useWorkerFetch: false,
    // Bounded rasterisation: pdf.js refuses absurd canvases on low-memory
    // devices instead of taking the tab down.
    maxImageSize: 4096 * 4096,
  });

  let doc: PDFDocumentProxy;
  try {
    doc = await loadingTask.promise;
  } catch (err) {
    try {
      await loadingTask.destroy();
    } catch {
      /* already gone */
    }
    throw err;
  }

  const pageCache = new Map<number, PDFPageProxy>();
  let activeTask: RenderTask | null = null;

  const getPage = async (page: number): Promise<PDFPageProxy> => {
    const clamped = Math.min(doc.numPages, Math.max(1, Math.round(page)));
    const cached = pageCache.get(clamped);
    if (cached) return cached;
    const loaded = await doc.getPage(clamped);
    // Two pages is enough for look-ahead and far cheaper than a full cache.
    if (pageCache.size >= 2) {
      const oldest = pageCache.keys().next().value;
      if (oldest !== undefined) {
        try {
          pageCache.get(oldest)?.cleanup();
        } catch {
          /* best effort */
        }
        pageCache.delete(oldest);
      }
    }
    pageCache.set(clamped, loaded);
    return loaded;
  };

  return {
    pageCount: doc.numPages,

    async pageSize(page: number): Promise<ContentSize> {
      const proxy = await getPage(page);
      const viewport = proxy.getViewport({ scale: 1 });
      return { width: viewport.width, height: viewport.height };
    },

    async render(page: number, canvas: HTMLCanvasElement, cssScale: number): Promise<void> {
      const proxy = await getPage(page);
      const base = proxy.getViewport({ scale: 1 });
      const dpr = dprFor({ width: base.width, height: base.height }, cssScale);
      const viewport = proxy.getViewport({ scale: cssScale * dpr });
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('This browser cannot render PDF pages.');

      // Backing store at device resolution, layout size in CSS px — so the
      // canvas occupies exactly `pageSize * cssScale`, which is the same
      // rectangle the annotation layer is positioned against.
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      canvas.style.width = `${viewport.width / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;

      activeTask?.cancel();
      const task = proxy.render({ canvas, viewport });
      activeTask = task;
      try {
        await task.promise;
      } catch (err) {
        if (isRenderCancelled(err)) return;
        throw err;
      } finally {
        if (activeTask === task) activeTask = null;
      }
    },

    cancel(): void {
      activeTask?.cancel();
      activeTask = null;
    },

    async destroy(): Promise<void> {
      activeTask?.cancel();
      activeTask = null;
      for (const proxy of pageCache.values()) {
        try {
          proxy.cleanup();
        } catch {
          /* best effort */
        }
      }
      pageCache.clear();
      // pdf.js v6 keeps document-level teardown on the proxy (`cleanup`) and
      // worker teardown on the loading task (`destroy`).
      try {
        await doc.cleanup();
      } catch {
        /* the document may already be gone */
      }
      try {
        await loadingTask.destroy();
      } catch {
        /* idempotent */
      }
    },
  };
}

/**
 * Turns a pdf.js failure into something a person can act on. A password-protected
 * document is reported as unsupported rather than silently failing, because this
 * workspace has no decryption prompt.
 */
export function pdfErrorMessage(err: unknown): string {
  const name = (err as { name?: string } | null)?.name ?? '';
  if (name === 'PasswordException') {
    return 'That PDF is password-protected, which this workspace does not support. Please share an unlocked copy.';
  }
  if (name === 'InvalidPDFException') {
    return 'That file is not a readable PDF. It may be corrupt or only partly downloaded.';
  }
  if (name === 'MissingPDFException') {
    return 'The PDF data could not be read. Please choose the file again.';
  }
  if (name === 'UnexpectedResponseException') {
    return 'The PDF could not be loaded. Please choose the file again.';
  }
  const message = (err as { message?: string } | null)?.message;
  return message
    ? `This PDF could not be opened: ${message}`
    : 'This PDF could not be opened. It may be corrupt or unsupported.';
}