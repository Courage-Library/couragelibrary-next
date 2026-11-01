/**
 * HOME-1 landing page sections ("/"). Server components only — no client JavaScript on the landing page beyond the
 * shared shell (the FAQ is native <details>). Copy comes from content/landing.ts; numbers only from live reads
 * (lib/exams/category-data, lib/landing/landing-data); a failed read → the section's no-number fallback.
 * Owner rule: NO exam-specific details or actions on home — category tiles → /exams/<category> → exam pages.
 * Research (UX phase 1): low text, plain English, honest (no hype, no promises of selection, no fake numbers), fast on budget phones.
 */
import { ArrowRight, BookOpenCheck, Check, ChevronDown, ClipboardCheck, Gauge, Languages, Lock, NotebookPen, Repeat, RotateCcw } from "lucide-react";
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
 * Hero (HOME-1 expert UX pass): the slogan is the small eyebrow; the H1 says the value plainly and honestly — "Free
 * preparation for SSC exams" names only categories with live exams (app/page.tsx passes them from a cached, bounded
 * read; none → "government exams"); one short line; the content-language chip (the UI stays English, #82); ONE action
 * (components/landing/landing-cta); one REAL app screen in a CSS phone frame ("honest images", #86). The H1 stays the
 * LCP element: the screen is smaller than the H1 block, lazy, low fetch priority, sized (no layout shift).
 */
export function LandingHero({ liveCategories = [] }: { liveCategories?: readonly string[] }) {
  const mock = shot("hero");
  return (
    <GradientHero aria-labelledby="hero-title" data-hero="">
      <Container className="grid items-center gap-6 lg:grid-cols-[1fr_auto] lg:gap-12">
        <div className="flex flex-col items-start gap-4 lg:gap-5">
          <p className="inline-flex items-center gap-2 text-body font-semibold text-hero-accent-text" data-brand-line="">
            <span aria-hidden="true" className="size-2 rounded-full bg-accent-400" />
            {LANDING_HERO.eyebrow}
          </p>
          {/* 18ch: the line breaks are the same in the web font and its size-adjusted fallback (no font-swap shift) */}
          <h1 id="hero-title" className="max-w-[18ch] text-display font-bold tracking-tight text-hero-fg">
            {LANDING_HERO.title(liveCategories)}
          </h1>
          <p className="max-w-xl text-body-lg text-hero-fg-muted">{LANDING_HERO.lead}</p>
          <p className="inline-flex min-h-8 items-center gap-2 rounded-full border border-hero-bg-end bg-hero-bg-mid px-3 text-body-sm font-semibold text-hero-fg" data-hero-chip="">
            <Languages aria-hidden="true" className="size-4" />
            {LANDING_HERO.chip}
          </p>
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

/**
 * Categories (HOME-1 expert UX pass): every category with live exams is a LARGE card (a link: icon, name, its real exam
 * count, its short description, "See SSC exams"); the categories without exams yet are ONE quiet line ("Coming soon:
 * Police · Defence · …", not links). Adapts by itself when a category goes live.
 */
export function LandingCategories({ categories }: { categories: PublicCategory[] | null }) {
  const live = (categories ?? []).filter((c) => c.activeExams > 0);
  const soon = (categories ?? []).filter((c) => c.activeExams === 0);
  return (
    <Section aria-labelledby="categories-title" id="categories" spacing="compact" className="scroll-mt-24 bg-surface py-6 lg:py-12" data-reveal="">
      <Container className="flex flex-col gap-5">
        <SectionHeading id="categories-title" title={LANDING_CATEGORIES.heading} />
        {categories === null ? (
          <div className="flex flex-col items-start gap-3 rounded-card border border-line bg-surface p-5 shadow-e1">
            <p className="text-body text-fg-secondary">{LANDING_CATEGORIES.fallback}</p>
            <ButtonLink href={LANDING_CATEGORIES.allExams.href} variant="secondary" size="lg">
              {LANDING_CATEGORIES.allExams.label}
            </ButtonLink>
          </div>
        ) : (
          <>
            {live.length > 0 && (
              <ul className={`grid gap-4 ${live.length === 1 ? "max-w-3xl" : "md:grid-cols-2"}`} aria-label={LANDING_CATEGORIES.heading}>
                {live.map((c) => (
                  <li key={c.slug} className="flex">
                    <Link
                      href={`/exams/${c.slug}`}
                      className="focus-ring group flex w-full flex-col gap-4 rounded-card border border-primary-200 bg-surface p-5 shadow-e1 transition-colors hover:border-primary-400 sm:flex-row sm:items-center sm:p-6"
                      data-category-tile={c.slug}
                    >
                      <CategoryIcon category={c} px={64} />
                      <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
                        <span className="text-h3 font-bold text-fg">{c.name}</span>
                        <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-[14px] font-semibold text-primary-800">{categoryCountLabel(c.activeExams)}</span>
                        {c.shortDesc && <span className="text-body text-fg-secondary">{c.shortDesc}</span>}
                      </span>
                      <span className="inline-flex min-h-12 shrink-0 items-center gap-2 text-body font-semibold text-link group-hover:underline">
                        {LANDING_CATEGORIES.liveCta(c.name)}
                        <ArrowRight aria-hidden="true" className="size-5" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {soon.length > 0 && (
              <p className="text-body text-fg-secondary" data-category-soon-line="">
                <span className="font-semibold text-fg">{LANDING_CATEGORIES.comingSoonLine}</span>{" "}
                {soon.map((c, i) => (
                  <span key={c.slug} data-category-soon={c.slug}>
                    {i > 0 && <span aria-hidden="true"> · </span>}
                    {i > 0 && <span className="sr-only">, </span>}
                    {c.name}
                  </span>
                ))}
              </p>
            )}
          </>
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
      <Container className="flex flex-col gap-5">
        <SectionHeading id="categories-title" title={LANDING_CATEGORIES.heading} />
        <div aria-hidden="true" className="min-h-[176px] max-w-3xl rounded-card border border-line bg-canvas sm:min-h-[116px]" />
        <div aria-hidden="true" className="h-6 max-w-md rounded-control bg-canvas" />
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
    <Section aria-labelledby="loop-title" spacing="compact" className="bg-canvas py-6 lg:py-12" data-reveal="">
      <Container className="flex flex-col gap-6">
        <SectionHeading id="loop-title" title={LANDING_LOOP.heading} />
        <div className="relative" data-loop="">
          <ol className="relative flex flex-col md:grid md:grid-cols-5 md:gap-4 lg:gap-6" data-loop-steps="">
            {steps.map((step, i) => {
              const StepIcon = LOOP_ICONS[i] ?? Repeat;
              const s = shot(LOOP_SHOTS[i]);
              const last = i === steps.length - 1;
              return (
                <li key={step.title} className="relative flex gap-4 pb-5 md:flex-col md:gap-3 md:rounded-card md:border md:border-line md:bg-surface md:p-3 md:pb-3 md:shadow-e1 lg:p-4" data-loop-step={i + 1}>
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

/**
 * What you get (HOME-1 expert UX pass): the focal element is the LIVE numbers (big, from the live read; shown only when
 * the read worked and the number is above zero — never typed, never invented), then ONLY what works today as a plain
 * checklist (no card grid: each home section has its own shape).
 */
export function LandingFeatures({ data }: { data: LandingData }) {
  const live = landingFeatures(data).filter((r) => r.live);
  const shortOf = (key: string) => (LANDING_FEATURES.items as Record<string, { short?: string }>)[key]?.short;
  const F = LANDING_FEATURES.items;
  const stats = data.ok
    ? [
        { key: "exams", n: data.exams.length, unit: LANDING_FEATURES.examsUnit(data.exams.length) },
        { key: "mocks", n: data.totalPublishedMocks, unit: F.mocks.unit(data.totalPublishedMocks) },
        { key: "guides", n: data.totalPublishedGuides, unit: F.guides.unit(data.totalPublishedGuides) },
      ].filter((x) => x.n > 0)
    : [];
  return (
    <Section aria-labelledby="features-title" spacing="compact" className="bg-surface py-6 lg:py-12" data-reveal="">
      <Container className="flex flex-col gap-6">
        <SectionHeading id="features-title" title={LANDING_FEATURES.heading} lead={LANDING_FEATURES.lead} />
        {stats.length > 0 && (
          <ul className="grid grid-cols-1 divide-y divide-line rounded-card bg-primary-50 sm:grid-cols-3 sm:divide-x sm:divide-y-0" aria-label={LANDING_FEATURES.statsLabel} data-live-stats="">
            {stats.map((x) => (
              <li key={x.key} className="flex items-baseline gap-3 px-5 py-4 sm:flex-col sm:gap-1 sm:py-6" data-stat={x.key}>
                <span className="text-display font-bold leading-none tracking-tight text-primary-800 tabular-nums">{x.n}</span>
                <span className="text-body font-semibold text-fg">{x.unit}</span>
              </li>
            ))}
          </ul>
        )}
        <ul className="grid gap-x-10 gap-y-4 md:grid-cols-2" data-features-list="">
          {live.map((r) => (
            <li key={r.key} className="flex items-start gap-3">
              <Check aria-hidden="true" className="mt-1 size-5 shrink-0 text-success-700" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <h3 className="text-body-lg font-semibold text-fg">{r.title}</h3>
                <span className="text-body text-fg-secondary">{shortOf(r.key) ?? r.text}</span>
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
        <div aria-hidden="true" className="min-h-[220px] rounded-card bg-primary-50 sm:min-h-[132px]" />
        <ul className="grid gap-x-10 gap-y-4 md:grid-cols-2" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <li key={i} className="h-14 rounded-control bg-canvas" />
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
    <Section aria-labelledby="trust-title" spacing="compact" className="bg-canvas py-6 lg:py-12" data-reveal="">
      <Container>
        <div className="flex flex-col gap-4 overflow-hidden rounded-card border border-line bg-surface p-5 shadow-e1 sm:p-8">
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
    <Section aria-labelledby="plans-title" spacing="compact" className="bg-surface py-6 lg:py-12" data-reveal="">
      <Container className="flex flex-col gap-4">
        <SectionHeading id="plans-title" title={LANDING_PLANS.heading} />
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-e1">
          <table className="w-full border-collapse text-body" data-plans-table="">
            <caption className="sr-only">{T.caption}</caption>
            <thead className="bg-surface-sunken">
              <tr>
                <th scope="col" className="px-3 py-2 text-left text-body-sm font-semibold text-fg-secondary">{T.columns[0]}</th>
                <th scope="col" className="w-20 px-2 py-2 text-center text-body-sm font-semibold text-fg">{T.columns[1]}</th>
                <th scope="col" className="w-20 px-2 py-2 text-center text-body-sm font-semibold text-fg">
                  <span className="inline-flex items-center gap-1">
                    <Lock aria-hidden="true" className="size-4" />
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
    <Section aria-labelledby="faq-title" spacing="compact" className="bg-canvas py-6 lg:py-12" data-reveal="">
      <Container className="flex flex-col gap-6">
        <SectionHeading id="faq-title" title={LANDING_FAQ.heading} />
        <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface shadow-e1">
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
    <Section aria-labelledby="final-cta-title" className="hero-gradient hero-depth relative isolate overflow-hidden" data-final-cta="">
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
