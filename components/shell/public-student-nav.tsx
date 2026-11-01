"use client";

import { useEffect, useState } from "react";
import { readLocalSessionUser } from "@/lib/ui/local-session";
import { BottomNav } from "./bottom-nav";
import type { ShellAccount } from "./shell-types";

/**
 * PERF-HOME-1: on the cached public pages the signed-in student's bottom nav (phones) is built in the BROWSER from the
 * local session cookie (lib/ui/local-session.ts — no request, no server read, no Supabase client in the page): the
 * cached HTML never holds a name, an e-mail or a role. Its space is reserved by the page before the first paint
 * (PublicShell, .auth-in), so it appears without shifting anything; until it appears there are no wrong links
 * (signed-out visitors never see it).
 */
export function PublicStudentNav({ studyPreferences, profile, coins }: { studyPreferences: boolean; profile: boolean; coins: boolean }) {
  const [account, setAccount] = useState<ShellAccount | null>(null);
  useEffect(() => {
    if (document.documentElement.getAttribute("data-auth") !== "in") return;
    const u = readLocalSessionUser();
    if (!u) return;
    setAccount({
      name: u.fullName || u.email?.split("@")[0] || "Student",
      email: u.email,
      isStaff: u.role === "admin" || u.role === "staff",
      studyPreferences,
      profile,
      coins,
    });
  }, [studyPreferences, profile, coins]);
  return account ? <BottomNav account={account} reservedSpace /> : null;
}
