import { IconShapes, type LandingIconKey } from "./icons";

/**
 * LANDING-1 hero: the improvement-loop diagram (inline SVG, server-rendered, no JS). Two drawings exactly as in the
 * reference: a wide ellipse (desktop / tablet) and a circle (phone); CSS shows one. The SVGs are decorative copies of
 * the text alternative, which screen readers get once (role="img" + aria-label on the wrapper). Colours come from the
 * cl-* tokens (CSS variables), the centre mark is the FINAL logo-suite file (never redrawn or recoloured).
 */
const ICONS: LandingIconKey[] = ["learn", "prac", "mock", "weak", "fix", "up"];
const MARK = "/brand/courage-library-logo-suite/svg/mark.svg";
const f1 = (n: number) => Math.round(n * 10) / 10;

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-bl`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" style={{ stopColor: "var(--cl-step-start)" }} />
        <stop offset="1" style={{ stopColor: "var(--cl-step-end)" }} />
      </linearGradient>
      <linearGradient id={`${id}-co`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" style={{ stopColor: "var(--cl-win-start)" }} />
        <stop offset="1" style={{ stopColor: "var(--cl-win-end)" }} />
      </linearGradient>
      <radialGradient id={`${id}-gl`}>
        <stop offset="0" style={{ stopColor: "var(--color-cl-blue)", stopOpacity: 0.16 }} />
        <stop offset="1" style={{ stopColor: "var(--color-cl-blue)", stopOpacity: 0 }} />
      </radialGradient>
      <marker id={`${id}-ar`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M1 1 9 5 1 9" fill="none" className="lp-loop__arrowhead" strokeWidth="1.6" strokeLinecap="round" />
      </marker>
    </defs>
  );
}

function Node({ id, x, y, r, i, label, labelY, iconScale, iconShift, fontSize }: {
  id: string; x: number; y: number; r: number; i: number; label: string; labelY: number; iconScale: number; iconShift: number; fontSize: number;
}) {
  const win = i === 5;
  return (
    <g transform={`translate(${f1(x)} ${f1(y)})`}>
      <circle r={r} fill={`url(#${id}-${win ? "co" : "bl"})`} />
      <g transform={`translate(${-iconShift} ${-iconShift}) scale(${iconScale})`} fill="none" className="lp-loop__icon" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <IconShapes k={ICONS[i]} />
      </g>
      <text y={labelY} textAnchor="middle" fontSize={fontSize} fontWeight="600" className={win ? "lp-loop__label lp-loop__label--win" : "lp-loop__label"}>
        {label}
      </text>
    </g>
  );
}

export function LoopDiagram({ labels, tagline, alt }: { labels: readonly string[]; tagline: string; alt: string }) {
  // wide: an ellipse (reference loop(); 720 × 330)
  const cx = 360, cy = 150, rx = 270, ry = 105;
  const pt = (a: number) => [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as const;
  const arc = (a0: number, a1: number) => {
    const [x0, y0] = pt(a0);
    const [x1, y1] = pt(a1);
    return `M ${f1(x0)} ${f1(y0)} A ${rx} ${ry} 0 0 1 ${f1(x1)} ${f1(y1)}`;
  };
  // tall: a circle (reference loopTall(); 360 × 380)
  const tcx = 180, tcy = 180, tr = 125;
  return (
    <div className="lp-loopcard" role="img" aria-label={alt}>
      <svg className="lp-loop lp-loop--wide" viewBox="0 0 720 330" aria-hidden="true" focusable="false">
        <Defs id="lw" />
        <ellipse cx={cx} cy={cy} rx="200" ry="110" fill="url(#lw-gl)" />
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" className="lp-loop__track" strokeWidth="2" strokeDasharray="6 7" />
        <path d={arc(-0.15, 0.05)} fill="none" className="lp-loop__arrow" strokeWidth="2" markerEnd="url(#lw-ar)" />
        <path d={arc(Math.PI + 0.05, Math.PI + 0.25)} fill="none" className="lp-loop__arrow" strokeWidth="2" markerEnd="url(#lw-ar)" />
        <image href={MARK} x={cx - 22} y={cy - 44} width="44" height="44" />
        <text x={cx} y={cy + 26} textAnchor="middle" fontSize="19" fontWeight="700" className="lp-loop__tagline">
          {tagline}
        </text>
        {labels.map((label, i) => {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / 6 + Math.PI / 6;
          const [x, y] = pt(a);
          return <Node key={i} id="lw" x={x} y={y} r={30} i={i} label={label} labelY={52} iconScale={0.87} iconShift={13} fontSize={15} />;
        })}
      </svg>
      <svg className="lp-loop lp-loop--tall" viewBox="0 0 360 380" aria-hidden="true" focusable="false">
        <Defs id="lt" />
        <g transform="translate(0 6)">
          <circle cx={tcx} cy={tcy} r="95" fill="url(#lt-gl)" />
          <circle cx={tcx} cy={tcy} r={tr} fill="none" className="lp-loop__track" strokeWidth="2" strokeDasharray="6 7" />
          <image href={MARK} x={tcx - 20} y={tcy - 40} width="40" height="40" />
          <text x={tcx} y={tcy + 22} textAnchor="middle" fontSize="16" fontWeight="700" className="lp-loop__tagline">
            {tagline}
          </text>
          {labels.map((label, i) => {
            const a = -Math.PI / 2 + (i * 2 * Math.PI) / 6;
            const x = tcx + tr * Math.cos(a);
            const y = tcy + tr * Math.sin(a);
            const ly = i === 0 ? -38 : i === 3 ? 50 : 44;
            return <Node key={i} id="lt" x={x} y={y} r={27} i={i} label={label} labelY={ly} iconScale={0.8} iconShift={12} fontSize={14} />;
          })}
        </g>
      </svg>
    </div>
  );
}
