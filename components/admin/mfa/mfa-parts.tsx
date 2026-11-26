import { Check, ShieldCheck } from "lucide-react";
import { Icon } from "@/components/icons/icon";

/**
 * ADMIN-MFA-UX-1 — presentational pieces of /admin/mfa (no state, no Supabase): the brand-panel content (§1.1) and the
 * 3-step indicator (§2.4). The panel and the steps are text + colour, never colour alone.
 */

export const MFA_STEPS = ["Install app", "Scan code", "Enter code"] as const;
/** phones (< 640 px): the short labels of the reference, so the row fits at 360 px */
const MFA_STEPS_SHORT = ["Install", "Scan", "Code"] as const;

export function MfaSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="flex items-center gap-2 text-[12.5px] font-semibold text-cl-slate" aria-label="Setup progress" data-mfa-steps={current}>
      {MFA_STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "upcoming";
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2 last:flex-none" aria-current={state === "current" ? "step" : undefined} data-step-state={state}>
            <span className={`flex items-center gap-1.5 whitespace-nowrap ${state === "current" ? "text-cl-charcoal" : ""}`}>
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full border-[1.5px] text-[11.5px] ${
                  state === "done" ? "border-cl-result-green bg-cl-result-green-surface text-cl-result-green-text" : state === "current" ? "border-cl-blue bg-cl-blue text-cl-white" : "border-cl-line-2"
                }`}
              >
                {state === "done" ? <Icon icon={Check} size={13} /> : n}
              </span>
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{MFA_STEPS_SHORT[i]}</span>
              <span className="sr-only">{state === "done" ? " (done)" : state === "current" ? " (current step)" : ""}</span>
            </span>
            {n < 3 && <span aria-hidden="true" className={`h-0.5 min-w-3 flex-1 ${state === "done" ? "bg-cl-result-green" : "bg-cl-line"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

export const MFA_PANEL_POINTS = ["Takes about 2 minutes, once", "Works offline in your authenticator app", "Asked again only on new sign-ins"] as const;

/** the brand panel content (≥ 1024 px only — AuthShell hides the panel on phones) */
export function MfaBrandPanel({ mode }: { mode: "setup" | "return" }) {
  return (
    <div className="flex flex-col gap-[18px]" data-mfa-panel={mode}>
      <span className="flex size-[72px] items-center justify-center rounded-[22px] bg-white/15">
        <Icon icon={ShieldCheck} size={38} className="text-cl-white" />
      </span>
      {mode === "setup" ? (
        <>
          <p className="font-heading text-[34px] font-semibold leading-[1.15]">
            <b className="font-semibold">Admin studio</b> <span className="opacity-75">is protected.</span>
          </p>
          <p className="cl-auth__sentence">Two-step verification keeps question banks, results and student data safe, even if a password leaks.</p>
          <ol className="cl-auth__features">
            {MFA_PANEL_POINTS.map((t, i) => (
              <li key={t}>
                <span className="flex size-[26px] items-center justify-center rounded-lg bg-white/15 text-[13px]">{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <>
          <p className="font-heading text-[34px] font-semibold leading-[1.15]">
            <b className="font-semibold">One more step</b> <span className="opacity-75">to the admin studio.</span>
          </p>
          <p className="cl-auth__sentence">Open your authenticator app and enter the current code for Courage Library.</p>
        </>
      )}
    </div>
  );
}
