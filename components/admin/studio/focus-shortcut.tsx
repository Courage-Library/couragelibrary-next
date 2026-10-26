"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Courage Studio: F starts the focus session from Today (never while typing in a field; no modifier keys). */
export function FocusShortcut({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "f" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      router.push(href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [href, router]);
  return null;
}
