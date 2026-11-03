import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Clock, Coins, Focus, Lock, X } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { headingAnchor, LessonBlocksRenderer } from "@/components/learning/lesson-blocks-renderer";
import { KatexMath } from "@/components/learning/katex-math";
import { LessonComplete } from "@/components/learning/lesson-complete";
import { FocusToggle, OutlineSheet, ReadingProgressBar, ReadingTracker } from "@/components/learning/lesson-reader-client";
import { focusModeScript } from "@/lib/learning/focus-mode";
import { LessonStatusIcon, STATUS_TEXT } from "@/components/learning/course-ui";
import { constructMetadata } from "@/lib/seo/metadata";
import { generateBreadcrumbSchema } from "@/lib/seo/jsonld";
import { jsonLdText, learningResourceSchema, lessonAlternates, PAYWALL_SELECTOR } from "@/lib/learn/seo";
import { learnHref, segmentsToHierarchyPath } from "@/lib/learn/paths";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isPracticeEnabled } from "@/lib/practice/flag";
import { servableTopicCounts } from "@/lib/practice/server";
import { neighbours, practiceAction, type CourseLesson } from "@/lib/learning/course-structure";
import { ExamCourseService, type CourseView } from "@/services/learning/course.service";
import { getSessionState } from "@/lib/auth/session-state";
import { getMasterLessonPage, loadMasterData } from "@/services/learning/master-lesson.service";
import { saveLessonProgressAction } from "@/app/(site)/articles/actions";

/**
 * CA-6 master lesson page (design G) — /learn/<subject>/<topic>[/<subtopic>[/<concept>]] (EN, canonical, full text) and
 * /hi/learn/… (Hindi when published; otherwise English, noindex, canonical → EN). Server-rendered; the lesson data is
 * cached (tag "learn") and revalidated on publish; viewer state (Pro access, progress) per request. A Pro lesson shows
 * title + intro + outline (indexable) and a gated section without the body (paywalled-content markup). English UI (R9).
 * COURSE-UX-1 screen C: with ?course=<exam> (a LIVE course containing this lesson) — course outline (desktop rail /
 * phone sheet) and previous / next; always — reading progress bar, "On this page", reading minutes, EN / HI toggle
 * when Hindi is published, focus mode (R13), resume at the server-saved block, server-checked quick checks and a
 * completion the server decides (end + quick checks + time), then Practice (real count) and the next lesson.
 */

const LEVEL: Record<string, string> = { TOPIC: "Topic", SUBTOPIC: "Subtopic", CONCEPT: "Concept" };

export async function masterLessonMetadata(segments: string[], language: "en" | "hi"): Promise<Metadata> {
  const path = segmentsToHierarchyPath(segments);
  const data = path ? await loadMasterData(path) : null;
  if (!path || !data) return constructMetadata({ title: "Lesson not found", noIndex: true });
  const alt = lessonAlternates({ enPath: learnHref(path), hiPath: learnHref(path, "hi"), language, hiPublished: Boolean(data.lesson?.hi), hasLesson: Boolean(data.lesson) });
  const version = data.lesson ? (language === "hi" && data.lesson.hi ? data.lesson.hi : data.lesson.en) : null;
  const title = version?.meta.seo?.meta_title || version?.meta.title || data.node.name;
  const description = version?.meta.seo?.meta_description || version?.meta.summary || `${data.node.name}: study notes${data.node.subjectName ? ` for ${data.node.subjectName}` : ""}.`;
  const base = constructMetadata({ title, description, canonicalUrl: alt.canonical, ogType: "article", publishedTime: data.lesson?.publishedAt || undefined, noIndex: alt.noIndex || Boolean(data.lesson?.isTestContent) });
  return { ...base, alternates: { ...base.alternates, ...(alt.languages ? { languages: alt.languages } : {}) } };
}

