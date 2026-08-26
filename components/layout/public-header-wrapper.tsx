"use client";

import React from "react";
import { usePathname } from "next/navigation";

export function PublicHeaderWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Do NOT render the public website navigation header on any /admin routes
  if (pathname?.startsWith("/admin")) {
    return null;
  }

  return <>{children}</>;
}
