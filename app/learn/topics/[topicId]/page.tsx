import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { Container } from "@/components/ui/layout";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadTopicLearning } from "@/lib/learn/topic";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Topic", robots: { index: false, follow: true } };

interface Props {
  params: Promise<{ topicId: string }>;
}

/**
 * F6 canonical topic entry. With a published article: straight to it (the article carries "Practice this topic").
 * Without one: say so plainly and offer the ONE next step — practice the topic (when it can be practiced) or browse.
 */
export default async function TopicLearnPage({ params }: Props) {
  const { topicId } = await params;
  const supabase = await createServerSupabaseClient();
  const t = await loadTopicLearning(supabase, topicId);
  if (!t) notFound();
  const primary = t.documents[0];
  if (primary) redirect(primary.href);

  return (
    <Container className="flex max-w-3xl flex-col gap-6 py-8 lg:py-10" data-topic-learn="">
      <header className="flex flex-col gap-1">
        {t.topic.sectionName && <p className="text-body-sm font-semibold text-fg-secondary">{t.topic.sectionName}</p>}
        <h1 className="text-h1 font-bold text-fg">{t.topic.name}</h1>
      </header>
      <EmptyState
        icon={<BookOpen />}
        title="No study notes for this topic yet"
        description={t.practiceHref ? "You can still practice this topic: each answer comes with its explanation." : "Study notes for this topic are being prepared."}
        action={t.practiceHref ? <ButtonLink href={t.practiceHref}>Practice this topic</ButtonLink> : <ButtonLink href="/articles" variant="secondary">Browse study notes</ButtonLink>}
        headingLevel={2}
      />
    </Container>
  );
}
