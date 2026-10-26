"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatDateShort } from "@/lib/format";
import { searchCandidateAction } from "@/app/admin/premium/actions";
import { grantLibraryProAction, revokeLibraryProAction } from "./actions";

export interface LibraryGrantRow {
  id: string;
  userId: string;
  startsAt: string;
  expiresAt: string | null;
  active: boolean;
}

export function LibraryProPanel({ grants }: { grants: LibraryGrantRow[] }) {
  const [query, setQuery] = useState("");
  const [member, setMember] = useState<{ id: string; email: string; fullName?: string } | null>(null);
  const [until, setUntil] = useState("");
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const find = () =>
    start(async () => {
      setMsg(null);
      setMember(null);
      const r = await searchCandidateAction(query);
      const user = (r.data as { user?: { id: string; email: string; fullName?: string } } | undefined)?.user;
      if (r.success && user) setMember(user);
      else setMsg({ tone: "danger", text: r.error ?? "Member not found." });
    });
  const grant = () =>
    start(async () => {
      if (!member) return;
      const r = await grantLibraryProAction({ userId: member.id, validUntil: until });
      setMsg(r.ok ? { tone: "success", text: r.message } : { tone: "danger", text: "message" in r && r.message ? r.message : r.error });
    });
  const revoke = (id: string) =>
    start(async () => {
      const r = await revokeLibraryProAction({ entitlementId: id });
      setMsg(r.ok ? { tone: "success", text: r.message } : { tone: "danger", text: "message" in r && r.message ? r.message : r.error });
    });

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6">
        <Field id="lp-member" label="Member email or user ID">
          <Input id="lp-member" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
        </Field>
        <Button variant="secondary" size="lg" onClick={find} loading={pending && !member} disabled={!query.trim()}>
          Find member
        </Button>
        {member && (
          <>
            <p className="text-body text-fg">
              {member.fullName ? `${member.fullName} · ` : ""}
              {member.email}
            </p>
            <Field id="lp-until" label="Pro until (inclusive, IST)">
              <Input id="lp-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            </Field>
            <Button size="lg" onClick={grant} loading={pending} disabled={!until}>
              Grant library Pro
            </Button>
          </>
        )}
        {msg && (
          <Alert tone={msg.tone} live>
            {msg.text}
          </Alert>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-h3 font-semibold text-fg">Grants</h2>
        {grants.length === 0 ? (
          <p className="text-body text-fg-secondary">No library grants yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {grants.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line p-3 text-body-sm">
                <span className="font-mono text-fg-secondary">{g.userId.slice(0, 8)}…</span>
                <span className="text-fg">
                  {formatDateShort(g.startsAt)} – {g.expiresAt ? formatDateShort(g.expiresAt) : "no end date"} · {g.active ? "active" : "ended"}
                </span>
                {g.active && (
                  <Button variant="danger" size="lg" onClick={() => revoke(g.id)} disabled={pending}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
