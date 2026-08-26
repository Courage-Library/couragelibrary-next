"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Container } from "@/components/ui/container";
import { siteConfig } from "@/config/site";

export function Footer() {
  const pathname = usePathname();

  // Do NOT render the public website footer in Admin Studio
  if (pathname?.startsWith("/admin")) {
    return null;
  }

  return (
    <footer className="w-full border-t border-slate-200 bg-slate-50/50 py-8 text-slate-500">
      <Container className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
        <p>© {new Date().getFullYear()} {siteConfig.name}. All rights reserved.</p>
        <p className="font-mono text-slate-400">
          The One-Stop Government Exam Preparation Platform
        </p>
      </Container>
    </footer>
  );
}
