/**
 * HOME-1 landing page sections ("/"). Server components only — no client JavaScript on the landing page beyond the
 * shared shell (the FAQ is native <details>). Copy comes from content/landing.ts; numbers only from live reads
 * (lib/exams/category-data, lib/landing/landing-data); a failed read → the section's no-number fallback.
 * Owner rule: NO exam-specific details or actions on home — category tiles → /exams/<category> → exam pages.
 * Research (UX phase 1): low text, plain English, honest (no hype, no promises of selection, no fake numbers), fast on budget phones.
 */
import { ArrowRight, BookOpenCheck, Check, ChevronDown, ChevronRight, ClipboardCheck, Gauge, Lock, NotebookPen, Repeat, RotateCcw } from "lucide-react";
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
import type { GalleryPhoto } from "@/lib/media/photo-rules";
import { shot, type Shot, type ShotKey } from "@/lib/marketing/shots";
import type { LandingData } from "@/lib/landing/landing-data";
import { LandingCta } from "./landing-cta";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
const LOOP_ICONS: Icon[] = [BookOpenCheck, NotebookPen, ClipboardCheck, Gauge, Repeat];
const LOOP_SHOTS: ShotKey[] = ["learn", "practice", "mock", "analyze", "revise"];

/** a product screenshot: lazy, fixed box (width / height + aspect ratio: no layout shift), sized copies via srcset */
function ShotImage({ s, sizes, className = "" }: { s: Shot; sizes: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP copies in public/marketing; no client JS (P-07)
    <img
      src={s.src}
      srcSet={s.srcSet}
      sizes={sizes}
      alt={s.alt}
      width={s.width}
      height={s.height}
      loading="lazy"
      decoding="async"
      className={`h-auto w-full rounded-control border border-line bg-surface ${className}`}
      data-marketing-shot=""
    />
  );
}

/**
 * Section rhythm (HOME-1 owner review): sections alternate white (bg-surface) and canvas (bg-canvas); every section heading
 * has the same short cyan accent bar (decorative). Gradient only on the hero and the final call to action.
 */
function AccentBar() {
  return <span aria-hidden="true" data-accent-bar="" className="block h-1 w-10 rounded-full bg-accent-500" />;
}

function SectionHeading({ id, title, lead }: { id: string; title: string; lead?: string }) {
  return (
    <div className="flex max-w-prose flex-col gap-2">
      <AccentBar />
      <h2 id={id} className="text-h2 font-bold tracking-tight text-fg">
        {title}
      </h2>
      {lead && <p className="text-body-lg text-fg-secondary">{lead}</p>}
    </div>
  );
}

/**
 * Hero: the brand line (2 lines, second in the hero accent), one short line, ONE action (components/landing/landing-cta),
 * and one REAL app screen in a CSS phone frame ("honest images"): right of the text on desktop, small under the action
 * on phones. The H1 stays the LCP element: the screen is smaller than the H1 block, lazy, low fetch priority, sized
 * (no layout shift).
 */
export function LandingHero() {
  const [line1, ...rest] = LANDING_HERO.title.split(". ");
  const mock = shot("hero");
  return (
    <GradientHero aria-labelledby="hero-title">
      <Container className="grid items-center gap-6 lg:grid-cols-[1fr_auto] lg:gap-12">
        <div className="flex flex-col items-start gap-5">
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
        </div>
        {mock && (
          <div className="w-[120px] justify-self-start rounded-[22px] border-4 border-ink-950 bg-ink-950 shadow-e3 lg:w-[200px] lg:justify-self-end lg:rounded-[30px] lg:border-[6px]" data-hero-mockup="">
            {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP copies in public/marketing; no client JS (P-07) */}
            <img
              src={mock.src}
              srcSet={mock.srcSet}
              sizes="(min-width: 1024px) 200px, 120px"
              alt={mock.alt}
              width={mock.width}
              height={mock.height}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              className="h-auto w-full rounded-[18px] lg:rounded-[24px]"
              data-marketing-shot=""
            />
          </div>
        )}
      </Container>
    </GradientHero>
  );
}

