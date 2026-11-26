"use client";

/**
 * AUTH-1 2b-3 — TOTP enrol / verify with Supabase Auth MFA (browser client; the factor secret never touches our server or
 * database). ADMIN-MFA-UX-1 (docs/design/ADMIN_MFA_UX_V1_SPEC.md) redesigns the SCREENS only; the calls are unchanged:
 *   load:   getAuthenticatorAssuranceLevel + listFactors → AAL2 already / a verified factor (return screen) / none (setup)
 *   setup:  step 1 (install, no call) → "I have an app — next": listFactors → unenroll every UNVERIFIED totp factor (a
 *           half-finished setup is cleaned up, never reused — a refresh mid-setup can never pile up factors) → enroll →
 *           step 2 (QR + key, in memory only) → step 3 (code) → challengeAndVerify → "You're protected" → validated next
 *   return: one screen: code → challengeAndVerify → validated next
 * The secret and QR live only in this component's state while setup is open (never logged, stored or sent anywhere but
 * Supabase); the return screen never has them. `next` arrives already sanitized by the server page (sanitizeAdminNext).
 */
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, ShieldCheck } from "lucide-react";
import { Icon } from "@/components/icons/icon";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthAlert, AuthHeading, FieldError, PRIMARY_BUTTON_CLASS } from "@/components/auth/auth-ui";
import { OtpInput } from "@/components/admin/mfa/otp-input";
import { MfaBrandPanel, MfaSteps } from "@/components/admin/mfa/mfa-parts";
import { MFA_COPY, groupKey, mfaErrorKind, mfaErrorMessage, type MfaErrorKind } from "@/lib/auth/mfa-ui";
// the app's typed browser factory (returns AppSupabaseClient = SupabaseClient<Database>, TYPES-1 B6)
import { createClient as browserSupabase } from "@/lib/supabase/client";

type Enrolment = { factorId: string; qr: string; secret: string };
export type MfaStage =
  | { kind: "loading" }
  | { kind: "fatal"; message: string }
  | { kind: "already" }
  | { kind: "install" }
  | ({ kind: "scan" } & Enrolment)
  | ({ kind: "code" } & Enrolment)
  | { kind: "success" }
  | { kind: "verify"; factorId: string }
  | { kind: "continuing" };

/** fixture only (app/(site)/dev/admin-mfa-fixture): a fixed screen, no Supabase call, every action inert */
export interface MfaPreview {
  stage: MfaStage;
  error?: MfaErrorKind;
  code?: string;
}

const SECONDARY_BUTTON_CLASS =
  "focus-ring inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-cl-line bg-cl-white px-5 text-body font-semibold text-cl-charcoal hover:bg-cl-cloud disabled:cursor-not-allowed disabled:opacity-60";
const APPS = ["Google Authenticator", "Microsoft Authenticator", "1Password"] as const;

