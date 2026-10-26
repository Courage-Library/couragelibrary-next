import React from "react";
import Link from "next/link";
import { Bookmark, BookOpen, Repeat, Zap } from "lucide-react";
import { Container } from "@/components/ui/layout";
import { Card, CardBody, CardDescription, CardFooter, CardHeader, CardLink, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PillLink } from "@/components/ui/pill-button";
import { cn } from "@/components/ui/cn";
import { PRACTICE_COPY } from "@/content/practice";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session-state";
import { formatNumber } from "@/lib/format";
import { isPracticeEnabled } from "@/lib/practice/flag";
import { SET_SIZES, parseSetSize } from "@/lib/practice/engine";
import { examSections, practiceExams } from "@/lib/practice/server";

export const dynamic = "force-dynamic";

// UX-2b.3 (F-01): every card links to a route that works today. Practice here draws on the questions a student
// got wrong in mocks; topic-by-topic practice sessions do not exist yet, so nothing below promises them.
const CARDS = [
  {
    id: "drill",
    icon: Zap,
    title: "Drill your mistakes",
    description:
      "Pick 5 to 20 questions from your mistakes, highest priority first. Answer one correctly twice in a row in a drill and it counts as mastered.",
    href: "/mistakes/drill",
    cta: "Start a drill",
    variant: "primary" as const,
  },
  {
    id: "bookmarked",
    icon: Bookmark,
    title: "Bookmarked mistakes",
    description: "Go back to the mistakes you bookmarked and review their solutions.",
    href: "/mistakes?bookmarked=true",
    cta: "Open bookmarked mistakes",
    variant: "secondary" as const,
  },
];

interface Props {
  searchParams: Promise<{ exam?: string; n?: string }>;
}

/**
 * F2 (#79): with PRACTICE_ENABLED, /practice is topic practice — exam (the student's goals first) → section → topic
 * (servable question count; topics with 0 hidden), set size 5 / 10 / 20, a 10-question diagnostic as the ONE primary
 * action (R4), and Mistake drills as a clear second entry. With the flag off it is the Mistake-drills hub below.
 */
