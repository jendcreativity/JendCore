import { useState } from 'react';
import {
  IconChat,
  IconUsers,
  IconMic,
  IconMicOff,
  IconCamera,
  IconVideoOff,
  IconVolume,
  IconVolumeOff,
  IconCrosshair,
  IconTag,
  IconLock,
  IconFollow,
  IconFreeze,
  IconImage,
  IconPen,
  IconArrow,
  IconCircle,
  IconLine,
  IconText,
  IconZoom,
  IconLowLight,
  IconFileText,
  IconWrench,
  IconShare,
  IconInfo,
  IconSettings,
  IconPhoneOff,
  IconClose,
  IconChevronLeft,
} from '../Icon';
import { AnnotationTool } from '../../lib/annotations';

interface Props {
  open: boolean;
  onClose: () => void;
  onToggle: () => void;
  micEnabled: boolean;
  cameraEnabled: boolean;
  speakerMuted: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleSpeaker: () => void;
  onOpenChat: () => void;
  onOpenParticipants: () => void;
  chatUnread?: number;
  participantCount: number;
  focusActive: boolean;
  onToggleFocus: () => void;
  lockActive: boolean;
  onToggleLock: () => void;
  followActive: boolean;
  onToggleFollow: () => void;
  frozen: boolean;
  onToggleFreeze: () => void;
  onCapture: () => void;
  captureFlash: boolean;
  tool: AnnotationTool | null;
  onSelectTool: (t: AnnotationTool | null) => void;
  onClearAnnotations: () => void;
  lowLight: boolean;
  onToggleLowLight: () => void;
  zoom: number;
  onZoom: (v: number) => void;
  code: string;
  connectionLabel: string;
  onShare: () => void;
  onEnd: () => void;
}

type GroupId = 'communication' | 'visual' | 'inspection' | 'session';

export default function CommandCenter(p: Props) {
  const [expanded, setExpanded] = useState<GroupId>('visual');
  const toggle = (g: GroupId) => setExpanded((prev) => (prev === g ? prev : g));
  return (
    <>
      <div
        aria-hidden
        onClick={p.onClose}
        className={`absolute inset-0 z-30 bg-black/30 backdrop-blur-[1px] transition-opacity duration-300 ${p.open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-40 flex items-center">
        <button
          type="button"
          aria-label={p.open ? 'Close command center' : 'Open command center'}
          aria-expanded={p.open}
          onClick={p.onToggle}
          className="pointer-events-auto handle-pill flex h-[84px] w-[28px] flex-col items-center justify-center gap-1 py-2 sm:h-[96px] sm:w-[30px]"
        >
          <span className="h-1 w-1 rounded-full bg-white/70" aria-hidden />
          <span className="h-1 w-1 rounded-full bg-white/70" aria-hidden />
          <span className="h-1 w-1 rounded-full bg-white/70" aria-hidden />
          <span className={`mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#1877F2] text-white transition-transform ${p.open ? 'rotate-180' : ''}`} aria-hidden>
            <IconChevronLeft size={12} />
          </span>
        </button>
      </div>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command center"
        className={`absolute right-0 top-0 z-40 flex h-full w-[86vw] max-w-[340px] flex-col overflow-hidden rounded-l-[20px] field-panel transition-transform duration-300 ease-out sm:w-[360px] ${p.open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="shrink-0 border-b border-white/10 px-4 pb-3 pt-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1877F2] text-white shadow">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <circle cx="12" cy="12" r="8" />
                  <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
                </svg>
              </span>
              <div className="leading-none">
                <div className="text-[11px] font-bold tracking-widest text-white">JENDCORE</div>
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-white/60">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden />
                  <span className="uppercase tracking-widest">Live</span>
                  <span className="text-white/25">•</span>
                  <span className="truncate font-mono text-[10px] tracking-widest text-white/80">{p.code}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="hidden sm:inline-flex items-center rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-white/70">{p.connectionLabel}</span>
              <button type="button" onClick={p.onClose} aria-label="Close" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/15">
                <IconClose size={14} />
              </button>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[11px] font-medium text-white/50">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] border border-white/10 px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#1877F2]" aria-hidden />
              {p.participantCount} in session
            </span>
            <span className="ml-auto hidden sm:inline text-[10px] tracking-widest text-white/35">FIELD DEVICE</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-3 py-3">
END_MARKER
