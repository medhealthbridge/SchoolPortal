/**
 * Inline stroke icons, drawn once. 16px uses stroke-width 2, 20px uses 1.5,
 * everything inherits currentColor, and every glyph is aria-hidden — the
 * label lives on the button.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={size >= 20 ? 1.5 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M8 3v4M16 3v4M4 10h16" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12.5l5 5L20 6.5" />
  </Svg>
);

export const ClipboardCheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 11l3 3 8-8" />
    <path d="M20 12v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1h11" />
  </Svg>
);

export const PeopleIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.5 3.5 0 010 6.4M18.5 14.9c1.7.8 2.7 2.5 3 5.1" />
  </Svg>
);

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

export const ReportIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M9 17v-4M12.5 17v-7M16 17v-2" />
  </Svg>
);

export const GridIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </Svg>
);

export const CardIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 10h18" />
  </Svg>
);

export const BuildingIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 21V5a1 1 0 011-1h9a1 1 0 011 1v16" />
    <path d="M15 10h4a1 1 0 011 1v10M2 21h20M8 8h3M8 12h3M8 16h3" />
  </Svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
  </Svg>
);

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4.5M12 16h.01" />
  </Svg>
);

export const InfoIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-4.5M12 8h.01" />
  </Svg>
);

export const OfflineIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3l18 18M8.5 16.5a5 5 0 017 0M5 13a10 10 0 014-2.5M19 13a10 10 0 00-4.5-2.7M2 9.5a15 15 0 014.5-3M22 9.5a15 15 0 00-10-4" />
  </Svg>
);

export const MenuIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const LockIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="10" width="16" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 118 0v3" />
  </Svg>
);
