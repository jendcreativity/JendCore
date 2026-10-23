/**
 * File inspection: everything that must be true *before* a document is offered
 * to the session.
 *
 * This is the honest half of the share flow — the part that can actually fail.
 * A file is validated by kind and size first, then **decoded**: an image must
 * produce real dimensions, a PDF must parse and report a real page count and a
 * sane page box. Nothing is announced to the session until all of that passes,
 * so "shared" always means "shared, readable document".
 *
 * The bytes are read into memory once and hashed; the original `File` is never
 * uploaded anywhere.
 */

import {
  DOC_LIMITS,
  formatBytes,
  kindForFile,
  mimeForKind,
  truncateName,
  validateFileBasics,
  type DocumentKind,
} from './documents';
import { sha256Hex } from './docTransfer';
import { openPdf, pdfErrorMessage } from './pdf';

/** An inspected, accepted file — the input to sharing. */
export interface InspectedDocument {
  kind: DocumentKind;
  name: string;
  mime: string;
  size: number;
  /** Content units of page 1 (the image itself, for an image). */
  width: number;
  height: number;
  /** 1 for images, the parsed page count for PDFs. */
  pageCount: number;
  /** The document's bytes, in memory only. */
  bytes: Uint8Array;
  /** SHA-256 of those bytes, computed once and reused by every transfer. */
  sha256: string;
}

export type InspectResult = { ok: true; doc: InspectedDocument } | { ok: false; message: string };

/**
 * Ceiling on decoded image pixels. The 15 MB byte cap already bounds this in
 * practice; the pixel count catches the pathological case (a huge but highly
 * compressed image) before the browser tries to paint it.
 */
const MAX_PIXELS = 80_000_000;

async function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  // `createImageBitmap` reports the true decoded size and fails on a corrupt
  // file, which is exactly the check we want — no guessing from file headers.
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close?.();
      return size;
    } catch {
      return null;
    }
  }
  // Fallback for a browser without createImageBitmap: decode through an <img>.
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('decode failed'));
      img.src = url;
    });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Validates a picked file end to end.
 *
 * Every failure returns a message written for the person holding the phone
 * rather than a code, and any temporary object URL created for decoding is
 * revoked on the failure paths too.
 */
export async function inspectFile(file: File): Promise<InspectResult> {
  const basic = validateFileBasics(file);
  if (!basic.ok) return basic;
  const kind = kindForFile(file.type, file.name);
  if (!kind) return { ok: false, message: 'That file type is not supported.' };

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, message: 'That file could not be read. Please choose it again.' };
  }
  if (bytes.byteLength === 0) {
    return { ok: false, message: 'That file is empty. Please choose another one.' };
  }

  if (kind === 'image') {
    const size = await imageSize(file);
    if (!size || size.width < 1 || size.height < 1) {
      return {
        ok: false,
        message:
          'That image could not be decoded, so it may be corrupt. Please choose another one.',
      };
    }
    if (size.width * size.height > MAX_PIXELS) {
      return {
        ok: false,
        message: `That image is ${size.width}×${size.height} pixels — too large to display reliably. Please share a smaller copy.`,
      };
    }
    return {
      ok: true,
      doc: {
        kind,
        name: truncateName(file.name),
        mime: mimeForKind(kind, file.type, file.name),
        size: bytes.byteLength,
        width: size.width,
        height: size.height,
        pageCount: 1,
        bytes,
        sha256: await sha256Hex(bytes),
      },
    };
  }

  // PDF: parse now, so the page count and the first page box are real numbers
  // rather than assumptions. The parse is thrown away immediately.
  try {
    const pdf = await openPdf(bytes);
    try {
      if (pdf.pageCount > DOC_LIMITS.pdfPages) {
        return {
          ok: false,
          message: `That PDF has ${pdf.pageCount} pages — the limit is ${DOC_LIMITS.pdfPages}. Please share a shorter document.`,
        };
      }
      const first = await pdf.pageSize(1);
      if (
        first.width < DOC_LIMITS.minPageUnits ||
        first.height < DOC_LIMITS.minPageUnits ||
        first.width > DOC_LIMITS.maxPageUnits ||
        first.height > DOC_LIMITS.maxPageUnits
      ) {
        return {
          ok: false,
          message: `The first page measures ${Math.round(first.width)}×${Math.round(first.height)} units, which this viewer cannot display reliably.`,
        };
      }
      return {
        ok: true,
        doc: {
          kind,
          name: truncateName(file.name),
          mime: 'application/pdf',
          size: bytes.byteLength,
          width: first.width,
          height: first.height,
          pageCount: pdf.pageCount,
          bytes,
          sha256: await sha256Hex(bytes),
        },
      };
    } finally {
      await pdf.destroy();
    }
  } catch (err) {
    return { ok: false, message: pdfErrorMessage(err) };
  }
}

/** Human summary of the limits, shown in the workspace's empty state. */
export function documentedLimits(): string {
  return `Images up to ${formatBytes(DOC_LIMITS.imageBytes)} · PDFs up to ${formatBytes(DOC_LIMITS.pdfBytes)} and ${DOC_LIMITS.pdfPages} pages`;
}