/**
 * UX-2a landing page sections ("/"). Server components only — no client JavaScript on the landing page beyond
 * the shared shell. Copy comes from content/landing.ts; numbers only from LandingData (read live); when the read
 * failed (`data.ok === false`) every section renders its no-number fallback.
 */
import { ArrowRight, BookOpenCheck, Check, ClipboardCheck, Compass, Gauge, GraduationCap, Library, Lock, NotebookPen, Repeat, Search, Target } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardDescription, CardLink, CardTitle } from "@/components/ui/card";
import { Container, Section } from "@/components/ui/layout";
import { GlassCard } from "@/components/ui/glass";
import { GradientHero } from "@/components/ui/gradient-hero";
import {
  LANDING_EXAMS,
  LANDING_FEATURES,
  LANDING_FINAL_CTA,
  LANDING_HERO,
  LANDING_LOOP,
  LANDING_PLANS,
  LANDING_TRUST,
} from "@/content/landing";
import type { LandingData } from "@/lib/landing/landing-data";
import { LandingCta } from "./landing-cta";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
const LOOP_ICONS: Icon[] = [Compass, BookOpenCheck, NotebookPen, ClipboardCheck, Gauge, Search, Target];

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

/** Hero feature list: feature titles that are live today (copy from LANDING_FEATURES; no new claims, no numbers).
 *  UX-FIX-1: plain text with an icon — not pills (they are not tappable). */
const HERO_CHIPS = [LANDING_FEATURES.items.mocks.title, LANDING_FEATURES.items.analysis.title, LANDING_FEATURES.items.mistakes.title];
/** Hero glass card: the FIRST three steps of the loop + a link to all 7 (UX-FIX-1; copy from LANDING_LOOP). */
const HERO_STEPS = [0, 1, 2].map((i) => ({ n: i + 1, ...LANDING_LOOP.steps[i] }));

/**
 * BRAND-2 (#72) hero: GradientHero (CSS gradients, no image), the brand line split over two lines (second line in
 * hero-accent-text), ONE accent CTA (+ a ghost-on-dark secondary when sign-up is open — components/landing/landing-cta),
 * a plain feature list and one glass card (1 glass layer + the floating nav). Existing copy only.
 */