// static class names (Tailwind scans the source): coming-soon columns on tablets, all categories in one row on desktop
const MD_COLS: Record<number, string> = { 1: "md:grid-cols-1", 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4" };
const LG_COLS: Record<number, string> = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" };

/**
 * Category tiles: a category with active exams is a link — one full-width row on phones and tablets (owner review: no
 * orphan gap) — then the honest "Coming soon" tiles (not links) two per row; an odd last one spans the row.
 */
export function LandingCategories({ categories }: { categories: PublicCategory[] | null }) {
  const soon = (categories ?? []).filter((c) => c.activeExams === 0);
  const soonCount = soon.length;
  const lastSoon = soon.at(-1)?.slug;
  return (
    <Section aria-labelledby="categories-title" id="categories" spacing="compact" className="scroll-mt-24 bg-surface py-6 lg:py-12">
      <Container className="flex flex-col gap-6">
        <SectionHeading id="categories-title" title={LANDING_CATEGORIES.heading} />
        {categories === null ? (
          <div className="flex flex-col items-start gap-3 rounded-card border border-line bg-surface p-5">
            <p className="text-body text-fg-secondary">{LANDING_CATEGORIES.fallback}</p>
            <ButtonLink href={LANDING_CATEGORIES.allExams.href} variant="secondary" size="lg">
              {LANDING_CATEGORIES.allExams.label}
            </ButtonLink>
          </div>
        ) : (
          <ul className={`grid grid-cols-2 gap-2 sm:gap-3 ${MD_COLS[Math.min(4, Math.max(1, soonCount))]} ${LG_COLS[Math.min(5, Math.max(1, categories.length))]}`} aria-label={LANDING_CATEGORIES.heading}>
            {categories.map((c) => {
              const live = c.activeExams > 0;
              const pill = (
                <span className={`rounded-full px-2 py-0.5 text-[14px] font-semibold leading-tight ${live ? "bg-primary-50 text-primary-800" : "bg-ink-50 text-fg-secondary"}`}>
                  {live ? categoryCountLabel(c.activeExams) : LANDING_CATEGORIES.comingSoon}
                </span>
              );
              if (live) {
                return (
                  <li key={c.slug} className="col-span-full flex lg:col-span-1">
                    <Link
                      href={`/exams/${c.slug}`}
                      className="focus-ring flex min-h-[72px] w-full items-center gap-3 rounded-card border border-primary-200 bg-surface p-3 transition-colors hover:border-primary-300 hover:bg-primary-50/40 sm:p-4 lg:min-h-[132px] lg:flex-col lg:justify-center lg:gap-1.5 lg:text-center"
                      data-category-tile={c.slug}
                    >
                      <CategoryIcon category={c} px={48} />
                      <span className="flex min-w-0 flex-1 flex-col items-start gap-1 lg:flex-none lg:items-center">
                        <span className="text-body-lg font-semibold text-fg">{c.name}</span>
                        {pill}
                      </span>
                      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-primary-700 lg:hidden" />
                    </Link>
                  </li>
                );
              }
              const lastOdd = soonCount % 2 === 1 && c.slug === lastSoon;
              return (
                <li key={c.slug} className={`flex ${lastOdd ? "col-span-2 md:col-span-1" : ""}`}>
                  <div className="flex min-h-[112px] w-full flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-line bg-canvas p-2 text-center sm:p-4 lg:min-h-[132px]" data-category-tile={c.slug} aria-disabled="true">
                    <CategoryIcon category={c} px={48} />
                    <span className="text-body font-semibold text-fg sm:text-body-lg">{c.name}</span>
                    {pill}
                  </div>
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
    <Section aria-label={LANDING_CATEGORIES.heading} aria-busy="true" id="categories" spacing="compact" className="bg-surface py-6 lg:py-12">
      <Container className="flex flex-col gap-6">
        <SectionHeading id="categories-title" title={LANDING_CATEGORIES.heading} />
        <ul className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 lg:grid-cols-5" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className={`rounded-card border border-line bg-canvas ${i === 0 ? "col-span-full min-h-[72px] lg:col-span-1 lg:min-h-[132px]" : "min-h-[112px] lg:min-h-[132px]"}`} />
          ))}
        </ul>
        <div className="min-h-12" />
      </Container>
    </Section>
  );
}

/**
 * How it works = the connected loop (our differentiator). Phones: a vertical timeline (large icon, connecting line, one
 * line of text, a small real screenshot). Tablet / desktop: the 5 steps in a row joined by arrows, and a line under
 * the row that curves back to step 1 (CSS borders, our own code). Every screenshot is a real app screen (lazy, sized).
 */
export function LandingLoop() {
  const steps = LANDING_LOOP.steps;
  return (
    <Section aria-labelledby="loop-title" spacing="compact" className="bg-canvas py-6 lg:py-12">
      <Container className="flex flex-col gap-6">
        <SectionHeading id="loop-title" title={LANDING_LOOP.heading} />
        <div className="relative" data-loop="">
          <ol className="relative flex flex-col md:grid md:grid-cols-5 md:gap-4 lg:gap-6" data-loop-steps="">
            {steps.map((step, i) => {
              const StepIcon = LOOP_ICONS[i] ?? Repeat;
              const s = shot(LOOP_SHOTS[i]);
              const last = i === steps.length - 1;
              return (
                <li key={step.title} className="relative flex gap-4 pb-5 md:flex-col md:gap-3 md:rounded-card md:border md:border-line md:bg-surface md:p-3 md:pb-3 lg:p-4" data-loop-step={i + 1}>
                  {/* phones: the connecting line of the timeline (to the next step) */}
                  {!last && <span aria-hidden="true" className="absolute left-6 top-12 h-[calc(100%-3rem)] w-0.5 -translate-x-1/2 bg-primary-200 md:hidden" data-loop-line="" />}
                  {/* tablet / desktop: the arrow to the next step */}
                  {!last && (
                    <span aria-hidden="true" className="absolute -right-4 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center text-primary-700 md:flex lg:-right-6 lg:w-6" data-loop-arrow="">
                      <ArrowRight className="size-4 lg:size-5" />
                    </span>
                  )}
                  <span className="relative inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-700 text-fg-inverse md:size-10">
                    <StepIcon aria-hidden="true" className="size-6 md:size-5" />
                    <span aria-hidden="true" className="absolute -right-1 -top-1 inline-flex size-5 items-center justify-center rounded-full bg-surface text-[14px] font-bold leading-none text-primary-700 ring-2 ring-primary-700">
                      {i + 1}
                    </span>
                  </span>
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-3 md:flex-col md:justify-start">
                    <div className="flex min-w-0 flex-col gap-0.5 pt-1 md:pt-0">
                      <h3 className="text-body-lg font-semibold text-fg">
                        <span className="sr-only">{LANDING_LOOP.stepLabel(i + 1)}</span>
                        {step.title}
                      </h3>
                      <p className="text-body-sm text-fg-secondary lg:hidden">{step.short}</p>
                      <p className="hidden text-body-sm text-fg-secondary lg:block">{step.text}</p>
                    </div>
                    {s && (
                      <div className="w-28 shrink-0 md:w-full">
                        <ShotImage s={s} sizes="(min-width: 1024px) 200px, (min-width: 768px) 132px, 112px" />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {/* the loop closes: phones — a last row back to step 1; tablet / desktop — a line under the row that curves
              back up into step 1 (rounded border corners) with an arrow head pointing at it */}
          <p className="flex items-center gap-4 text-body-sm font-semibold text-primary-700 md:hidden" data-loop-back="">
            <span aria-hidden="true" className="inline-flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-primary-300">
              <RotateCcw className="size-5" />
            </span>
            {LANDING_LOOP.loopBack}
          </p>
          <div aria-hidden="true" className="relative mx-[10%] hidden h-8 rounded-b-3xl border-x-2 border-b-2 border-primary-300 md:block" data-loop-return="">
            <span className="absolute -left-[7px] -top-[2px] block size-0 border-x-[6px] border-b-[9px] border-x-transparent border-b-primary-300" />
          </div>
          <p className="mt-2 hidden text-center text-body-sm font-semibold text-primary-700 md:block">{LANDING_LOOP.loopBack}</p>
        </div>
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

// tablet / desktop columns by how many features are live (≤ 6): full rows only; 5 on tablets → the last spans the row
const FEATURE_COLS: Record<number, string> = {
  1: "md:grid-cols-1",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-2 lg:grid-cols-4",
  5: "md:grid-cols-2 lg:grid-cols-5",
  6: "md:grid-cols-3",
};

/** What you get: ONLY what works today (ruling: no "coming soon" cards on home). */
export function LandingFeatures({ data }: { data: LandingData }) {
  const live = landingFeatures(data).filter((r) => r.live);
  const shortOf = (key: string) => (LANDING_FEATURES.items as Record<string, { short?: string }>)[key]?.short;
  return (
    <Section aria-labelledby="features-title" spacing="compact" className="bg-surface py-6 lg:py-12">
      <Container className="flex flex-col gap-6">
        <SectionHeading id="features-title" title={LANDING_FEATURES.heading} lead={LANDING_FEATURES.lead} />
        <ul
          className={`flex flex-col divide-y divide-line rounded-card border border-line bg-surface md:grid md:gap-3 md:divide-y-0 md:border-0 md:bg-transparent ${FEATURE_COLS[Math.min(6, Math.max(1, live.length))]}`}
          data-features-list=""
        >
          {live.map((r, i) => (
            <li
              key={r.key}
              className={`flex items-start gap-3 px-3 py-2.5 md:flex-col md:gap-1 md:rounded-card md:border md:border-line md:bg-canvas md:p-4 ${live.length === 5 && i === 4 ? "md:col-span-2 lg:col-span-1" : ""}`}
            >
              <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success-700" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <h3 className="text-body font-semibold text-fg md:text-body-lg">{r.title}</h3>
                <span className="text-body-sm text-fg-secondary md:text-body">{shortOf(r.key) ?? r.text}</span>
                {r.detail && <span className="hidden text-body font-medium text-primary-700 md:inline">{r.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}

export function LandingFeaturesSkeleton() {
  return (
    <Section aria-label={LANDING_FEATURES.heading} aria-busy="true" spacing="compact" className="bg-surface py-6 lg:py-12">
      <Container className="flex flex-col gap-6">
        <SectionHeading id="features-title" title={LANDING_FEATURES.heading} lead={LANDING_FEATURES.lead} />
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-3 md:gap-3" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <li key={i} className="min-h-16 rounded-card border border-line bg-canvas md:min-h-28" />
          ))}
        </ul>
      </Container>
    </Section>
  );
}

/**
 * Trust: the real library (R12: a real story, no numbers, no testimonials), ≤ 3 lines + the owner's photos of the
 * library (Settings › Library photos, 130; "honest images": real photos only). Desktop: the first photo large + the
 * next two; phones: a swipeable row of all of them. Every photo is lazy (below the fold), sized from the stored
 * width / height (no layout shift), a 390 / 768 / 1280 px copy chosen by the browser. No photos → text only.
 */
export function LandingTrust({ photos = [] }: { photos?: GalleryPhoto[] }) {
  return (
    <Section aria-labelledby="trust-title" spacing="compact" className="bg-canvas py-6 lg:py-12">
      <Container>
        <div className="flex flex-col gap-4 overflow-hidden rounded-card border border-line bg-surface p-5 sm:p-8">
          <div className="flex flex-col gap-2">
            <AccentBar />
            <h2 id="trust-title" className="text-h2 font-bold tracking-tight text-fg">
              {LANDING_TRUST.heading}
            </h2>
            <p className="max-w-prose text-body text-fg-secondary" data-trust-text="">
              {LANDING_TRUST.short}
            </p>
          </div>
          {photos.length > 0 && (
            <ul
              className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 sm:-mx-8 sm:px-8 md:mx-0 md:grid md:grid-cols-3 md:grid-rows-2 md:overflow-visible md:px-0 md:pb-0"
              aria-label={LANDING_TRUST.galleryLabel}
              tabIndex={0}
              data-gallery=""
            >
              {photos.map((p, i) => (
                <li
                  key={p.id}
                  className={`w-[80%] shrink-0 snap-start md:w-auto ${i === 0 ? "md:col-span-2 md:row-span-2" : ""} ${i > 2 ? "md:hidden" : ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP copies from our pipeline; no client JS (P-07) */}
                  <img
                    src={p.src}
                    srcSet={p.srcSet}
                    sizes={i === 0 ? "(min-width: 768px) 66vw, 80vw" : "(min-width: 768px) 33vw, 80vw"}
                    alt={p.alt}
                    width={p.width}
                    height={p.height}
                    loading="lazy"
                    decoding="async"
                    className="aspect-[4/3] h-full w-full rounded-control object-cover"
                    data-home-photo=""
                  />
                </li>
              ))}
            </ul>
          )}
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
    <Section aria-labelledby="plans-title" spacing="compact" className="bg-surface py-6 lg:py-12">
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

/**
 * FAQ: native <details> (no client JS; the browser exposes expanded / collapsed on the <summary>); a chevron turns when
 * open (owner review: not an arrow). The same text goes into FAQPage JSON-LD (app/page.tsx).
 */
export function LandingFaq() {
  return (
    <Section aria-labelledby="faq-title" spacing="compact" className="bg-canvas py-6 lg:py-12">
      <Container className="flex flex-col gap-6">
        <SectionHeading id="faq-title" title={LANDING_FAQ.heading} />
        <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
          {LANDING_FAQ.items.map((f) => (
            <details key={f.q} className="group">
              <summary className="focus-ring flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-body font-semibold text-fg sm:text-body-lg [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown aria-hidden="true" data-faq-chevron="" className="size-5 shrink-0 text-fg-secondary transition-transform group-open:rotate-180 motion-reduce:transition-none" />
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
    <Section aria-labelledby="final-cta-title" className="hero-gradient hero-depth relative isolate overflow-hidden">
      <Container className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id="final-cta-title" className="text-h2 font-bold tracking-tight text-fg-inverse">
            {LANDING_FINAL_CTA.heading}
          </h2>
          <p className="text-body-lg text-hero-fg-muted" data-final-cta-note="">
            {LANDING_FINAL_CTA.note}
          </p>
        </div>
        <LandingCta spot="final" />
      </Container>
    </Section>
  );
}
