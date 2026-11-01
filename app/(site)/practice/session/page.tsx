import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Container } from "@/components/ui/layout";
import { PracticeRunner } from "@/components/practice/practice-runner";
import { PRACTICE_COPY } from "@/content/practice";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session-state";
import { userContentLanguage } from "@/lib/exams/exam-page-server";
import { isPracticeEnabled } from "@/lib/practice/flag";
import { isMemoryLockEnabled } from "@/lib/memory-lock/flag";
import { DIAGNOSTIC_SIZE, parseSetSize, pickDiagnostic, pickSet, type PracticeMode } from "@/lib/practice/engine";
import { examSections, loadPracticeQuestions, practiceExams, topicArticles, topicCandidates, topicContext } from "@/lib/practice/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: PRACTICE_COPY.title, robots: { index: false, follow: false } };

interface Props {
  searchParams: Promise<{ topic?: string; exam?: string; mode?: string; n?: string }>;
}

const ID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * F2 (#79): one practice set, built on the server. Topic set: n (5 / 10 / 20) servable questions of the topic, never
 * seen first, then least recently answered. Diagnostic: 10 questions across the exam's sections (same engine). The
 * runner receives text + options only; every answer is checked by fn_check_practice_answer.
 */
export default async function PracticeSessionPage({ searchParams }: Props) {
  if (!isPracticeEnabled()) notFound();
  const p = await searchParams;
  const C = PRACTICE_COPY;
  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  const back = `/practice${p.exam ? `?exam=${encodeURIComponent(p.exam)}` : ""}`;

  if (session.state !== "user") {
    const here = `/practice/session?${new URLSearchParams(Object.entries(p).filter(([, v]) => typeof v === "string") as Array<[string, string]>)}`;
    return (
      <Container className="py-10">
        <EmptyState
          icon={<ClipboardList />}
          title={C.signIn}
          description={C.signInLead}
          action={<ButtonLink href={`/auth/login?next=${encodeURIComponent(here)}`}>{C.signIn}</ButtonLink>}
        />
      </Container>
    );
  }
  const userId = session.user.id;
  const language = await userContentLanguage();
  const exams = await practiceExams(supabase, userId);
  const exam = exams.find((e) => e.slug === p.exam) ?? null;

  let mode: PracticeMode = "TOPIC";
  let title: string = C.title;
  let questionIds: string[] = [];
  const topicNames: Record<string, string> = {};
  let nextTopicHref: string | null = null;
  let againHref = back;

  if (p.mode === "diagnostic" && exam) {
    mode = "DIAGNOSTIC";
    title = C.diagnostic.title(exam.title);
    const sections = await examSections(supabase, exam.id);
    const topicIds = sections.flatMap((s) => s.topics.map((t) => t.id));
    sections.forEach((s) => s.topics.forEach((t) => (topicNames[t.id] = t.name)));
    const cands = await topicCandidates(supabase, userId, topicIds);
    questionIds = pickDiagnostic(sections.map((s) => ({ sectionId: s.id, candidates: s.topics.flatMap((t) => cands.get(t.id) ?? []) })), DIAGNOSTIC_SIZE);
    againHref = `/practice/session?${new URLSearchParams({ exam: exam.slug, mode: "diagnostic" })}`;
  } else if (p.topic && ID_RX.test(p.topic)) {
    const topic = await topicContext(supabase, p.topic);
    if (!topic) notFound();
    const n = parseSetSize(p.n);
    title = topic.name;
    topicNames[topic.id] = topic.name;
    const cands = await topicCandidates(supabase, userId, [topic.id]);
    questionIds = pickSet(cands.get(topic.id) ?? [], n);
    againHref = `/practice/session?${new URLSearchParams({ topic: topic.id, ...(exam ? { exam: exam.slug } : {}), n: String(n) })}`;
    if (exam) {
      const all = (await examSections(supabase, exam.id)).flatMap((s) => s.topics);
      const i = all.findIndex((t) => t.id === topic.id);
      const next = i >= 0 ? all[i + 1] : undefined;
      if (next) nextTopicHref = `/practice/session?${new URLSearchParams({ topic: next.id, exam: exam.slug, n: String(n) })}`;
    }
  } else {
    notFound();
  }

  const questions = await loadPracticeQuestions(supabase, questionIds, language);
  const articles = await topicArticles([...new Set(questions.map((q) => q.topicId).filter((t): t is string => Boolean(t)))]);

  return (
    <Container className="flex max-w-3xl flex-col gap-6 py-8 lg:py-10">
      <header className="flex flex-col gap-1">
        <p className="text-body-sm font-semibold text-fg-secondary">{C.title}</p>
        <h1 className="text-h1 font-bold text-fg">{title}</h1>
      </header>
      {questions.length === 0 ? (
        <EmptyState icon={<ClipboardList />} title={C.end.empty} action={<ButtonLink href={back}>{C.end.allTopics}</ButtonLink>} />
      ) : (
        <PracticeRunner
          setId={randomUUID()}
          mode={mode}
          title={title}
          questions={questions}
          topicNames={topicNames}
          articles={articles}
          againHref={againHref}
          nextTopicHref={nextTopicHref}
          chooseHref={back}
          canAddToMemoryLock={isMemoryLockEnabled()}
        />
      )}
    </Container>
  );
}
