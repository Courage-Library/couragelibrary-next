/**
 * LANDING-1 inline line icons (30 × 30 grid, from docs/design/landing-v1-reference.html). Stroke = currentColor, so the
 * colour comes from the CSS tokens (no colour literal here — BRAND-1 B-03). Decorative: aria-hidden.
 */
export const LANDING_ICON_PATHS = {
  ssc: "M7 4h11l4 4v16H7z M18 4v4h4 M10 13h9 M10 17h9 M10 21h6",
  bank: "M4 11 15 5l11 6 M6 11v11 M11 11v11 M19 11v11 M24 11v11 M3 24h24",
  rail: "M9 4h12a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z M6 13h18 M10 17h.01 M20 17h.01 M9 21l-3 5 M21 21l3 5",
  police: "M15 3 25 7v7c0 6-4.5 10-10 12C9.5 24 5 20 5 14V7z M11 14l3 3 6-6",
  def: "m15 4 3.1 6.4 7 1-5.1 4.9 1.2 7L15 20l-6.2 3.3 1.2-7L4.9 11.4l7-1z",
  teach: "M4 9 15 4l11 5-11 5z M8 11v6c2 2 4.5 3 7 3s5-1 7-3v-6 M26 9v7",
  psc: "M7 26V4 M7 5h15l-3.5 5L22 15H7",
  learn: "M5 6h8a3 3 0 0 1 3 3v16a2 2 0 0 0-2-2H5z M25 6h-8a3 3 0 0 0-3 3v16a2 2 0 0 1 2-2h9z",
  prac: "M6 25 20 11l4 4-14 14H6z M17 14l4 4 M22 5l3 3",
  weak: "M19 19l7 7 M13 9v5 M13 17h.01",
  fix: "M19 4a6 6 0 0 0-5.5 8.3L4 21.8 8.2 26l9.5-9.5A6 6 0 0 0 26 11l-4 1-3-3 1-4z",
  up: "M4 22l8-8 5 5 9-10 M19 9h7v7",
  shield: "M15 3 25 7v7c0 6-4.5 10-10 12C9.5 24 5 20 5 14V7z M10.5 10.5l9 9 M19.5 10.5l-9 9",
  check: "m10 15 3.5 3.5L20 12",
  refund: "M5 15a10 10 0 1 0 3-7 M5 4v5h5 M15 9v12 M18 11.5c-.8-1-2-1.5-3-1.5-1.7 0-3 .9-3 2.3 0 3.2 6 1.8 6 5 0 1.4-1.4 2.3-3 2.3-1.2 0-2.5-.6-3.2-1.6",
  lang: "M4 6h12 M10 4v2 M6.5 6c.8 4 3.5 7 7.5 8.5 M13.5 6C12.5 10 9.5 13 5 15 M17 26l5-12 5 12 M18.6 22h6.8",
  photo: "M10 6l2-3h6l2 3",
  pin: "M15 27s9-8.2 9-15a9 9 0 0 0-18 0c0 6.8 9 15 9 15z",
  mock: "M15 10v6l4 3 M12 3h6",
  all: "M21 17v8 M17 21h8",
} as const;

export type LandingIconKey = keyof typeof LANDING_ICON_PATHS;

/** Extra shapes (circles / rects) a few icons need, beside their path. */
function Extra({ k }: { k: LandingIconKey }) {
  switch (k) {
    case "mock":
      return <circle cx="15" cy="16" r="10" />;
    case "weak":
      return <circle cx="13" cy="13" r="8" />;
    case "check":
      return <circle cx="15" cy="15" r="11" />;
    case "photo":
      return (
        <>
          <rect x="3" y="6" width="24" height="18" rx="3" />
          <circle cx="15" cy="15" r="5" />
        </>
      );
    case "pin":
      return <circle cx="15" cy="12" r="3" />;
    case "all":
      return (
        <>
          <rect x="5" y="5" width="8" height="8" rx="2" />
          <rect x="17" y="5" width="8" height="8" rx="2" />
          <rect x="5" y="17" width="8" height="8" rx="2" />
        </>
      );
    default:
      return null;
  }
}

/** The shapes only (for use inside another SVG, e.g. the loop diagram). */
export function IconShapes({ k }: { k: LandingIconKey }) {
  return (
    <>
      <Extra k={k} />
      <path d={LANDING_ICON_PATHS[k]} />
    </>
  );
}

export function LandingIcon({ k, strokeWidth = 2, className, size }: { k: LandingIconKey; strokeWidth?: number; className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 30 30"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <IconShapes k={k} />
    </svg>
  );
}

/** The round tick used in lists and answers (fill = the token colour passed by CSS class). */
export function Tick({ muted = false }: { muted?: boolean }) {
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true" focusable="false" className={muted ? "lp-tick lp-tick--muted" : "lp-tick"}>
      <circle cx="11" cy="11" r="11" className="lp-tick__disc" />
      <path d="m6.5 11.2 3 3 6-6.4" fill="none" className="lp-tick__mark" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
