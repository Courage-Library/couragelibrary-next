"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatDateShort } from "@/lib/format";
import { clearAccessPolicyAction, setAccessPolicyAction, setPaywallAction, type AccessActionResult } from "./actions";

type Tier = "FREE" | "PRO";
interface Row {
  kind: string;
  key: string;
  tier: Tier;
  updatedAt: string;
}
const KINDS = ["FEATURE", "MOCK_SERIES", "MOCK_TEST", "COURSE", "LESSON", "TOPIC"] as const;
const KIND_LABEL: Record<string, string> = { FEATURE: "Feature", MOCK_SERIES: "Mock series", MOCK_TEST: "Mock test", COURSE: "Course", LESSON: "Lesson", TOPIC: "Topic" };
const tierLabel = (t: Tier) => (t === "FREE" ? "Free" : "Pro");

export function AccessPolicyPanel({ rows, paywallEnabled, loadError, features }: { rows: Row[]; paywallEnabled: boolean; loadError: boolean; features: { code: string; label: string }[] }) {
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<string>("MOCK_TEST");
  const [key, setKey] = useState("");
  const [tier, setTier] = useState<Tier>("FREE");
  const [confirm, setConfirm] = useState("");

  const show = (r: AccessActionResult) => setMsg(r.ok ? { tone: "success", text: r.message } : { tone: "danger", text: "message" in r && r.message ? r.message : r.error });
  const set = (k: string, item: string, t: Tier) => start(async () => show(await setAccessPolicyAction({ kind: k, key: item, tier: t })));
  const clear = (k: string, item: string) => start(async () => show(await clearAccessPolicyAction({ kind: k, key: item })));
  const toggleSwitch = () =>
    start(async () => {
      const r = await setPaywallAction({ enabled: !paywallEnabled, confirm: confirm.trim() });
      show(r);
      if (r.ok) setConfirm("");
    });

  const stored = (k: string, item: string) => rows.find((r) => r.kind === k && r.key === item);
  const defaults = rows.filter((r) => r.key === "*");
  const overrides = rows.filter((r) => r.key !== "*" && r.kind !== "FEATURE");
  const want = paywallEnabled ? "TURN OFF" : "TURN ON";

  return (
    <div className="flex flex-col gap-6" data-access-policy="">
      {loadError && <Alert tone="danger">The settings could not be loaded. Nothing below is current; please reload.</Alert>}
      {msg && (
        <Alert tone={msg.tone} live>
          {msg.text}
        </Alert>
      )}

      <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-6" aria-labelledby="ap-switch">
        <h2 id="ap-switch" className="text-h3 font-semibold text-fg">
          Paywall: {paywallEnabled ? "ON" : "OFF"}
        </h2>
        <p className="text-body text-fg-secondary">
          {paywallEnabled
            ? "Pro items need an active Pro plan."
            : "Everything is open to everyone. The settings below take effect only when the paywall is turned on (at the payments launch)."}
        </p>
        <Field id="ap-confirm" label={`Type ${want} to confirm`}>
          <Input id="ap-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </Field>
        <Button variant={paywallEnabled ? "secondary" : "primary"} size="lg" onClick={toggleSwitch} loading={pending} disabled={confirm.trim() !== want}>
          {paywallEnabled ? "Turn the paywall off" : "Turn the paywall on"}
        </Button>
      </section>

      <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-6" aria-labelledby="ap-features">
        <h2 id="ap-features" className="text-h3 font-semibold text-fg">
          Features
        </h2>
        <ul className="flex flex-col divide-y divide-line">
          {features.map((f) => {
            const t: Tier = stored("FEATURE", f.code)?.tier ?? "PRO";
            return (
              <li key={f.code} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="text-body text-fg">
                  {f.label} <span className="text-body-sm text-fg-secondary">· {tierLabel(t)}</span>
                </span>
                <Button variant="secondary" size="md" onClick={() => set("FEATURE", f.code, t === "FREE" ? "PRO" : "FREE")} loading={pending}>
                  Make {t === "FREE" ? "Pro" : "Free"}
                </Button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-6" aria-labelledby="ap-defaults">
        <h2 id="ap-defaults" className="text-h3 font-semibold text-fg">
          Defaults (for items without their own setting)
        </h2>
        <ul className="flex flex-col divide-y divide-line">
          {defaults.map((r) => (
            <li key={`${r.kind}:*`} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="text-body text-fg">
                Every {KIND_LABEL[r.kind] ?? r.kind} <span className="text-body-sm text-fg-secondary">· {tierLabel(r.tier)}</span>
              </span>
              <Button variant="secondary" size="md" onClick={() => set(r.kind, "*", r.tier === "FREE" ? "PRO" : "FREE")} loading={pending}>
                Make {r.tier === "FREE" ? "Pro" : "Free"}
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-6" aria-labelledby="ap-items">
        <h2 id="ap-items" className="text-h3 font-semibold text-fg">
          Items with their own setting ({overrides.length})
        </h2>
        {overrides.length === 0 ? (
          <p className="text-body text-fg-secondary">None yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {overrides.map((r) => (
              <li key={`${r.kind}:${r.key}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="text-body text-fg">
                  {KIND_LABEL[r.kind] ?? r.kind} <span className="font-mono text-body-sm">{r.key}</span>{" "}
                  <span className="text-body-sm text-fg-secondary">
                    · {tierLabel(r.tier)} · changed {formatDateShort(r.updatedAt)}
                  </span>
                </span>
                <span className="flex gap-2">
                  <Button variant="secondary" size="md" onClick={() => set(r.kind, r.key, r.tier === "FREE" ? "PRO" : "FREE")} loading={pending}>
                    Make {r.tier === "FREE" ? "Pro" : "Free"}
                  </Button>
                  <Button variant="ghost" size="md" onClick={() => clear(r.kind, r.key)} loading={pending}>
                    Use the default
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <Field id="ap-kind" label="Kind">
            <select id="ap-kind" value={kind} onChange={(e) => setKind(e.target.value)} className="h-12 rounded-control border border-line bg-surface px-3 text-body text-fg">
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="ap-key" label="Item ID (or a feature code)">
            <Input id="ap-key" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
          </Field>
          <Field id="ap-tier" label="Access">
            <select id="ap-tier" value={tier} onChange={(e) => setTier(e.target.value === "PRO" ? "PRO" : "FREE")} className="h-12 rounded-control border border-line bg-surface px-3 text-body text-fg">
              <option value="FREE">Free</option>
              <option value="PRO">Pro</option>
            </select>
          </Field>
          <Button variant="primary" size="lg" onClick={() => set(kind, key.trim(), tier)} loading={pending} disabled={!key.trim()}>
            Save this item
          </Button>
        </div>
      </section>
    </div>
  );
}
