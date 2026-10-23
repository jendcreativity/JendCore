/**
 * Document workspace overlay — the full-stage surface for the shared document.
 *
 * Renders one of three states: the viewer (document active), transfer progress
 * (bytes moving over the data channel), or the open-document empty state with
 * the file picker. Owns nothing but presentation — every byte, annotation and
 * lifecycle transition lives in `useSharedDocument` (`doc`).
 */

import { useRef, useState } from 'react';
import type { SharedDocumentApi } from '../../hooks/useSharedDocument';
import { DOC_ACCEPT, formatBytes, truncateName } from '../../lib/documents';
import { documentedLimits, inspectFile } from '../../lib/documentInspect';
import { IconAlert, IconFileText } from '../Icon';
import DocViewer from './DocViewer';
import type { DocPointerTool } from './DocAnnotationLayer';

interface Props {
  doc: SharedDocumentApi;
  selfId: string;
  open: boolean;
  tool: DocPointerTool | null;
  color: string;
  onToolChange: (tool: DocPointerTool | null) => void;
  onColorChange: (color: string) => void;
  onClose: () => void;
}

/** Empty state: pick a file to start the share, or wait for a peer's document. */
function OpenDocumentPanel({ doc }: { doc: SharedDocumentApi }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const result = await inspectFile(file);
    if (!result.ok) {
      setPickError(result.message);
      return;
    }
    setPickError(null);
    try {
      await doc.share(result.doc);
    } catch (err) {
      setPickError(err instanceof Error ? err.message : 'Could not share the document.');
    }
  };

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl jc-surface p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] text-titanium-200">
          <IconFileText size={24} />
        </div>
        <h2 className="mt-3 text-base font-bold text-white">Share a document</h2>
        <p className="mt-1 text-sm leading-snug text-titanium-300">
          Everyone in the session sees the same page and can annotate it together.
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-4 inline-flex h-11 items-center justify-center rounded-full bg-accent-500 px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
        >
          Choose a file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={DOC_ACCEPT}
          className="sr-only"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <p className="mt-3 text-xs leading-snug text-titanium-400">{documentedLimits()}</p>
        {pickError ? <p className="mt-3 text-xs font-medium text-red-300">{pickError}</p> : null}
        {doc.meta && !doc.isHolder ? (
          <p className="mt-3 text-xs text-titanium-400">
            A document is already active in this session — it appears here once its bytes arrive.
          </p>
        ) : null}
      </div>
    </div>
  );
}


/** Transfer state: honest numbers while bytes move over the data channel. */
function TransferPanel({ transfer }: { transfer: NonNullable<SharedDocumentApi['transfer']> }) {
  const sending = transfer.direction === 'out';
  const pct = Math.round(Math.min(1, Math.max(0, transfer.ratio)) * 100);
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl jc-surface p-6">
        <div className="text-sm font-bold text-white">{sending ? 'Sending document' : 'Receiving document'}</div>
        <div className="mt-1 truncate text-sm text-titanium-300" title={transfer.name}>
          {truncateName(transfer.name)}
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full bg-accent-500 transition-[width] duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-titanium-400">
          <span>
            {formatBytes(transfer.moved)} / {formatBytes(transfer.total)}
          </span>
          <span className="font-mono font-semibold text-titanium-200">{pct}%</span>
        </div>
        {transfer.message ? <p className="mt-2 text-xs text-titanium-400">{transfer.message}</p> : null}
      </div>
    </div>
  );
}

export default function DocWorkspace({
  doc,
  selfId,
  open,
  tool,
  color,
  onToolChange,
  onColorChange,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-graphite-950">
      {doc.error ? (
        <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-100 backdrop-blur">
          <IconAlert size={16} />
          <span className="min-w-0 flex-1 truncate">{doc.error}</span>
          <button
            type="button"
            onClick={doc.dismissError}
            className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-white/20"
          >
            Dismiss
          </button>
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1">
        {doc.ready && doc.meta ? (
          <DocViewer
            doc={doc}
            selfId={selfId}
            tool={tool}
            color={color}
            onToolChange={onToolChange}
            onColorChange={onColorChange}
            onClose={onClose}
          />
        ) : doc.transfer ? (
          <TransferPanel transfer={doc.transfer} />
        ) : (
          <OpenDocumentPanel doc={doc} />
        )}
      </div>
    </div>
  );
}
