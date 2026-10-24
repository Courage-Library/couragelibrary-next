import type { ReactNode } from "react";

/**
 * BRAND-2 (decision #72): marks a "never glass" zone — the exam engine (attempt players, mistake drills), question
 * review and admin. app/globals.css turns every backdrop blur inside `[data-no-glass]` off (legacy blur classes
 * included), so these screens stay solid, focused and cheap on low-end phones. `display: contents` keeps the layout
 * exactly as it was. Enforced statically by scripts/test_brand2.cjs.
 */
export function NoGlassZone({ children }: { children: ReactNode }) {
  return (
    <div data-no-glass="" className="contents">
      {children}
    </div>
  );
}
