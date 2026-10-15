"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Tag } from "@/components/ui/tag";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui/cn";
import contrast from "@/components/ui/contrast-pairs.json";

/** Reads a token's computed value so the preview never duplicates hex values. */
function useTokenValue(name: string) {
  const [v, setV] = useState("");
  useEffect(() => {
    setV(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
  }, [name]);
  return v;
}

export function TokenValue({ name }: { name: string }) {
  const v = useTokenValue(name);
  return <span className="font-mono text-caption text-fg-secondary">{v || "…"}</span>;
}

// ---------- contrast (WCAG 2.x relative luminance), computed live from the tokens ----------
function toRgb(color: string): [number, number, number] | null {
  const c = document.createElement("canvas").getContext("2d");
  if (!c) return null;
  c.fillStyle = "#000";
  c.fillStyle = color;
  const hex = c.fillStyle as string;
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}
const lum = ([r, g, b]: [number, number, number]) => {
  const f = (x: number) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: [number, number, number], b: [number, number, number]) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const tokenName = (n: string) => (n === "white" ? "fg-inverse" : n);
const tokenVar = (n: string) => `var(--color-${tokenName(n)})`;
const NEED: Record<string, number> = { text: 4.5, large: 3, nontext: 3 };

export function ContrastTable() {
  const [rows, setRows] = useState<Array<{ use: string; fg: string; bg: string; kind: string; r: number | null }>>([]);
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const resolve = (n: string) => cs.getPropertyValue(`--color-${tokenName(n)}`).trim();
    setRows(
      contrast.pairs.map((p) => {
        const a = toRgb(resolve(p.fg));
        const b = toRgb(resolve(p.bg));
        return { ...p, r: a && b ? ratio(a, b) : null };
      }),
    );
  }, []);
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <table className="w-full min-w-[40rem] text-left text-body-sm">
        <caption className="sr-only">Contrast ratios of every token pair the design system uses</caption>
        <thead className="bg-surface-sunken text-fg-secondary">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Sample</th>
            <th scope="col" className="px-3 py-2 font-medium">Use</th>
            <th scope="col" className="px-3 py-2 font-medium">Pair</th>
            <th scope="col" className="px-3 py-2 font-medium">Ratio</th>
            <th scope="col" className="px-3 py-2 font-medium">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((p) => {
            const need = NEED[p.kind];
            const pass = need ? (p.r ?? 0) >= need : null;
            return (
              <tr key={`${p.fg}-${p.bg}-${p.use}`}>
                <td className="px-3 py-2">
                  {/* Swatch colours come from tokens at runtime (CSS variables), not literals. */}
                  <span
                    aria-hidden="true"
                    data-contrast-sample=""
                    className="inline-flex h-8 w-16 items-center justify-center rounded-badge border border-line text-body-sm font-semibold"
                    style={{ color: tokenVar(p.fg), background: tokenVar(p.bg) }}
                  >
                    Aa
                  </span>
                </td>
                <td className="px-3 py-2 text-fg">{p.use}</td>
                <td className="px-3 py-2 font-mono text-caption text-fg-secondary">
                  {p.fg} / {p.bg}
                </td>
                <td className="px-3 py-2 tabular-nums text-fg">{p.r ? `${p.r.toFixed(2)}:1` : "…"}</td>
                <td className={cn("px-3 py-2 font-medium", pass === false ? "text-danger-700" : pass ? "text-success-700" : "text-fg-secondary")}>
                  {pass === null ? (p.kind === "decorative" ? "Decorative only" : "Exempt (disabled)") : pass ? `Pass (${p.kind}, ≥${need})` : `Fail (${p.kind}, ≥${need})`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------- stateful demos ----------
export function DialogDemos() {
  const [open, setOpen] = useState<null | "modal" | "sheet" | "confirm">(null);
  const close = () => setOpen(null);
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" onClick={() => setOpen("modal")}>
        Open modal
      </Button>
      <Button variant="secondary" onClick={() => setOpen("sheet")}>
        Open sheet
      </Button>
      <Button variant="secondary" onClick={() => setOpen("confirm")}>
        Open submit confirmation
      </Button>
      <Dialog
        open={open === "modal"}
        onOpenChange={(o) => !o && close()}
        title="Leave this page?"
        description="Your notes are saved. You can come back to this topic any time."
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Stay
            </Button>
            <Button onClick={close}>Leave</Button>
          </>
        }
      />
      <Dialog
        open={open === "sheet"}
        onOpenChange={(o) => !o && close()}
        variant="sheet"
        title="Filter mocks"
        description="Bottom sheet on phones, centred dialog from tablet width."
        footer={<Button onClick={close}>Show results</Button>}
      >
        <p className="text-fg-secondary">Filters go here.</p>
      </Dialog>
      <Dialog
        open={open === "confirm"}
        onOpenChange={(o) => !o && close()}
        dismissible={false}
        title="Submit test?"
        description="You answered 82 of 100 questions. You cannot change answers after submitting."
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Back to test
            </Button>
            <Button onClick={close}>Submit test</Button>
          </>
        }
      />
    </div>
  );
}

function ToastButtons() {
  const { show } = useToast();
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" onClick={() => show({ tone: "success", title: "Answer saved", description: "Question 12 of 100." })}>
        Success toast
      </Button>
      <Button variant="secondary" onClick={() => show({ tone: "info", title: "New mock available", description: "SSC CGL Tier 1 · Mock 5." })}>
        Info toast
      </Button>
      <Button variant="secondary" onClick={() => show({ tone: "error", title: "Could not save", description: "Check your connection. We will retry." })}>
        Error toast (persistent)
      </Button>
    </div>
  );
}

export function ToastDemo() {
  return (
    <ToastProvider>
      <ToastButtons />
    </ToastProvider>
  );
}

export function TagDemo() {
  const [tags, setTags] = useState(["Percentage", "Profit and loss", "Time and work"]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.map((t) => (
        <Tag key={t} label={t} tone="primary" onRemove={() => setTags((cur) => cur.filter((x) => x !== t))} />
      ))}
      {tags.length === 0 && (
        <Button size="sm" variant="ghost" onClick={() => setTags(["Percentage", "Profit and loss", "Time and work"])}>
          Reset tags
        </Button>
      )}
    </div>
  );
}

export function LoadingButtonDemo() {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      loading={loading}
      onClick={() => {
        setLoading(true);
        setTimeout(() => setLoading(false), 2000);
      }}
    >
      Save answer
    </Button>
  );
}