/** The course outline (desktop rail and phone sheet): subjects → lessons with their state; this lesson marked. */
function CourseOutline({ course, current }: { course: CourseView; current: string }) {
  return (
    <nav aria-label={`${course.exam.title} course outline`} className="flex flex-col gap-3" data-testid="course-outline">
      <div className="flex flex-col gap-1 px-2">
        <Link href={`/exams/${course.exam.slug}/course`} className="focus-ring inline-flex min-h-12 items-center text-body font-semibold text-fg hover:text-primary-700">
          {course.exam.title} course
        </Link>
        {course.signedIn && course.totals.lessons > 0 && (
          <p className="text-body-sm text-fg-secondary">
            {course.totals.completed} of {course.totals.lessons} lessons completed
          </p>
        )}
      </div>
      {course.subjects
        .filter((sub) => sub.totals.lessons > 0)
        .map((sub) => (
          <div key={sub.slug} className="flex flex-col gap-1">
            <p className="px-2 text-caption font-semibold uppercase tracking-wide text-fg-secondary">{sub.title}</p>
            <ul className="flex flex-col">
              {sub.topics
                .flatMap((t) => t.lessons)
                .map((l) => (
                  <li key={l.documentId}>
                    <Link
                      href={l.href}
                      aria-current={l.documentId === current ? "page" : undefined}
                      className="focus-ring flex min-h-12 items-center gap-2 rounded-control px-2 text-body-sm text-fg hover:bg-ink-50 aria-[current=page]:bg-primary-50 aria-[current=page]:font-semibold aria-[current=page]:text-primary-800"
                    >
                      <LessonStatusIcon status={l.status} locked={l.locked} />
                      <span className="flex-1">{l.name}</span>
                      <span className="sr-only">{l.locked ? "Pro lesson, locked" : STATUS_TEXT[l.status]}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        ))}
    </nav>
  );
}

function PrevLink({ lesson }: { lesson: CourseLesson | null }) {
  if (!lesson) return <span className="flex-1" />;
  return (
    <Link href={lesson.href} className="focus-ring inline-flex min-h-12 flex-1 items-center gap-1 rounded-control px-3 text-body-sm font-semibold text-fg hover:bg-ink-50" data-testid="lesson-prev">
      <ChevronLeft aria-hidden="true" className="size-5 shrink-0" />
      <span aria-hidden="true">Previous</span>
      <span className="sr-only">Previous lesson: {lesson.name}</span>
    </Link>
  );
}

function NextLink({ lesson }: { lesson: CourseLesson | null }) {
  if (!lesson) return <span className="flex-1" />;
  return (
    <Link href={lesson.href} className="focus-ring inline-flex min-h-12 flex-1 items-center justify-end gap-1 rounded-control px-3 text-body-sm font-semibold text-fg hover:bg-ink-50" data-testid="lesson-next">
      <span aria-hidden="true">Next</span>
      <span className="sr-only">Next lesson: {lesson.name}</span>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0" />
    </Link>
  );
}

const READER_ID = "lesson-reader";

export async function MasterLessonPageView({ segments, language, courseSlug = null }: { segments: string[]; language: "en" | "hi"; courseSlug?: string | null }) {
  const page = await getMasterLessonPage(segments, language);
  if (!page) notFound();
  const { data } = page;
  if (!data.lesson && data.children.length === 0) notFound();

  const pagePath = learnHref(data.node.hierarchyPath, language);
  const supabase = await createServerSupabaseClient();
  const [session, practiceCount, courseView] = await Promise.all([
    getSessionState(supabase),
    data.node.topicId && isPracticeEnabled() ? servableTopicCounts(supabase, [data.node.topicId]).then((m) => m.get(data.node.topicId as string) ?? 0, () => 0) : Promise.resolve(0),
    data.lesson ? ExamCourseService.getCourseForReader(courseSlug) : Promise.resolve(null),
  ]);
  const signedIn = session.state === "user";
  const lessonId = data.lesson?.documentId ?? null;
  // the course context only when this lesson is part of that (LIVE or staff-previewed) course
  const course = courseView && lessonId && courseView.order.some((l) => l.documentId === lessonId) ? courseView : null;
  const nb = course && lessonId ? neighbours(course.order, lessonId) : { prev: null, next: null, index: -1 };
  const practice = practiceAction(data.node.topicId, practiceCount);
  const courseQuery = course ? `?${new URLSearchParams({ course: course.exam.slug })}` : "";

  let progress = page.progress;
  if (progress && progress !== "COMPLETED" && data.lesson && page.shown) {
    // opening the lesson records READING and the server-side reading session (server only; a failure only skips the
    // record). COURSE-UX-1: on every open until completed — the session keeps its FIRST start
    const r = await saveLessonProgressAction({ documentId: data.lesson.documentId, language: page.shown, status: "READING" }).catch(() => null);
    if (r?.ok) progress = r.status;
  }

  const version = data.lesson ? (page.shown === "hi" && data.lesson.hi ? data.lesson.hi : data.lesson.en) : null;
  const title = version?.meta.title || data.node.name;
  const headings = page.body ? page.body.blocks.flatMap((b) => (b.type === "heading" && b.level === 2 ? [{ id: b.id, text: b.text }] : [])) : [];
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      generateBreadcrumbSchema([{ label: "Home", href: "/" }, ...data.breadcrumbs.map((b) => ({ label: b.name, ...(b.href ? { href: b.href } : {}) }))]),
      // CA-7 SEO-HYGIENE-1: QA test content is never described to search engines
      ...(version && !data.lesson?.isTestContent
        ? [
            learningResourceSchema({
              name: title,
              description: version.meta.summary || null,
              path: pagePath,
              language: page.shown === "hi" ? "hi" : "en",
              isFree: page.access === "FREE",
              datePublished: data.lesson?.publishedAt || null,
              about: [data.node.name, ...(data.node.topicName && data.node.topicName !== data.node.name ? [data.node.topicName] : []), ...(data.node.subjectName ? [data.node.subjectName] : [])],
            }),
          ]
        : []),
    ],
  };

  const after = (
    <div className="flex flex-wrap gap-3">
      {practice && (
        <ButtonLink href={practice.href} variant="secondary" size="lg" className="min-h-12" data-testid="lesson-practice">
          {practice.label}
        </ButtonLink>
      )}
      {nb.next && (
        <ButtonLink href={nb.next.href} variant="primary" size="lg" className="min-h-12" data-testid="lesson-next-after">
          Next lesson
        </ButtonLink>
      )}
    </div>
  );

  const onThisPage = (testId: string) => (
    <ul className="flex flex-col" data-testid={testId}>
      {headings.map((h) => (
        <li key={h.id}>
          <a href={`#${headingAnchor(h.id)}`} className="focus-ring flex min-h-12 items-center rounded-control px-2 text-body-sm text-fg hover:bg-ink-50">
            {h.text}
          </a>
        </li>
      ))}
    </ul>
  );

  return (
    <div id={READER_ID} suppressHydrationWarning className="group/reader py-8 lg:py-12" data-master-lesson="">
      {/* focus mode is restored before paint (no flash, no layout shift) */}
      <script dangerouslySetInnerHTML={{ __html: focusModeScript(READER_ID) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(jsonLd) }} />
      {page.body && <ReadingProgressBar />}
      {page.body && signedIn && lessonId && page.shown && <ReadingTracker documentId={lessonId} language={page.shown} lastBlockId={page.lastBlockId} resume={progress === "READING"} />}

      <div
        className={`mx-auto grid w-full max-w-[1280px] gap-8 px-4 md:px-6 lg:px-8 ${course ? "lg:grid-cols-[16rem_minmax(0,1fr)_12rem]" : "lg:grid-cols-[minmax(0,1fr)_12rem]"} group-data-[focus=on]/reader:lg:grid-cols-[minmax(0,1fr)]`}
      >
        {course && lessonId && (
          <aside className="hidden lg:block group-data-[focus=on]/reader:lg:hidden">
            <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-2">
              <CourseOutline course={course} current={lessonId} />
            </div>
          </aside>
        )}

        <div className="mx-auto flex w-full min-w-0 max-w-[720px] flex-col gap-6">
          <nav aria-label="Breadcrumbs" className="flex flex-wrap items-center gap-x-2 text-body-sm text-fg-secondary">
            {course && (
              <span className="inline-flex items-center gap-2">
                <Link href={`/exams/${course.exam.slug}/course`} className="focus-ring inline-flex min-h-12 items-center font-medium hover:text-fg">
                  {course.exam.title} course
                </Link>
                <span aria-hidden="true">/</span>
              </span>
            )}
            {data.breadcrumbs.map((b, i) => (
              <span key={i} className="inline-flex items-center gap-2">
                {i > 0 && <span aria-hidden="true">/</span>}
                {b.href && i < data.breadcrumbs.length - 1 ? (
                  <Link href={b.href} className="focus-ring inline-flex min-h-12 items-center font-medium hover:text-fg">
                    {b.name}
                  </Link>
                ) : (
                  <span aria-current={i === data.breadcrumbs.length - 1 ? "page" : undefined}>{b.name}</span>
                )}
              </span>
            ))}
          </nav>

          <article className="flex flex-col gap-6 rounded-card border border-line bg-surface p-4 sm:p-8" data-article="">
            <header className="flex flex-col gap-3 border-b border-line pb-6">
              <p className="text-body-sm font-semibold text-fg-secondary">
                {LEVEL[data.node.nodeType] ?? "Lesson"}
                {data.node.subjectName ? ` · ${data.node.subjectName}` : ""}
              </p>
              <h1 className="text-h1 font-bold text-fg">{title}</h1>
              {version?.meta.summary && <p className="text-body-lg text-fg-secondary">{version.meta.summary}</p>}
              {page.body && (
                <div className="flex flex-wrap items-center gap-3">
                  {page.minutes !== null && (
                    <span className="inline-flex items-center gap-1 text-body-sm text-fg-secondary" data-testid="lesson-minutes">
                      <Clock aria-hidden="true" className="size-4" /> {page.minutes} min read
                    </span>
                  )}
                  {data.lesson?.hi && (
                    <span className="inline-flex rounded-control border border-line" role="group" aria-label="Lesson language" data-testid="lesson-language-toggle">
                      <Link
                        href={`${learnHref(data.node.hierarchyPath, "en")}${courseQuery}`}
                        aria-current={page.shown === "en" ? "true" : undefined}
                        lang="en"
                        className="focus-ring inline-flex min-h-12 items-center px-3 text-body-sm font-medium text-fg aria-[current=true]:bg-primary-50 aria-[current=true]:text-primary-800"
                      >
                        English
                      </Link>
                      <Link
                        href={`${learnHref(data.node.hierarchyPath, "hi")}${courseQuery}`}
                        aria-current={page.shown === "hi" ? "true" : undefined}
                        lang="hi"
                        className="focus-ring inline-flex min-h-12 items-center border-l border-line px-3 text-body-sm font-medium text-fg aria-[current=true]:bg-primary-50 aria-[current=true]:text-primary-800"
                      >
                        हिंदी
                      </Link>
                    </span>
                  )}
                  <span className="ml-auto">
                    <FocusToggle rootId={READER_ID} icon={<Focus aria-hidden="true" className="size-4" />} />
                  </span>
                </div>
              )}
            </header>

            {language === "hi" && data.lesson && !data.lesson.hi && (
              <p className="rounded-card border border-line bg-surface-sunken px-4 py-3 text-body-sm text-fg-secondary" data-testid="lesson-language-note">
                Hindi coming soon. This lesson is shown in English for now.
              </p>
            )}

            {!data.lesson ? (
              <p className="text-body text-fg-secondary">The lesson for this {LEVEL[data.node.nodeType]?.toLowerCase() ?? "node"} is being written. Its parts below already have lessons.</p>
            ) : page.locked && page.teaser ? (
              <>
                {page.teaser.outline.length > 0 && (
                  <section aria-labelledby="outline-h">
                    <h2 id="outline-h" className="mb-2 text-h3 font-semibold text-fg">
                      In this lesson
                    </h2>
                    <ul className="ml-5 list-disc text-body text-fg">
                      {page.teaser.outline.map((o, i) => (
                        <li key={i}>{o}</li>
                      ))}
                    </ul>
                  </section>
                )}
                <section className={`${PAYWALL_SELECTOR.slice(1)} flex flex-col items-center gap-3 rounded-card border border-line bg-surface-sunken p-6 text-center`} data-testid="learning-locked-panel">
                  <Lock aria-hidden="true" className="size-6 text-fg-secondary" />
                  <h2 className="text-h3 font-semibold text-fg">This lesson is part of Courage Library PRO</h2>
                  <p className="text-body text-fg-secondary">The full lesson, worked examples and exam traps are in PRO.</p>
                  <ButtonLink href="/billing" variant="secondary" size="lg" className="min-h-12">
                    See PRO
                  </ButtonLink>
                </section>
              </>
            ) : page.body && lessonId ? (
              <>
                {headings.length > 1 && (
                  <details className="rounded-card border border-line lg:hidden">
                    <summary className="focus-ring flex min-h-12 cursor-pointer items-center rounded-card px-4 text-body-sm font-semibold text-fg">On this page</summary>
                    <div className="px-2 pb-2">{onThisPage("on-this-page-phone")}</div>
                  </details>
                )}
                <div lang={page.shown ?? "en"} className="text-body text-fg">
                  <LessonBlocksRenderer blocks={page.body.blocks} links={page.body.links} Math={KatexMath} check={{ documentId: lessonId, language: page.shown ?? "en", answered: page.answered }} />
                </div>
                {progress ? (
                  <LessonComplete documentId={lessonId} language={page.shown ?? "en"} pagePath={pagePath} completed={progress === "COMPLETED"} after={after} doneIcon={<CheckCircle2 aria-hidden="true" className="size-5" />} coinIcon={<Coins aria-hidden="true" className="size-5" />} />
                ) : (
                  <div className="flex flex-col gap-4 border-t border-line pt-6">
                    <p className="text-body text-fg-secondary">
                      <Link href={`/auth/login?${new URLSearchParams({ next: `${pagePath}${courseQuery}` })}`} className="focus-ring font-semibold text-link underline underline-offset-2">
                        Sign in
                      </Link>{" "}
                      to save your progress.
                    </p>
                    {after}
                  </div>
                )}
              </>
            ) : null}
          </article>

          {course && (
            <div className="hidden gap-3 lg:flex">
              <PrevLink lesson={nb.prev} />
              <NextLink lesson={nb.next} />
            </div>
          )}

          {!page.body && practice && (
            <div>
              <ButtonLink href={practice.href} variant="primary" size="lg" className="min-h-12">
                {practice.label}
              </ButtonLink>
            </div>
          )}

          {data.children.length > 0 && (
            <section aria-labelledby="parts-h" className="flex flex-col gap-2">
              <h2 id="parts-h" className="text-h3 font-semibold text-fg">
                Go deeper
              </h2>
              <ul className="flex flex-col">
                {data.children.map((c) => (
                  <li key={c.href}>
                    <Link href={c.href} className="focus-ring flex min-h-12 items-center gap-3 rounded-control px-3 hover:bg-ink-50">
                      <BookOpen aria-hidden="true" className="size-5 text-primary-600" />
                      <span className="text-body font-medium text-fg">{c.name}</span>
                      <span className="text-body-sm text-fg-secondary">{LEVEL[c.nodeType] ?? ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.exams.length > 0 && (
            <section aria-labelledby="exams-h" className="flex flex-col gap-2">
              <h2 id="exams-h" className="text-h3 font-semibold text-fg">
                How exams ask this
              </h2>
              <ul className="flex flex-wrap gap-2">
                {data.exams.map((e) => (
                  <li key={e.slug}>
                    <Link href={e.href} className="focus-ring inline-flex min-h-12 items-center rounded-control border border-line px-3 text-body font-medium text-link hover:bg-ink-50">
                      {e.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="hidden lg:block group-data-[focus=on]/reader:lg:hidden">
          {headings.length > 1 && (
            <nav aria-label="On this page" className="sticky top-20 flex flex-col gap-1">
              <p className="px-2 text-caption font-semibold uppercase tracking-wide text-fg-secondary">On this page</p>
              {onThisPage("on-this-page")}
            </nav>
          )}
        </aside>
      </div>

      {course && lessonId && (
        // phones: Previous / Outline / Next — above the student bottom nav when signed in, else at the bottom edge
        <div
          className={`sticky z-20 mt-6 flex items-center gap-1 border-t border-line bg-surface px-2 lg:hidden ${signedIn ? "bottom-[calc(4rem+1px+env(safe-area-inset-bottom))]" : "bottom-0 pb-[env(safe-area-inset-bottom)]"}`}
          data-testid="lesson-bottom-bar"
        >
          <PrevLink lesson={nb.prev} />
          <OutlineSheet title={`${course.exam.title} course outline`} icon={<BookOpen aria-hidden="true" className="size-5" />} closeIcon={<X aria-hidden="true" className="size-5" />}>
            <CourseOutline course={course} current={lessonId} />
          </OutlineSheet>
          <NextLink lesson={nb.next} />
        </div>
      )}
    </div>
  );
}
