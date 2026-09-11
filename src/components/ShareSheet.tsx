import { useState } from 'react';
import { IconCheck, IconCopy } from './Icon';

interface Props {
  url: string;
  code?: string;
  compact?: boolean;
}

export default function ShareSheet({ url, code, compact }: Props) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const msg = `Join my JendCore session${code ? ` ${code}` : ''}: ${url}`;
  const encUrl = encodeURIComponent(url);
  const encMsg = encodeURIComponent(msg);
  const encText = encodeURIComponent(`Join my JendCore session: `);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement('input');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function nativeShare() {
    const nav = navigator as unknown as { share?: (d: ShareData) => Promise<void>; canShare?: (d: ShareData) => boolean };
    if (nav.share) {
      try {
        const data: ShareData = { title: 'JendCore session', text: msg, url };
        if (nav.canShare && !nav.canShare(data)) {
          // some browsers reject url+text together — try url only
          await nav.share({ title: 'JendCore session', url });
        } else {
          await nav.share(data);
        }
        setShared(true);
        setTimeout(() => setShared(false), 2000);
        return;
      } catch (err) {
        // user cancelled — ignore AbortError
        const e = err as DOMException;
        if (e?.name === 'AbortError') return;
      }
    }
    // fallback to copy
    await copy();
  }

  const canNativeShare = typeof navigator !== 'undefined' && !!(navigator as unknown as { share?: unknown }).share;

  // SMS href — iOS needs &body, Android ?body
  const smsHref = `sms:?&body=${encMsg}`;
  const waHref = `https://wa.me/?text=${encMsg}`;
  const tgHref = `https://t.me/share/url?url=${encUrl}&text=${encText}`;
  const fbHref = `https://www.facebook.com/sharer/sharer.php?u=${encUrl}`;
  const xHref = `https://twitter.com/intent/tweet?text=${encText}&url=${encUrl}`;
  const mailHref = `mailto:?subject=${encodeURIComponent('Join my JendCore session')}&body=${encMsg}`;

  return (
    <div className={`${compact ? '' : 'rounded-2xl bg-ink-800 border border-ink-700 p-4 sm:p-5'} `}>
      {!compact && (
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-bold text-white">Share invite</h3>
          <span className="text-xs font-mono text-accent-400">{code}</span>
        </div>
      )}
      {/* Primary actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={copy}
          className="flex-1 h-11 rounded-xl bg-ink-700 hover:bg-ink-600 text-white text-sm font-semibold flex items-center justify-center gap-2 transition"
        >
          {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
          {copied ? 'Copied!' : 'Copy link'}
        </button>
        <button
          type="button"
          onClick={nativeShare}
          className="flex-1 h-11 rounded-xl bg-accent-500 hover:bg-accent-600 text-white text-sm font-semibold flex items-center justify-center gap-2 transition"
        >
          <span className="text-base">{canNativeShare ? '↗' : '⎘'}</span>
          {shared ? 'Shared!' : canNativeShare ? 'Share…' : 'Share'}
        </button>
      </div>

      {/* Quick share grid */}
      <div className="mt-3 grid grid-cols-3 sm:grid-cols-6 gap-2">
        <a href={waHref} target="_blank" rel="noreferrer" className="h-11 rounded-xl bg-[#25D366] hover:brightness-110 text-white flex flex-col items-center justify-center gap-0.5 transition" title="WhatsApp">
          <span className="text-lg">💬</span>
          <span className="text-[10px] font-semibold leading-none">WhatsApp</span>
        </a>
        <a href={tgHref} target="_blank" rel="noreferrer" className="h-11 rounded-xl bg-[#229ED9] hover:brightness-110 text-white flex flex-col items-center justify-center gap-0.5 transition" title="Telegram">
          <span className="text-lg">✈️</span>
          <span className="text-[10px] font-semibold leading-none">Telegram</span>
        </a>
        <a href={xHref} target="_blank" rel="noreferrer" className="h-11 rounded-xl bg-black hover:bg-zinc-800 text-white border border-ink-700 flex flex-col items-center justify-center gap-0.5 transition" title="X / Twitter">
          <span className="text-sm font-black">𝕏</span>
          <span className="text-[10px] font-semibold leading-none">X</span>
        </a>
        <a href={fbHref} target="_blank" rel="noreferrer" className="h-11 rounded-xl bg-[#1877F2] hover:brightness-110 text-white flex flex-col items-center justify-center gap-0.5 transition" title="Facebook">
          <span className="text-lg">f</span>
          <span className="text-[10px] font-semibold leading-none">Facebook</span>
        </a>
        <a href={smsHref} className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex flex-col items-center justify-center gap-0.5 transition" title="SMS">
          <span className="text-lg">💬</span>
          <span className="text-[10px] font-semibold leading-none">SMS</span>
        </a>
        <a href={mailHref} className="h-11 rounded-xl bg-ink-700 hover:bg-ink-600 text-white flex flex-col items-center justify-center gap-0.5 transition" title="Email">
          <span className="text-lg">✉️</span>
          <span className="text-[10px] font-semibold leading-none">Email</span>
        </a>
      </div>

      <p className="mt-3 text-[11px] leading-snug text-ink-400 text-center">
        Link: <span className="font-mono text-ink-300 break-all">{url}</span>
      </p>
    </div>
  );
}