export function AdminMfaPanel({ next, maskedEmail, account, helpHref, preview }: { next: string; maskedEmail: string; account: ReactNode; helpHref: string | null; preview?: MfaPreview }) {
  const router = useRouter();
  const [stage, setStage] = useState<MfaStage>(preview?.stage ?? { kind: "loading" });
  const [code, setCode] = useState(preview?.code ?? "");
  const [error, setError] = useState<MfaErrorKind | "start-failed" | null>(preview?.error ?? null);
  const [copied, setCopied] = useState("");
  const [pending, start] = useTransition();
  const codeRef = useRef<HTMLInputElement>(null);
  const errId = useId();

  useEffect(() => {
    if (preview) return;
    const sb = browserSupabase();
    (async () => {
      const [{ data: aal }, { data: factors, error }] = await Promise.all([sb.auth.mfa.getAuthenticatorAssuranceLevel(), sb.auth.mfa.listFactors()]);
      if (error) return setStage({ kind: "fatal", message: MFA_COPY.statusFailed });
      const verified = (factors?.totp ?? []).find((f) => f.status === "verified");
      if (aal?.currentLevel === "aal2") return setStage({ kind: "already" });
      setStage(verified ? { kind: "verify", factorId: verified.id } : { kind: "install" });
    })();
  }, [preview]);

  const goNext = () => {
    if (preview) return;
    router.replace(next);
    router.refresh();
  };

  const enrol = () =>
    start(async () => {
      if (preview) return;
      setError(null);
      const sb = browserSupabase();
      const { data: list } = await sb.auth.mfa.listFactors();
      // a half-finished setup leaves an unverified factor: remove it before starting again
      for (const f of (list?.all ?? []).filter((x) => x.factor_type === "totp" && x.status !== "verified")) await sb.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `Courage Library admin ${new Date().toISOString().slice(0, 10)}` });
      if (error || !data) return setError("start-failed");
      setStage({ kind: "scan", factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    });

  const verify = (factorId: string, setup: boolean) =>
    start(async () => {
      if (preview) return;
      const sb = browserSupabase();
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
      if (error) {
        const kind = mfaErrorKind(error);
        setCode("");
        if (kind === "expired" && setup) {
          setStage({ kind: "install" });
          setError("expired");
          return;
        }
        setError(kind);
        codeRef.current?.focus();
        return;
      }
      setCode("");
      setError(null);
      // the secret / QR leave state here: success and continuing hold neither
      if (setup) setStage({ kind: "success" });
      else {
        setStage({ kind: "continuing" });
        router.replace(next);
        router.refresh();
      }
    });

  const copyKey = async (secret: string) => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied("Copied");
    } catch {
      setCopied("Couldn't copy. Select the key and copy it by hand.");
    }
  };

  const codeError = error && error !== "start-failed" && error !== "expired" ? mfaErrorMessage(error) : null;
  const codeForm = (factorId: string, setup: boolean, submitLabel: string) => (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === 6) verify(factorId, setup);
      }}
    >
      <OtpInput
        ref={codeRef}
        id="mfa-code"
        label="6-digit code"
        value={code}
        onChange={(v) => {
          setCode(v);
          if (error) setError(null);
        }}
        invalid={Boolean(codeError)}
        describedBy={codeError ? errId : undefined}
        disabled={pending}
      />
      {/* reserved space: showing an error never moves the button (no layout shift) */}
      <div className="min-h-11" aria-live="assertive">
        {codeError && <FieldError id={errId}>{codeError}</FieldError>}
      </div>
      <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={pending || code.length !== 6}>
        {pending ? "Checking…" : submitLabel}
      </button>
    </form>
  );

  const mode = stage.kind === "install" || stage.kind === "scan" || stage.kind === "code" || stage.kind === "success" ? "setup" : "return";
  const helpLink = helpHref ? (
    <a href={helpHref} className="focus-ring rounded font-semibold text-cl-blue-text hover:underline">
      {mode === "setup" ? "Get help" : "Contact support"}
    </a>
  ) : null;

  return (
    <AuthShell earlyAccess={false} panel={<MfaBrandPanel mode={mode} />} panelLabel="Why two-step verification">
      <div className="flex flex-col gap-5" data-admin-mfa={stage.kind}>
        {account}

        {stage.kind === "loading" && <AuthHeading title="Two-step verification" sub="Checking your authenticator…" />}

        {stage.kind === "fatal" && (
          <>
            <AuthHeading title="Two-step verification" sub="Required for the admin studio." />
            <AuthAlert id="mfa-fatal">{stage.message}</AuthAlert>
          </>
        )}

        {stage.kind === "already" && (
          <>
            <AuthHeading title="You're already verified" sub="Two-step verification is active for this session." />
            <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={goNext}>
              Go to admin studio
            </button>
          </>
        )}

        {stage.kind === "install" && (
          <>
            <AuthHeading title="Set up" muted="two-step verification" sub="Required for the admin studio." />
            <MfaSteps current={1} />
            {error === "expired" && <AuthAlert id="mfa-expired">{MFA_COPY.expired}</AuthAlert>}
            {error === "start-failed" && <AuthAlert id="mfa-start">{MFA_COPY.startFailed}</AuthAlert>}
            <p className="text-body text-cl-slate">Install any authenticator app on your phone:</p>
            <ul className="flex flex-wrap gap-2" aria-label="Authenticator apps">
              {APPS.map((a) => (
                <li key={a} className="inline-flex h-8 items-center rounded-full border border-cl-line bg-cl-cloud px-3 text-[12.5px] font-medium text-cl-charcoal">
                  {a}
                </li>
              ))}
            </ul>
            <p className="text-body-sm text-cl-slate sm:hidden">On a phone? You&apos;ll get a setup key to copy instead of a QR code.</p>
            <button type="button" className={PRIMARY_BUTTON_CLASS} disabled={pending} onClick={enrol}>
              {pending ? "Starting…" : "I have an app — next"}
            </button>
          </>
        )}

        {stage.kind === "scan" && (
          <>
            <AuthHeading title="Set up" muted="two-step verification" sub="Required for the admin studio." />
            <MfaSteps current={2} />
            <div className="grid gap-4 rounded-2xl border border-cl-line bg-cl-cloud p-3.5 sm:grid-cols-[150px_1fr] sm:items-center" data-mfa-setup="">
              {/* eslint-disable-next-line @next/next/no-img-element -- the QR is an SVG data URI from the Supabase enrol response */}
              <img src={stage.qr} alt="QR code for your authenticator app" width={150} height={150} className="hidden size-[150px] rounded-xl border border-cl-line bg-white p-2.5 sm:block" />
              <div className="flex min-w-0 flex-col gap-2">
                <p className="text-body-sm font-semibold text-cl-charcoal">
                  <span className="hidden sm:inline">Scan with your authenticator app</span>
                  <span className="sm:hidden">Add this key to your authenticator app</span>
                </p>
                <p className="text-body-sm text-cl-slate">
                  <span className="hidden sm:inline">Can&apos;t scan? Enter this setup key instead:</span>
                  <span className="sm:hidden">Choose &ldquo;Enter a setup key&rdquo; in the app and paste it:</span>
                </p>
                <code className="break-all rounded-[10px] border border-dashed border-cl-blue-line bg-cl-white px-2.5 py-2 font-mono text-[13px] font-semibold tracking-[0.06em] text-cl-blue-deep" data-mfa-key="">
                  {groupKey(stage.secret)}
                </code>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => copyKey(stage.secret)} className="focus-ring inline-flex h-12 items-center gap-1.5 rounded-full border-[1.5px] border-cl-line bg-cl-white px-4 text-body-sm font-semibold text-cl-charcoal hover:bg-cl-cloud">
                    <Icon icon={Copy} size={16} />
                    Copy key
                  </button>
                  <span role="status" aria-live="polite" className="text-body-sm font-medium text-cl-result-green-text">
                    {copied}
                  </span>
                </div>
              </div>
            </div>
            <button
              type="button"
              className={PRIMARY_BUTTON_CLASS}
              onClick={() => {
                setCopied("");
                setStage({ kind: "code", factorId: stage.factorId, qr: stage.qr, secret: stage.secret });
              }}
            >
              I&apos;ve scanned it — next
            </button>
          </>
        )}

        {stage.kind === "code" && (
          <>
            <AuthHeading title="Enter the code" sub="6 digits from your authenticator app." />
            <MfaSteps current={3} />
            {codeForm(stage.factorId, true, "Verify and finish")}
            <button
              type="button"
              className={SECONDARY_BUTTON_CLASS}
              onClick={() => {
                // back to the SAME enrolment (no new factor)
                setError(null);
                setCode("");
                setStage({ kind: "scan", factorId: stage.factorId, qr: stage.qr, secret: stage.secret });
              }}
            >
              <Icon icon={ArrowLeft} size={18} />
              Back to scan
            </button>
          </>
        )}

        {stage.kind === "success" && (
          <div className="flex flex-col items-center gap-4 text-center" data-mfa-success="">
            <span className="flex size-16 items-center justify-center rounded-[20px] bg-cl-result-green-surface">
              <Icon icon={ShieldCheck} size={34} className="text-cl-result-green-text" />
            </span>
            <AuthHeading title="You're protected" sub={`Two-step verification is on for ${maskedEmail}. Next time you'll only need the 6-digit code.`} />
            <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={goNext}>
              Go to admin studio
            </button>
            <p className="text-body-sm text-cl-slate">Tip: add a second device in your authenticator app as a backup.</p>
          </div>
        )}

        {stage.kind === "verify" && (
          <>
            <AuthHeading title="Enter your code" sub="6 digits from your authenticator app." />
            {codeForm(stage.factorId, false, "Verify and continue")}
          </>
        )}

        {stage.kind === "continuing" && <AuthHeading title="Verified" sub="Opening the admin studio…" />}

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-body-sm text-cl-slate" data-mfa-help="">
          {helpLink && (
            <span>
              {mode === "setup" ? "Trouble? " : "Lost your phone? "}
              {helpLink}
            </span>
          )}
          <Link href="/" className="focus-ring inline-flex min-h-12 items-center gap-1 rounded font-medium text-cl-slate hover:text-cl-charcoal">
            <Icon icon={ArrowLeft} size={16} />
            Back to the site
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
