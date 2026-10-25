"use client";

/**
 * AUTH-1 2b-3 — TOTP enrol / verify with Supabase Auth MFA (browser client; the factor secret never touches our server or
 * database). Flow: no verified factor → "Set up" (enrol → QR + key → enter a code) · verified factor at AAL1 → enter a
 * code → AAL2 → continue. Plain English, 48 px controls, results announced; never shows the secret after setup.
 */
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
// the app's typed browser factory (returns AppSupabaseClient = SupabaseClient<Database>, TYPES-1 B6)
import { createClient as browserSupabase } from "@/lib/supabase/client";

type Stage = { kind: "loading" } | { kind: "enrol" } | { kind: "scan"; factorId: string; qr: string; secret: string } | { kind: "verify"; factorId: string } | { kind: "done" } | { kind: "error"; message: string };

export function AdminMfaPanel({ next }: { next: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    const sb = browserSupabase();
    (async () => {
      const [{ data: aal }, { data: factors, error }] = await Promise.all([sb.auth.mfa.getAuthenticatorAssuranceLevel(), sb.auth.mfa.listFactors()]);
      if (error) return setStage({ kind: "error", message: "Could not read your authenticator status. Reload the page." });
      const verified = (factors?.totp ?? []).find((f) => f.status === "verified");
      if (aal?.currentLevel === "aal2") return setStage({ kind: "done" });
      setStage(verified ? { kind: "verify", factorId: verified.id } : { kind: "enrol" });
    })();
  }, []);

  const enrol = () =>
    start(async () => {
      const sb = browserSupabase();
      const { data: list } = await sb.auth.mfa.listFactors();
      // a half-finished setup leaves an unverified factor: remove it before starting again
      for (const f of (list?.all ?? []).filter((x) => x.factor_type === "totp" && x.status !== "verified")) await sb.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `Courage Library admin ${new Date().toISOString().slice(0, 10)}` });
      if (error || !data) return setMsg("Could not start the setup. Please try again.");
      setStage({ kind: "scan", factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    });

  const verify = (factorId: string) =>
    start(async () => {
      const sb = browserSupabase();
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
      if (error) return setMsg("That code did not work. Check the time on your phone and try the newest code.");
      setCode("");
      setStage({ kind: "done" });
      router.replace(next);
      router.refresh();
    });

  const codeField = (factorId: string) => (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        verify(factorId);
      }}
    >
      <label htmlFor="mfa-code" className="text-body-sm font-medium text-fg">
        6-digit code from your authenticator app
      </label>
      <input
        id="mfa-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        className="focus-ring min-h-12 w-40 rounded-control border border-line-control bg-surface px-3 text-body tracking-widest text-fg"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
      />
      <div>
        <Button type="submit" size="lg" className="min-h-12" disabled={pending || code.length !== 6}>
          Verify
        </Button>
      </div>
    </form>
  );

  return (
    <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6" data-admin-mfa={stage.kind}>
      {stage.kind === "loading" && <p className="text-body text-fg-secondary">Checking your authenticator…</p>}
      {stage.kind === "error" && <p className="text-body text-danger-700">{stage.message}</p>}
      {stage.kind === "enrol" && (
        <>
          <p className="text-body text-fg">No authenticator is set up for this account yet.</p>
          <div>
            <Button size="lg" className="min-h-12" disabled={pending} onClick={enrol}>
              Set up authenticator app
            </Button>
          </div>
        </>
      )}
      {stage.kind === "scan" && (
        <>
          <p className="text-body text-fg">Scan this code with your authenticator app, then enter the 6-digit code it shows.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={stage.qr} alt="QR code for your authenticator app" className="size-48 rounded-control border border-line bg-white p-2" />
          <p className="text-body-sm text-fg-secondary">
            Can&apos;t scan? Enter this key by hand: <code className="break-all font-mono text-fg">{stage.secret}</code>
          </p>
          {codeField(stage.factorId)}
        </>
      )}
      {stage.kind === "verify" && (
        <>
          <p className="text-body text-fg">Enter the code from your authenticator app to continue.</p>
          {codeField(stage.factorId)}
        </>
      )}
      {stage.kind === "done" && <p className="text-body text-fg">Two-step verification is active for this session.</p>}
      <p role="status" className="text-body-sm text-fg-secondary">
        {msg}
      </p>
    </div>
  );
}
