import type { SocialKey } from "@/lib/site/footer-config";

/**
 * FOOTER-1 — social LINE icons (stroke, currentColor, 20 px; decorative: the link carries the aria-label). The project
 * icon set (lucide) has no brand marks, so these are simple outline drawings — no emoji, no colour logos.
 */
export function SocialIcon({ network }: { network: SocialKey }) {
  const p = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, focusable: false };
  switch (network) {
    case "youtube":
      return (
        <svg {...p}>
          <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
          <path d="M10 9.2v5.6l4.8-2.8z" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...p}>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <path d="M17.3 6.7h.01" />
        </svg>
      );
    case "telegram":
      return (
        <svg {...p}>
          <path d="M21 4 3 11l6 2.2L18 7l-7 7.2.1 5.3 3-3.2 4 3z" />
        </svg>
      );
    case "twitter":
      return (
        <svg {...p}>
          <path d="M4 4l16 16M20 4 4 20" />
        </svg>
      );
    case "linkedin":
      return (
        <svg {...p}>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M8 10.5V16M8 7.5v.01M12 16v-5.5M12 13c0-1.7 1-2.5 2.2-2.5S16 11.3 16 13v3" />
        </svg>
      );
    case "facebook":
      return (
        <svg {...p}>
          <path d="M14 21v-8h3l.5-3.5H14V7.8c0-1 .4-1.8 1.8-1.8h1.8V3a20 20 0 0 0-2.6-.2c-2.6 0-4.3 1.6-4.3 4.5v2.2H7.8V13H10.7v8" />
        </svg>
      );
    case "whatsapp":
      return (
        <svg {...p}>
          <path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.5z" />
          <path d="M9 8.8c0 3.3 2.9 6.2 6.2 6.2l1-1.5-2-1-1 .9a5 5 0 0 1-2.6-2.6l.9-1-1-2z" />
        </svg>
      );
  }
}
