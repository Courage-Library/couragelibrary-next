/**
 * HOME-1 landing page sections ("/"). Server components only — no client JavaScript on the landing page beyond the
 * shared shell (the FAQ is native <details>). Copy comes from content/landing.ts; numbers only from live reads
 * (lib/exams/category-data, lib/landing/landing-data); a failed read → the section's no-number fallback.
 * Owner rule: NO exam-specific details or actions on home — category tiles → /exams/<category> → exam pages.
 * Research (UX phase 1): low text, plain English, honest (no hype, no promises of selection, no fake numbers), fast on budget phones.
 */
import { ArrowRight, BookOpenCheck, Check, ClipboardCheck, Gauge, Lock, NotebookPen, Repeat } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Container, Section } from "@/components/ui/layout";
import { GradientHero } from "@/components/ui/gradient-hero";
import { CategoryIcon } from "@/components/exams/category-icon";
import {
  LANDING_CATEGORIES,
  LANDING_FAQ,
  LANDING_FEATURES,
  LANDING_FINAL_CTA,
  LANDING_HERO,
  LANDING_LOOP,
  LANDING_PLANS,
  LANDING_TRUST,
} from "@/content/landing";
import { categoryCountLabel, type PublicCategory } from "@/lib/exams/categories";
import type { HomePhoto } from "@/lib/media/photo-rules";
import type { LandingData } from "@/lib/landing/landing-data";
import { LandingCta } from "./landing-cta";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
const LOOP_ICONS: Icon[] = [BookOpenCheck, NotebookPen, ClipboardCheck, Gauge, Repeat];

function SectionHeading({ id, title, lead }: { id: string; title: string; lead?: string }) {
  return (
    <div className="flex max-w-prose flex-col gap-2">
      <h2 id={id} className="text-h2 font-bold tracking-tight text-fg">
        {title}
      </h2>
      {lead && <p className="text-body-lg text-fg-secondary">{lead}</p>}
    </div>
  );
}

/** Hero: the brand line (2 lines, second in the hero accent), one short line, ONE action (components/landing/landing-cta). */
export function LandingHero() {
  const [line1, ...rest] = LANDING_HERO.title.split(". ");
  return (
    <GradientHero aria-labelledby="hero-title">
      <Container className="flex flex-col items-start gap-5">
        <p className="inline-flex items-center gap-2 text-body-sm font-semibold uppercase tracking-wider text-hero-accent-text">
          <span aria-hidden="true" className="size-2 rounded-full bg-accent-400" />
          {LANDING_HERO.eyebrow}
        </p>
        <h1 id="hero-title" className="max-w-3xl text-display font-bold tracking-tight text-hero-fg">
          {rest.length ? (
            <>
              {line1}.<br />
              <span className="text-hero-accent-text">{rest.join(". ")}</span>
            </>
          ) : (
            LANDING_HERO.title
          )}
        </h1>
        <p className="max-w-xl text-body-lg text-hero-fg-muted">{LANDING_HERO.lead}</p>
        <div className="flex flex-wrap items-center gap-3">
          <LandingCta spot="hero" />
        </div>
        <p className="text-body-sm text-hero-fg-muted">{LANDING_HERO.note}</p>
      </Container>
    </GradientHero>
  );
}

