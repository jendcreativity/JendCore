import { ReactNode, useId, useRef } from 'react';
import { IconChat, IconPen, IconUsers } from '../Icon';
import Sheet from './Sheet';

export type CommandTab = 'chat' | 'markup' | 'people';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Active tab. The caller owns it so the page can react (unread, markup state). */
  tab: CommandTab;
  onTabChange: (tab: CommandTab) => void;
  /**
   * Panel bodies. The caller passes the real implementations (ChatPanel,
   * AnnotationToolbar, ParticipantsList) — this component only provides the
   * shell, so no control here can imply a feature the app does not have.
   */
  chat: ReactNode;
  markup: ReactNode;
  people: ReactNode;
  /** Unread messages, shown as a count on the Chat tab. */
  chatUnread?: number;
  /** Head count, shown as a count on the People tab. */
  peopleCount?: number;
  /** 'auto' (default) = bottom sheet on phones, right overlay from sm up. */
  side?: 'right' | 'bottom' | 'auto';
}

const TABS: { id: CommandTab; label: string; icon: ReactNode }[] = [
  { id: 'chat', label: 'Chat', icon: <IconChat size={16} /> },
  { id: 'markup', label: 'Markup', icon: <IconPen size={16} /> },
  { id: 'people', label: 'People', icon: <IconUsers size={16} /> },
];

// Tab keys share one shape: 48px minimum, pill, blue only for the active tab.
const TAB_CLASS = [
  'inline-flex h-12 shrink-0 items-center gap-2 rounded-full px-3.5 text-xs font-semibold',
  'transition-colors duration-150 motion-reduce:transition-none',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
].join(' ');

const TAB_ACTIVE = 'bg-white/[0.09] text-white shadow-jc-inset-hairline';
const TAB_IDLE = 'text-titanium-300 hover:bg-white/[0.05] hover:text-titanium-100';

/**
 * Command panel — one graphite instrument over the stage holding the three
 * session panels behind a tab bar.
 *
 * Desktop (sm and up) it overlays the right edge of the stage so the video is
 * never resized; on phones it is the bottom sheet from Sheet, which owns the
 * safe-area inset, the scrim, Escape handling and the close action.
 *
 * Panels stay mounted while inactive (hidden) so in-progress chat drafts and
 * scroll positions survive a tab switch.
 */
export default function CommandPanel({
  open,
  onClose,
  tab,
  onTabChange,
  chat,
  markup,
  people,
  chatUnread,
  peopleCount,
  side = 'auto',
}: Props) {
  const uid = useId();
  const tabRefs = useRef<Partial<Record<CommandTab, HTMLButtonElement | null>>>({});
  const slots: Record<CommandTab, ReactNode> = { chat, markup, people };
  const titles: Record<CommandTab, string> = { chat: 'Chat', markup: 'Markup', people: 'People' };
  const tabId = (id: CommandTab) => `${uid}-tab-${id}`;
  const panelId = (id: CommandTab) => `${uid}-panel-${id}`;

  // Standard tablist keyboard model: arrows move, Home/End jump.
  function onTabListKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const current = TABS.findIndex((t) => t.id === tab);
    if (current < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight') next = (current + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (current - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const nextId = TABS[next].id;
    onTabChange(nextId);
    tabRefs.current[nextId]?.focus();
  }

  // Chat owns its own scroller (so its composer stays pinned and the message
  // list is the only thing that scrolls — the old layout stacked three nested
  // scrollers and only kept the composer in place by accident of height).
  // The content-style tabs scroll here instead, so each tab has exactly one.
  const panelBodyClass = (id: CommandTab) =>
    id === 'chat'
      ? 'h-full min-h-0 overflow-hidden'
      : 'h-full min-h-0 overflow-y-auto scrollbar-thin';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={titles[tab]}
      side={side}
      // The tab bar is the panel's visible heading, and exactly one scroller is
      // decided per tab below — so the Sheet body must not scroll at all.
      scrollBody={false}
      showHeading={false}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div
          role="tablist"
          aria-label="Session panels"
          onKeyDown={onTabListKeyDown}
          className="flex shrink-0 items-center gap-1 px-3 pb-2"
        >
          {TABS.map((t) => {
            const isActive = t.id === tab;
            return (
              <button
                key={t.id}
                ref={(el) => { tabRefs.current[t.id] = el; }}
                type="button"
                role="tab"
                id={tabId(t.id)}
                aria-selected={isActive}
                aria-controls={panelId(t.id)}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onTabChange(t.id)}
                className={`${TAB_CLASS} ${isActive ? TAB_ACTIVE : TAB_IDLE}`}
              >
                {t.icon}
                <span>{t.label}</span>
                {t.id === 'chat' && chatUnread ? (
                  <span className="min-w-[18px] rounded-full bg-accent-500 px-1 py-0.5 text-[10px] font-bold leading-none text-white">
                    {chatUnread > 9 ? '9+' : chatUnread}
                  </span>
                ) : null}
                {t.id === 'people' && typeof peopleCount === 'number' ? (
                  <span className="text-[11px] font-semibold text-titanium-400">{peopleCount}</span>
                ) : null}
              </button>
            );
          })}
        </div>
        <span className="jc-hairline shrink-0" aria-hidden />
        <div className="min-h-0 flex-1">
          {TABS.map((t) => (
            <div
              key={t.id}
              role="tabpanel"
              id={panelId(t.id)}
              aria-labelledby={tabId(t.id)}
              hidden={t.id !== tab}
              className={panelBodyClass(t.id)}
            >
              {slots[t.id]}
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
