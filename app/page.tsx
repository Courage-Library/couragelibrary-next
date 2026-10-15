import React from "react";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { JsonLd } from "@/components/seo/json-ld";
import { generateOrganizationSchema } from "@/lib/seo/jsonld";
import { siteConfig } from "@/config/site";

// HOTFIX-1: neutral holding page. No diagnostics or infrastructure details are rendered here.
// UX-1/UX-2 rebuild this page (docs/ux/pages/landing.md).
export default function HomePage() {
  return (
    <>
      <JsonLd data={generateOrganizationSchema()} />
      <section className="py-20 md:py-28">
        <Container className="max-w-2xl text-center space-y-6">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900">{siteConfig.name}</h1>
          <p className="text-lg text-slate-600">Learn Smarter. Prepare Independently.</p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/exams"
              className="inline-flex h-11 items-center rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              Explore exams
            </Link>
            <Link
              href="/auth/login"
              className="inline-flex h-11 items-center rounded-lg border border-slate-500 px-5 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              Sign in
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
