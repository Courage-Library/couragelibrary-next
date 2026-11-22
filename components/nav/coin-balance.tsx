"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * COURSE-UX-1 (kept by the owner in NAV-1 Stage B, flag-gated): the coin balance in the student top bar while lesson
 * coins are on. The shell makes no database query (UX-1b U-5): the browser asks /api/coins/balance (the student's own
 * wallet row) after the page is shown; nothing while loading or unknown, so the bar never shifts.
 */
export function CoinBalance({ enabled }: { enabled?: boolean }) {
  const [n, setN] = useState<number | null>(null);
  const pathname = usePathname();
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetch("/api/coins/balance", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { balance?: unknown } | null) => live && setN(typeof j?.balance === "number" ? j.balance : null))
      .catch(() => null);
    return () => {
      live = false;
    };
  }, [enabled, pathname]);
  if (!enabled || n === null) return null;
  return (
    <Link href="/wallet" className="cl-ss__coins" data-testid="header-coins">
      <svg className="cl-ss__ic cl-ss__ic--sm" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM9 12h6M12 9v6" />
      </svg>
      <span>{n}</span>
      <span className="cl-ss__sr">coins</span>
    </Link>
  );
}
