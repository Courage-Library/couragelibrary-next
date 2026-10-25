import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { Container } from "@/components/ui/layout";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PracticeRunner } from "@/components/practice/practice-runner";
import { MEMORY_LOCK } from "@/content/memory-lock";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session-state";
import { userContentLanguage } from "@/lib/exams/exam-page-server";
import { isMemoryLockEnabled } from "@/lib/memory-lock/flag";
import { loadMemoryLock } from "@/lib/memory-lock/server";
import { loadPracticeQuestions, topicArticles } from "@/lib/practice/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: MEMORY_LOCK.sessionTitle, robots: { index: false, follow: false } };

/**
 * F5 Memory Lock review: today's queue (most overdue first, then most lapses; capped by the onboarding daily minutes;
 * grouped by topic) in the F2 runner. The runner receives text + options only — never a key or explanation; every
 * answer goes through fn_memory_lock_answer (one atomic check + record + reschedule).
 */
export default async function MemoryLockSessionPage() {
  if (!isMemoryLockEnabled()) notFound();
  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  if (session.state !== "user") redirect("/auth/login?next=%2Fmemory-lock%2Fsession");

  const ml = await loadMemoryLock(supabase, session.user.id);
  const ids = ml.groups.flatMap((g) => g.items.map((i) => i.questionId));
  const language = await userContentLanguage();
  const questions = await loadPracticeQuestions(supabase, ids, language);
  const topicNames: Record<string, string> = {};
  ml.groups.forEach((g) => g.topicId && (topicNames[g.topicId] = g.topicName));
  const articles = await topicArticles([...new Set(questions.map((q) => q.topicId).filter((t): t is string => Boolean(t)))]);

  return (
    <Container className="flex max-w-3xl flex-col gap-6 py-8 lg:py-10">
      <header className="flex flex-col gap-1">
        <p className="text-body-sm font-semibold text-fg-secondary">{MEMORY_LOCK.name}</p>
        <h1 className="text-h1 font-bold text-fg">{MEMORY_LOCK.sessionTitle}</h1>
      </header>
      {questions.length === 0 ? (
        <EmptyState icon={<Lock />} title={MEMORY_LOCK.dueToday(0, 0)} description={MEMORY_LOCK.nothingDue} action={<ButtonLink href="/memory-lock">{MEMORY_LOCK.back}</ButtonLink>} />
      ) : (
        <PracticeRunner
          setId={randomUUID()}
          mode="TOPIC"
          title={MEMORY_LOCK.sessionTitle}
          questions={questions}
          topicNames={topicNames}
          articles={articles}
          againHref="/memory-lock"
          nextTopicHref={null}
          chooseHref="/memory-lock"
          memoryLock={{ sessionId: randomUUID(), endHref: "/memory-lock" }}
        />
      )}
    </Container>
  );
}