/** Category tiles: a category with active exams is a link; one without is an honest "Coming soon" tile (not a link). */
export function LandingCategories({ categories }: { categories: PublicCategory[] | null }) {
  return (
    <Section aria-labelledby="categories-title" id="categories" spacing="compact" className="scroll-mt-24 pt-6 lg:pt-12">
      <Container className="flex flex-col gap-6">
        <SectionHeading id="categories-title" title={LANDING_CATEGORIES.heading} />
        {categories === null ? (
          <div className="flex flex-col items-start gap-3 rounded-card border border-line bg-surface p-5">
            <p className="text-body text-fg-secondary">{LANDING_CATEGORIES.fallback}</p>
            <ButtonLink href={LANDING_CATEGORIES.allExams.href} variant="secondary">
              {LANDING_CATEGORIES.allExams.label}
            </ButtonLink>
          </div>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-5" aria-label={LANDING_CATEGORIES.heading}>
            {categories.map((c) => {
              const live = c.activeExams > 0;
              const inner = (
                <>
                  <CategoryIcon category={c} px={40} />
                  <span className="text-body font-semibold text-fg sm:text-body-lg">{c.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[14px] font-semibold leading-tight ${live ? "bg-primary-50 text-primary-800" : "bg-ink-50 text-fg-secondary"}`}>
                    {live ? categoryCountLabel(c.activeExams) : LANDING_CATEGORIES.comingSoon}
                  </span>
                </>
              );
              return (
                <li key={c.slug} className="flex">
                  {live ? (
                    <Link href={`/exams/${c.slug}`} className="focus-ring flex min-h-[116px] w-full flex-col items-center justify-center gap-1.5 rounded-card border border-line bg-surface p-2 sm:p-4 text-center transition-colors hover:border-primary-300 hover:bg-primary-50/40" data-category-tile={c.slug}>
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex min-h-[116px] w-full flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-line bg-surface-sunken p-2 text-center sm:p-4" data-category-tile={c.slug} aria-disabled="true">
                      {inner}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <Link href={LANDING_CATEGORIES.allExams.href} className="focus-ring inline-flex min-h-12 items-center gap-2 self-start rounded-control px-1 text-body font-semibold text-link hover:underline">
          {LANDING_CATEGORIES.allExams.label}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </Container>
    </Section>
  );
}

export function LandingCategoriesSkeleton() {
  return (
    <Section aria-label={LANDING_CATEGORIES.heading} aria-busy="true" id="categories" spacing="compact" className="pt-8 lg:pt-12">
      <Container className="flex flex-col gap-6">
        <SectionHeading id="categories-title" title={LANDING_CATEGORIES.heading} lead={LANDING_CATEGORIES.lead} />
        <ul className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-5" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="min-h-[116px] rounded-card border border-line bg-surface-sunken" />
          ))}
        </ul>
        <div className="min-h-12" />
      </Container>
    </Section>
  );
}

/** How it works: 5 compact steps (one row on desktop, a short list on phones). */
export function LandingLoop() {
  return (
    <Section aria-labelledby="loop-title" spacing="compact" className="bg-surface-sunken py-6 lg:py-12">
      <Container className="flex flex-col gap-6">
        <SectionHeading id="loop-title" title={LANDING_LOOP.heading} />
        <ol className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface md:grid md:grid-cols-5 md:gap-3 md:divide-y-0 md:border-0 md:bg-transparent">
          {LANDING_LOOP.steps.map((step, i) => {
            const StepIcon = LOOP_ICONS[i] ?? Repeat;
            return (
              <li key={step.title} className="flex items-center gap-3 px-3 py-2 md:flex-col md:items-start md:gap-2 md:rounded-card md:border md:border-line md:bg-surface md:p-4">
                <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-700 text-body-sm font-semibold text-fg-inverse">
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-row flex-wrap items-baseline gap-x-2 md:flex-col md:gap-0.5">
                  <span className="flex items-center gap-2">
                    <h3 className="text-body-lg font-semibold text-fg">
                      <span className="sr-only">{LANDING_LOOP.stepLabel(i + 1)}</span>
                      {step.title}
                    </h3>
                    <StepIcon aria-hidden="true" className="hidden size-5 text-accent-700 md:inline" />
                  </span>
                  <span className="text-body-sm text-fg-secondary md:hidden">{step.short}</span>
                  <span className="hidden text-body text-fg-secondary md:inline">{step.text}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </Container>
    </Section>
  );
}

type FeatureRow = { key: string; title: string; text: string; live: boolean; detail: string | null };

/** Which features are live: product features are live by code; content features only when published rows exist. */
export function landingFeatures(data: LandingData): FeatureRow[] {
  const f = LANDING_FEATURES.items;
  const mocksLive = !data.ok || data.totalPublishedMocks > 0;
  return [
    { key: "mocks", ...f.mocks, live: mocksLive, detail: data.ok && data.totalPublishedMocks > 0 ? f.mocks.count(data.totalPublishedMocks) : null },
    { key: "analysis", ...f.analysis, live: mocksLive, detail: null },
    { key: "mistakes", ...f.mistakes, live: mocksLive, detail: null },
    { key: "guides", ...f.guides, live: !data.ok || data.totalPublishedGuides > 0, detail: data.ok && data.totalPublishedGuides > 0 ? f.guides.count(data.totalPublishedGuides) : null },
    { key: "syllabus", ...f.syllabus, live: data.ok && data.exams.some((e) => e.syllabusAvailable), detail: null },
    { key: "currentAffairs", ...f.currentAffairs, live: data.ok && data.currentAffairsPublished > 0, detail: null },
    { key: "courses", ...f.courses, live: false, detail: null },
  ].map(({ key, title, text, live, detail }) => ({ key, title, text, live, detail }));
}

/** What you get: ONLY what works today (ruling: no "coming soon" cards on home). */
export function LandingFeatures({ data }: { data: LandingData }) {
  const live = landingFeatures(data).filter((r) => r.live);
  const shortOf = (key: string) => (LANDING_FEATURES.items as Record<string, { short?: string }>)[key]?.short;
  return (
    <Section aria-labelledby="features-title" spacing="compact" className="py-6 lg:py-12">
      <Container className="flex flex-col gap-6">
        <SectionHeading id="features-title" title={LANDING_FEATURES.heading} lead={LANDING_FEATURES.lead} />
        <ul className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
          {live.map((r) => (
            <li key={r.key} className="flex flex-col gap-1 rounded-card border border-line bg-surface p-3 sm:p-4">
              <span className="flex items-start gap-2">
                <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success-700" />
                <h3 className="text-body font-semibold text-fg sm:text-body-lg">{r.title}</h3>
              </span>
              <span className="text-body-sm text-fg-secondary sm:text-body">{shortOf(r.key) ?? r.text}</span>
              {r.detail && <span className="text-body-sm font-medium text-primary-700 sm:text-body">{r.detail}</span>}
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}

export function LandingFeaturesSkeleton() {
  return (
    <Section aria-label={LANDING_FEATURES.heading} aria-busy="true" spacing="compact" className="py-6 lg:py-12">
      <Container className="flex flex-col gap-6">
        <SectionHeading id="features-title" title={LANDING_FEATURES.heading} lead={LANDING_FEATURES.lead} />
        <ul className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="min-h-24 rounded-card border border-line bg-surface-sunken" />
          ))}
        </ul>
      </Container>
    </Section>
  );
}

/**
 * Trust: the real library (R12: a real story, no numbers, no testimonials), ≤ 3 lines + the owner's photo of the library
 * (Settings › Home page photo; space only). The photo is lazy (below the fold), its width / height are set from the
 * stored size (no layout shift) and a 390 / 768 / 1280 px copy is chosen by the browser. No photo → text only.
 */
export function LandingTrust({ photo = null }: { photo?: HomePhoto | null }) {
  return (
    <Section aria-labelledby="trust-title" spacing="compact" className="bg-surface-sunken py-6 lg:py-12">
      <Container>
        <div className={`grid gap-4 overflow-hidden rounded-card border border-line bg-surface ${photo ? "md:grid-cols-2 md:items-center" : ""}`}>
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP copies from our pipeline; no client JS (P-07)
            <img
              src={photo.src}
              srcSet={photo.srcSet}
              sizes="(min-width: 768px) 50vw, 100vw"
              alt={photo.alt}
              width={photo.width}
              height={photo.height}
              loading="lazy"
              decoding="async"
              className="h-auto w-full"
              data-home-photo=""
            />
          )}
          <div className="flex flex-col gap-2 p-5 sm:p-8">
            <h2 id="trust-title" className="text-h2 font-bold tracking-tight text-fg">
              {LANDING_TRUST.heading}
            </h2>
            <p className="max-w-prose text-body text-fg-secondary" data-trust-text="">
              {LANDING_TRUST.short}
            </p>
          </div>
        </div>
      </Container>
    </Section>
  );
}

/** Free and Pro: a small comparison table, features only, no prices (owner decision 1 + "Pricing at launch"). */
export function LandingPlans() {
  const T = LANDING_PLANS.table;
  const cell = (on: boolean, pro: boolean) =>
    on ? (
      <>
        <Check aria-hidden="true" className={`mx-auto size-5 ${pro ? "text-primary-700" : "text-success-700"}`} />
        <span className="sr-only">{pro ? "Included in Pro" : "Included free"}</span>
      </>
    ) : (
      <>
        <span aria-hidden="true" className="text-fg-muted">—</span>
        <span className="sr-only">Not included</span>
      </>
    );
  return (
    <Section aria-labelledby="plans-title" spacing="compact" className="py-6 lg:py-12">
      <Container className="flex flex-col gap-4">
        <SectionHeading id="plans-title" title={LANDING_PLANS.heading} />
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <table className="w-full border-collapse text-body" data-plans-table="">
            <caption className="sr-only">{T.caption}</caption>
            <thead className="bg-surface-sunken">
              <tr>
                <th scope="col" className="px-3 py-2 text-left text-body-sm font-semibold text-fg-secondary">{T.columns[0]}</th>
                <th scope="col" className="w-20 px-2 py-2 text-center text-body-sm font-semibold text-fg">{T.columns[1]}</th>
                <th scope="col" className="w-20 px-2 py-2 text-center text-body-sm font-semibold text-fg">
                  <span className="inline-flex items-center gap-1">
                    <Lock aria-hidden="true" className="size-3.5" />
                    {T.columns[2]}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {T.rows.map((r) => (
                <tr key={r.feature} className="border-t border-line">
                  <th scope="row" className="px-3 py-1.5 text-left font-normal text-fg">{r.feature}</th>
                  <td className="px-2 py-1.5 text-center">{cell(r.free, false)}</td>
                  <td className="px-2 py-1.5 text-center">{cell(r.pro, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-body-sm text-fg-secondary">
          {LANDING_PLANS.text} {T.proNote.replace("Pro is coming soon. ", "")}
        </p>
      </Container>
    </Section>
  );
}

/** FAQ: native <details> (no client JS); the same text goes into FAQPage JSON-LD (app/page.tsx). */
export function LandingFaq() {
  return (
    <Section aria-labelledby="faq-title" spacing="compact" className="bg-surface-sunken py-6 lg:py-12">
      <Container className="flex flex-col gap-6">
        <SectionHeading id="faq-title" title={LANDING_FAQ.heading} />
        <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
          {LANDING_FAQ.items.map((f) => (
            <details key={f.q} className="group">
              <summary className="focus-ring flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-body font-semibold text-fg sm:text-body-lg [&::-webkit-details-marker]:hidden">
                {f.q}
                <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-fg-secondary transition-transform group-open:rotate-90" />
              </summary>
              <p className="px-4 pb-4 text-body text-fg-secondary">{f.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </Section>
  );
}

export function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: LANDING_FAQ.items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

export function LandingFinalCta() {
  return (
    <Section aria-labelledby="final-cta-title" className="hero-gradient">
      <Container className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="final-cta-title" className="text-h2 font-bold tracking-tight text-fg-inverse">
          {LANDING_FINAL_CTA.heading}
        </h2>
        <LandingCta spot="final" />
      </Container>
    </Section>
  );
}
