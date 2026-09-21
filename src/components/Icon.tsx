import { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 24, children, ...rest }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ───── Individual icons (tree-shakeable named exports) ───── */

export const IconVideo = (p: IconProps) => (
  <Icon {...p}>
    <path d="m22 8-6 4 6 4V8Z" />
    <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
  </Icon>
);

export const IconVideoOff = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.66 5H14a2 2 0 0 1 2 2v3.34l1 1L22 7v10" />
    <path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2l10 10Z" />
    <line x1="2" x2="22" y1="2" y2="22" />
  </Icon>
);

export const IconMic = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </Icon>
);

export const IconMicOff = (p: IconProps) => (
  <Icon {...p}>
    <line x1="2" x2="22" y1="2" y2="22" />
    <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
    <path d="M5 10v2a7 7 0 0 0 12 5" />
    <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </Icon>
);

export const IconChat = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
  </Icon>
);

export const IconPen = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 19l7-7 3 3-7 7-3-3z" />
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
    <path d="M2 2l7.586 7.586" />
    <circle cx="11" cy="11" r="2" />
  </Icon>
);

export const IconArrow = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </Icon>
);

export const IconCircle = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
  </Icon>
);

export const IconLine = (p: IconProps) => (
  <Icon {...p}>
    <line x1="5" y1="19" x2="19" y2="5" />
  </Icon>
);

export const IconText = (p: IconProps) => (
  <Icon {...p}>
    <polyline points="4 7 4 4 20 4 20 7" />
    <line x1="9" y1="20" x2="15" y2="20" />
    <line x1="12" y1="4" x2="12" y2="20" />
  </Icon>
);

export const IconTrash = (p: IconProps) => (
  <Icon {...p}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </Icon>
);

export const IconFlipCamera = (p: IconProps) => (
  <Icon {...p}>
    <path d="M23 4v6h-6" />
    <path d="M1 20v-6h6" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
    <path d="M20.49 15A9 9 0 0 1 5.64 18.36L1 14" />
  </Icon>
);

export const IconPhoneOff = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
    <line x1="23" x2="1" y1="1" y2="23" />
  </Icon>
);

export const IconCopy = (p: IconProps) => (
  <Icon {...p}>
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </Icon>
);

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <polyline points="20 6 9 17 4 12" />
  </Icon>
);

export const IconAlert = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" x2="12" y1="9" y2="13" />
    <line x1="12" x2="12.01" y1="17" y2="17" />
  </Icon>
);

export const IconLogo = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
    <line x1="12" y1="3" x2="12" y2="6" />
    <line x1="12" y1="18" x2="12" y2="21" />
    <line x1="3" y1="12" x2="6" y2="12" />
    <line x1="18" y1="12" x2="21" y2="12" />
  </Icon>
);

export const IconCamera = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </Icon>
);

export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </Icon>
);

export const IconUsers = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Icon>
);

export const IconShare = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </Icon>
);

export const IconMore = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconChevronLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 18l-6-6 6-6" />
  </Icon>
);

export const IconCrosshair = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="7" />
    <line x1="12" y1="2" x2="12" y2="5" />
    <line x1="12" y1="19" x2="12" y2="22" />
    <line x1="2" y1="12" x2="5" y2="12" />
    <line x1="19" y1="12" x2="22" y2="12" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconTag = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 12L12 20a2 2 0 0 1-2.83 0L4 14.83A2 2 0 0 1 4 12V6a2 2 0 0 1 2-2h6a2 2 0 0 1 1.41.59l7 7" />
    <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconLock = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    <circle cx="12" cy="16" r="1.2" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconFollow = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6Z" />
    <circle cx="12" cy="12" r="3" />
    <path d="M12 8v-1" />
    <path d="M12 17v-1" />
  </Icon>
);

export const IconFreeze = (p: IconProps) => (
  <Icon {...p}>
    <line x1="12" y1="4" x2="12" y2="20" />
    <line x1="4.5" y1="8" x2="19.5" y2="16" />
    <line x1="19.5" y1="8" x2="4.5" y2="16" />
    <line x1="7" y1="6" x2="7.8" y2="7.5" />
    <line x1="17" y1="6" x2="16.2" y2="7.5" />
    <line x1="7" y1="18" x2="7.8" y2="16.5" />
    <line x1="17" y1="18" x2="16.2" y2="16.5" />
  </Icon>
);

export const IconAperture = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="7.5" />
    <path d="M12 12 16.5 5.5" />
    <path d="M12 12 18.2 9.2" />
    <path d="M12 12 18.2 14.8" />
    <path d="M12 12 16.5 18.5" />
    <path d="M12 12 7.5 18.5" />
    <path d="M12 12 5.8 14.8" />
    <path d="M12 12 5.8 9.2" />
    <path d="M12 12 7.5 5.5" />
  </Icon>
);

export const IconZoom = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <line x1="16.2" y1="16.2" x2="21" y2="21" />
    <line x1="11" y1="8" x2="11" y2="14" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </Icon>
);

export const IconLowLight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3a7 7 0 0 1 0 14 7 7 0 0 1 0-14Z" />
    <path d="M12 3a9 9 0 0 0 0 18 7 7 0 0 0 0-14Z" fill="currentColor" opacity="0.35" stroke="none" />
    <circle cx="12" cy="10" r="1" fill="currentColor" stroke="none" opacity="0.6" />
  </Icon>
);

export const IconImage = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="8.5" cy="10" r="1.7" />
    <path d="M3 15l5-5 4 3 3-2 3 4" />
  </Icon>
);

export const IconFileText = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="8" y1="13" x2="16" y2="13" />
    <line x1="8" y1="17" x2="14" y2="17" />
  </Icon>
);

export const IconWrench = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.7 6.3a3.5 3.5 0 0 0-4.95 0l-5 5a3.5 3.5 0 0 0 4.95 4.95l1.2-1.2 3.8 3.8 2-2-3.8-3.8 1.8-1.8 2-2-2-2-1.8 1.8Z" />
  </Icon>
);

export const IconVolume = (p: IconProps) => (
  <Icon {...p}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.08" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </Icon>
);

export const IconVolumeOff = (p: IconProps) => (
  <Icon {...p}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </Icon>
);

export const IconSettings = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 1v2.2" />
    <path d="M12 20.8V23" />
    <path d="M4.93 4.93l1.56 1.56" />
    <path d="M17.51 17.51l1.56 1.56" />
    <path d="M1 12h2.2" />
    <path d="M20.8 12H23" />
    <path d="M4.93 19.07l1.56-1.56" />
    <path d="M17.51 6.49l1.56-1.56" />
  </Icon>
);

export const IconInfo = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="10" x2="12" y2="16" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </Icon>
);

export const IconTool = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2.5" />
    <path d="M9 12h6" />
    <path d="M12 9v6" />
  </Icon>
);