export function LandingHero() {
  const [line1, ...rest] = LANDING_HERO.title.split(". ");
  return (
    <GradientHero aria-labelledby="hero-title">
      <Container className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col items-start gap-6">
          <p className="inline-flex items-center gap-2 text-body-sm font-semibold uppercase tracking-wider text-hero-accent-text">
            <span aria-hidden="true" className="size-2 rounded-full bg-accent-500" />
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
          <p className="max-w-2xl text-body-lg text-hero-fg-muted">{LANDING_HERO.lead}</p>
          <div className="flex flex-wrap items-center gap-3">
            <LandingCta spot="hero" />
          </div>
          <ul aria-label={LANDING_FEATURES.heading} className="flex flex-wrap gap-x-5 gap-y-2">
            {HERO_CHIPS.map((chip) => (
              <li key={chip} className="inline-flex items-center gap-2 text-body-sm font-medium text-hero-fg">
                <Check aria-hidden="true" className="size-4 shrink-0 text-hero-accent-text" />
                {chip}
              </li>
            ))}
          </ul>
          <p className="text-body-sm text-hero-fg-muted">{LANDING_HERO.note}</p>
        </div>
        <GlassCard tone="dark" className="flex flex-col gap-3">
          <p className="font-heading text-body-lg font-semibold text-hero-fg">{LANDING_LOOP.heading}</p>
          <ol className="flex flex-col gap-2">
            {HERO_STEPS.map((s) => (
              <li key={s.title} className="flex items-start gap-3 rounded-card bg-hero-bg/40 p-3">
                <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-500 text-body-sm font-semibold text-on-accent">
                  {s.n}
                </span>
                <span className="flex flex-col">
                  <span className="text-body font-semibold text-hero-fg">{s.title}</span>
                  <span className="text-body-sm text-hero-fg-muted">{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
          <a href="#loop-title" className="focus-ring-on-dark inline-flex min-h-12 items-center gap-2 self-start rounded-control text-body-sm font-semibold text-hero-accent-text underline underline-offset-2">
            {LANDING_LOOP.seeAll(LANDING_LOOP.steps.length)}
            <ArrowRight aria-hidden="true" className="size-4" />
          </a>
        </GlassCard>
      </Container>
    </GradientHero>
  );
}

export function LandingLoop() {
  return (
    <Section aria-labelledby="loop-title">
      <Container className="flex flex-col gap-8">
        <SectionHeading id="loop-title" title={LANDING_LOOP.heading} lead={LANDING_LOOP.lead} />
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {LANDING_LOOP.steps.map((step, i) => {
            const StepIcon = LOOP_ICONS[i] ?? Repeat;
            return (
              <li key={step.title} className="relative flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-600 text-body-sm font-semibold text-fg-inverse"
                  >
                    {i + 1}
                  </span>
                  <StepIcon aria-hidden="true" className="size-5 text-accent-700" />
                </div>
                <h3 className="text-body-lg font-semibold text-fg">
                  <span className="sr-only">{LANDING_LOOP.stepLabel(i + 1)}</span>
                  {step.title}
                </h3>
                <p className="text-body-sm text-fg-secondary">{step.text}</p>
              </li>
            );
          })}
        </ol>
      </Container>
    </Section>
  );
}

export function LandingExams({ data }: { data: LandingData }) {
  const activeSlugs = new Set(data.ok ? data.exams.map((e) => e.slug) : []);
  const comingSoon = LANDING_EXAMS.comingSoon.filter((c) => !activeSlugs.has(c.slug));
  return (
    <Section aria-labelledby="exams-title" className="bg-surface-sunken">
      <Container className="flex flex-col gap-8">
        <SectionHeading id="exams-title" title={LANDING_EXAMS.heading} lead={LANDING_EXAMS.lead} />
        {!data.ok ? (
          <div className="flex flex-col items-start gap-3 rounded-card border border-line bg-surface p-6">
            <p className="text-body text-fg-secondary">{LANDING_EXAMS.fallback}</p>
            <ButtonLink href={LANDING_EXAMS.fallbackCta.href} variant="secondary">
              {LANDING_EXAMS.fallbackCta.label}
            </ButtonLink>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.exams.map((exam) => (
              <li key={exam.slug} className="flex">
                <Card variant="interactive" className="w-full">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle>
                      <CardLink href={`/exams/${exam.slug}`}>{exam.title}</CardLink>
                    </CardTitle>
                    <GraduationCap aria-hidden="true" className="size-6 shrink-0 text-primary-600" />
                  </div>
                  {exam.category && <CardDescription>{exam.category}</CardDescription>}
                  <ul className="flex flex-wrap gap-2" aria-label={LANDING_EXAMS.glanceLabel(exam.title)}>
                    <li>
                      <Badge tone={exam.publishedMocks > 0 ? "free" : "neutral"}>
                        {exam.publishedMocks > 0 ? LANDING_EXAMS.mocks(exam.publishedMocks) : LANDING_EXAMS.noMocks}
                      </Badge>
                    </li>
                    {exam.publishedGuides > 0 && (
                      <li>
                        <Badge tone="info">{LANDING_EXAMS.guides(exam.publishedGuides)}</Badge>
                      </li>
                    )}
                    <li>
                      <Badge tone={exam.syllabusAvailable ? "success" : "neutral"}>
                        {exam.syllabusAvailable ? LANDING_EXAMS.syllabusAvailable : LANDING_EXAMS.syllabusSoon}
                      </Badge>
                    </li>
                  </ul>
                  <p className="mt-auto inline-flex items-center gap-1 pt-1 text-body-sm font-medium text-primary-700" aria-hidden="true">
                    {LANDING_EXAMS.cardCta}
                    <ArrowRight className="size-4" />
                  </p>
                </Card>
              </li>
            ))}
            {comingSoon.map((exam) => (
              <li key={exam.slug} className="flex">
                <Card className="w-full border-dashed bg-surface">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-h3 font-semibold text-fg">{exam.title}</h3>
                    <Badge tone="neutral">{LANDING_EXAMS.comingSoonLabel}</Badge>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
        <div>
          <ButtonLink href={LANDING_EXAMS.allExamsCta.href} variant="ghost" trailingIcon={<ArrowRight aria-hidden="true" className="size-4" />}>
            {LANDING_EXAMS.allExamsCta.label}
          </ButtonLink>
        </div>
      </Container>
    </Section>
  );
}

/** Placeholder while the two data sections stream in; reserves roughly their height (no layout shift). */
export function LandingDataSkeleton() {
  return (
    <div aria-busy="true" aria-label={LANDING_EXAMS.loadingLabel}>
      <Section className="bg-surface-sunken">
        <Container className="flex flex-col gap-8">
          <div className="h-16 max-w-md rounded-card bg-ink-100 motion-safe:animate-pulse" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((k) => (
              <div key={k} className="h-44 rounded-card bg-ink-100 motion-safe:animate-pulse" />
            ))}
          </div>
        </Container>
      </Section>
      <Section>
        <Container className="flex flex-col gap-8">
          <div className="h-16 max-w-md rounded-card bg-ink-100 motion-safe:animate-pulse" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((k) => (
              <div key={k} className="h-32 rounded-card bg-ink-100 motion-safe:animate-pulse" />
            ))}
          </div>
        </Container>
      </Section>
    </div>
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

export function LandingFeatures({ data }: { data: LandingData }) {
  const rows = landingFeatures(data);
  const live = rows.filter((r) => r.live);
  const soon = rows.filter((r) => !r.live);
  return (
    <Section aria-labelledby="features-title">
      <Container className="flex flex-col gap-8">
        <SectionHeading id="features-title" title={LANDING_FEATURES.heading} lead={LANDING_FEATURES.lead} />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...live, ...soon].map((r) => (
            <li key={r.key} className={r.live ? "flex flex-col gap-2 rounded-card border border-line bg-surface p-5" : "flex flex-col gap-2 rounded-card border border-dashed border-line bg-surface-sunken p-5"}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-body-lg font-semibold text-fg">{r.title}</h3>
                <Badge tone={r.live ? "success" : "neutral"}>{r.live ? LANDING_FEATURES.liveLabel : LANDING_FEATURES.comingSoonLabel}</Badge>
              </div>
              <p className="text-body-sm text-fg-secondary">{r.text}</p>
              {r.detail && <p className="text-body-sm font-medium text-primary-700">{r.detail}</p>}
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}

export function LandingPlans() {
  return (
    <Section aria-labelledby="plans-title" spacing="compact">
      <Container>
        <div className="flex flex-col gap-3 rounded-card border border-primary-200 bg-primary-50 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex flex-col gap-2">
            <h2 id="plans-title" className="text-h2 font-bold tracking-tight text-fg">
              {LANDING_PLANS.heading}
            </h2>
            <p className="text-body-lg font-medium text-primary-800">{LANDING_PLANS.text}</p>
            <p className="max-w-prose text-body-sm text-fg-secondary">{LANDING_PLANS.detail}</p>
          </div>
          <Badge tone="pro" className="shrink-0 self-start whitespace-nowrap sm:self-center" icon={<Lock aria-hidden="true" className="size-3" />}>
            {LANDING_PLANS.proBadge}
          </Badge>
        </div>
      </Container>
    </Section>
  );
}

export function LandingTrust() {
  return (
    <Section aria-labelledby="trust-title">
      <Container>
        <div className="grid gap-6 rounded-card border border-line bg-surface p-6 sm:p-8 md:grid-cols-[auto_1fr] md:items-start">
          <span aria-hidden="true" className="inline-flex size-14 items-center justify-center rounded-card bg-accent-50 text-accent-700">
            <Library className="size-7" />
          </span>
          <div className="flex flex-col gap-3">
            <h2 id="trust-title" className="text-h2 font-bold tracking-tight text-fg">
              {LANDING_TRUST.heading}
            </h2>
            <p className="max-w-prose text-body-lg text-fg">{LANDING_TRUST.text}</p>
            <p className="max-w-prose text-body text-fg-secondary">{LANDING_TRUST.detail}</p>
            <p className="text-body-sm font-medium text-fg-secondary">{LANDING_TRUST.location}</p>
          </div>
        </div>
      </Container>
    </Section>
  );
}

export function LandingFinalCta() {
  return (
    <Section aria-labelledby="final-cta-title" className="hero-gradient">
      <Container className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <h2 id="final-cta-title" className="text-h2 font-bold tracking-tight text-fg-inverse">
            {LANDING_FINAL_CTA.heading}
          </h2>
        </div>
        <LandingCta spot="final" />
      </Container>
    </Section>
  );
}