export default async function PracticePage({ searchParams }: Props) {
  if (!isPracticeEnabled()) return <MistakeDrillsHub />;
  const params = await searchParams;
  const C = PRACTICE_COPY;
  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  const userId = session.state === "user" ? session.user.id : null;
  const exams = await practiceExams(supabase, userId);
  const exam = exams.find((e) => e.slug === params.exam) ?? exams[0] ?? null;
  const n = parseSetSize(params.n);
  const sections = exam ? await examSections(supabase, exam.id) : [];
  const anyTopic = sections.some((s) => s.topics.length > 0);
  const q = (over: Record<string, string>) => `/practice?${new URLSearchParams({ ...(exam ? { exam: exam.slug } : {}), n: String(n), ...over }).toString()}`;

  return (
    <Container className="flex flex-col gap-8 py-8 lg:py-12" data-practice-chooser="">
      <header className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-h1 font-bold text-fg">{C.title}</h1>
        <p className="text-body text-fg-secondary">{C.lead}</p>
        {!userId && (
          <p className="text-body-sm text-fg-secondary">
            <Link href="/auth/login?next=%2Fpractice" className="focus-ring inline-flex min-h-12 items-center font-medium text-link underline underline-offset-2">
              {C.signIn}
            </Link>{" "}
            — {C.signInLead}
          </p>
        )}
      </header>

      {exams.length === 0 || !exam ? (
        <EmptyState icon={<BookOpen />} title={C.noExams} />
      ) : (
        <>
          {exams.length > 1 && (
            <nav aria-label={C.examLabel} className="flex flex-wrap gap-2">
              {exams.map((e) => (
                <Link
                  key={e.id}
                  href={`/practice?${new URLSearchParams({ exam: e.slug, n: String(n) })}`}
                  aria-current={e.id === exam.id ? "page" : undefined}
                  className={cn("focus-ring inline-flex min-h-12 items-center rounded-full border px-4 text-body-sm font-medium", e.id === exam.id ? "border-2 border-primary-600 bg-primary-50 text-fg" : "border-line-control bg-surface text-fg")}
                >
                  {e.title}
                </Link>
              ))}
            </nav>
          )}

          {anyTopic && (
            <section aria-labelledby="diagnostic-title" className="flex flex-col items-start gap-2 rounded-card border border-line bg-surface p-4 sm:p-6">
              <h2 id="diagnostic-title" className="text-h3 font-semibold text-fg">
                {C.diagnostic.title(exam.title)}
              </h2>
              <p className="text-body text-fg-secondary">{C.diagnostic.lead}</p>
              <PillLink href={`/practice/session?${new URLSearchParams({ exam: exam.slug, mode: "diagnostic" })}`} variant="primary">
                {C.diagnostic.cta}
              </PillLink>
            </section>
          )}

          <section aria-labelledby="topics-title" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="topics-title" className="text-h2 font-bold text-fg">
                {C.sectionsTitle}
              </h2>
              <nav aria-label={C.setSize} className="flex items-center gap-2">
                <span className="text-body-sm text-fg-secondary">{C.setSize}</span>
                {SET_SIZES.map((s) => (
                  <Link
                    key={s}
                    href={q({ n: String(s) })}
                    aria-current={s === n ? "true" : undefined}
                    className={cn("focus-ring inline-flex size-12 items-center justify-center rounded-full border text-body-sm font-semibold", s === n ? "border-2 border-primary-600 bg-primary-50 text-fg" : "border-line-control bg-surface text-fg")}
                  >
                    {s}
                  </Link>
                ))}
              </nav>
            </div>
            {sections.map((s) => (
              <section key={s.id} aria-label={s.name} className="flex flex-col gap-3">
                <h3 className="text-h3 font-semibold text-fg">{s.name}</h3>
                {s.topics.length === 0 ? (
                  <p className="text-body-sm text-fg-secondary">{C.noTopics}</p>
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {s.topics.map((t) => (
                      <li key={t.id} className="flex">
                        <Card variant="interactive" padding="sm" className="min-h-12 w-full" data-topic-card="">
                          <CardTitle as="h4" className="text-body font-semibold">
                            <CardLink href={`/practice/session?${new URLSearchParams({ topic: t.id, exam: exam.slug, n: String(n) })}`}>{t.name}</CardLink>
                          </CardTitle>
                          <CardDescription>{C.questionCount(formatNumber(t.count))}</CardDescription>
                        </Card>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </section>
        </>
      )}

      <section aria-labelledby="drills-title" className="flex">
        <Card variant="interactive" className="w-full" data-drills-entry="">
          <div className="flex items-start gap-3">
            <Repeat aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-primary-600" />
            <div className="flex flex-col gap-1">
              <CardTitle as="h2" className="text-h3" id="drills-title">
                <CardLink href="/mistakes/drill">{C.drills.title}</CardLink>
              </CardTitle>
              <CardDescription>{C.drills.text}</CardDescription>
            </div>
          </div>
        </Card>
      </section>
    </Container>
  );
}

/** The pre-F2 page (flag off): Mistake drills and bookmarked mistakes. */
function MistakeDrillsHub() {
  return (
    <Container className="flex flex-col gap-8 py-8 lg:py-12">
      <header className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-h1 font-bold text-fg">Practice</h1>
        <p className="text-body text-fg-secondary">
          Practice the questions you got wrong in mock tests until you get them right.
        </p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <li key={c.id}>
              <Card className="h-full">
                <CardHeader>
                  <span
                    aria-hidden="true"
                    className="mb-2 flex size-12 items-center justify-center rounded-card bg-primary-50 text-primary-700"
                  >
                    <Icon className="size-6" />
                  </span>
                  <CardTitle as="h2">{c.title}</CardTitle>
                </CardHeader>
                <CardBody>
                  <CardDescription className="text-body">{c.description}</CardDescription>
                </CardBody>
                <CardFooter>
                  <ButtonLink href={c.href} variant={c.variant} fullWidth>
                    {c.cta}
                  </ButtonLink>
                </CardFooter>
              </Card>
            </li>
          );
        })}
      </ul>

      <p className="flex items-center gap-2 text-body-sm text-fg-secondary">
        <BookOpen aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
        No mistakes yet? Take a mock test first: every question you get wrong is saved for practice.
        <ButtonLink href="/mock-tests" variant="ghost" size="md" className="-my-2">
          Mock tests
        </ButtonLink>
      </p>
    </Container>
  );
}
