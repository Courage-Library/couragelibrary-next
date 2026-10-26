import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { isProEnabled } from "@/config/payments";

/**
 * F9-B expiry reminders (7 days and 1 day before a paid / library Pro period ends). CRON_SECRET pattern as
 * finalize-attempts; fails closed. NOT registered in vercel.json yet: the app has no mail transport (owner to choose),
 * so this run only COUNTS what is due and records nothing — a reminder is marked sent (pro_reminders_sent, unique per
 * entitlement + kind) only after a real send. The in-app banner (dashboard) needs no email. Counts only, never ids.
 */
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 16) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false }, { status: 401 });
  if (!isProEnabled()) return NextResponse.json({ ok: true, skipped: "PRO_OFF" });
  const admin = createAdminServerSupabaseClient();
  const now = Date.now();
  const due: Record<"D7" | "D1", number> = { D7: 0, D1: 0 };
  const { data, error } = await admin
    .from("user_entitlements")
    .select("id, expires_at, pro_reminders_sent(kind)")
    .eq("is_active", true)
    .is("revoked_at", null)
    .in("entitlement_type", ["PRO_SUBSCRIPTION", "PROMOTIONAL_PASS"])
    .gt("expires_at", new Date(now).toISOString())
    .lte("expires_at", new Date(now + 7 * 86400e3).toISOString());
  if (error) return NextResponse.json({ ok: false, code: error.code }, { status: 500 });
  for (const e of data ?? []) {
    const sent = new Set((e.pro_reminders_sent ?? []).map((r) => r.kind));
    const days = (new Date(e.expires_at as string).getTime() - now) / 86400e3;
    if (days <= 1 && !sent.has("D1")) due.D1++;
    else if (days <= 7 && !sent.has("D7")) due.D7++;
  }
  console.log(`[cron pro-reminders] due_d7=${due.D7} due_d1=${due.D1} sent=0 (email not configured)`);
  return NextResponse.json({ ok: true, due, sent: 0, email: "NOT_CONFIGURED" });
}
