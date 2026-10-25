import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ExamKnowledgeCandidateService } from "@/services/exam-knowledge/exam-knowledge-candidate.service";
import { ExamModuleRegistry } from "@/services/exam-knowledge/exam-module-registry";
import { ExamSyllabusSection } from "@/components/exams/exam-syllabus-section";
import { ExamCtaView, ExamCycle, ExamGlance, ExamGuides, ExamHomeHeader, ExamMocks, ExamSyllabusHome } from "@/components/exams/exam-home";
import { constructMetadata } from "@/lib/seo/metadata";
import { ComingSoonHub } from "@/components/public/coming-soon-hub";
import { COMING_SOON_EXAMS, COMING_SOON_HUB } from "@/content/public-pages";
import { getSignupAvailability } from "@/lib/auth/signup-availability";
import { continueTarget, cycleInfo, glanceRows, guideGroups, preferModules, resolveExamCta, type MockListItem } from "@/lib/exams/exam-page";
import { examMocks, examPageUser, userContentLanguage } from "@/lib/exams/exam-page-server";

/**
 * F1 (#75): the exam home page — the one page a student uses to understand an exam and start. Order (mobile first):
 * header + ONE primary action by state → at a glance (DB facts only) → exam cycle (only if recorded) → mock tests with
 * the student's status → syllabus → exam guides + sources. User-dependent parts stream in their own Suspense boundary
 * whose fallback is the signed-out view, so no read (session, sign-up setting) ever blocks the page.
 * UX-2b: an exam listed as coming soon gets an honest noindex hub instead of a 404 while it is not active (decision
 * #32). Any non-FOUND status counts: for anonymous visitors RLS hides inactive exam rows, so the service reports
 * NOT_FOUND rather than INACTIVE. An active exam returns FOUND and gets its real hub; unlisted slugs still 404.
 */
const comingSoonFor = (status: string, slug: string) => (status !== "FOUND" ? COMING_SOON_EXAMS.find((e) => e.slug === slug) ?? null : null);

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({ examSlug: slug });

  const soon = comingSoonFor(result.status, slug);
  if (soon) {
    return constructMetadata({ title: `${soon.title} (coming soon)`, description: COMING_SOON_HUB.metaDescription(soon.title), canonicalUrl: `/exams/${slug}`, noIndex: true });
  }
  if (result.status !== "FOUND" || !result.data) {
    return constructMetadata({ title: "Exam Not Found", noIndex: true });
  }
  const exam = result.data.exam;
  return constructMetadata({
    title: `${exam.title}: exam pattern, mock tests, syllabus and guides`,
    description: exam.description || `Exam pattern, free mock tests, the syllabus and exam guides for ${exam.title}.`,
    canonicalUrl: `/exams/${slug}`,
  });
}

/** The header action for the signed-in / signed-out state (streams; fallback = signed out, sign-up closed). */
async function HeaderCta({ examId, examSlug }: { examId: string; examSlug: string }) {
  const user = await examPageUser(examId);
  if (!user.signedIn) {
    const signupOpen = (await getSignupAvailability()) !== "closed";
    return <ExamCtaView examId={examId} cta={resolveExamCta({ signedIn: false, signupOpen }, examSlug)} />;
  }
  if (!user.following) return <ExamCtaView examId={examId} cta={resolveExamCta({ signedIn: true, following: false }, examSlug)} />;
  const next = continueTarget(await examMocks(examId), user.statuses, user.drillsDue);
  return <ExamCtaView examId={examId} cta={resolveExamCta({ signedIn: true, following: true, next }, examSlug)} />;
}

async function MocksWithStatus({ examId, mocks }: { examId: string; mocks: MockListItem[] }) {
  const user = await examPageUser(examId);
  return <ExamMocks mocks={mocks} statuses={user.signedIn ? user.statuses : null} />;
}

export default async function ExamHomePage({ params }: Props) {
  const { slug } = await params;
  const result = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({ examSlug: slug });

  const soon = comingSoonFor(result.status, slug);
  if (soon) return <ComingSoonHub title={soon.title} />;
  if (result.status !== "FOUND" || !result.data) {
    notFound();
  }

  const data = result.data;
  const { exam, activeCycle, structuredFacts, syllabus, officialSources } = data;

  // #82: guides follow the student's content language where a Hindi version is published; the UI stays English
  const [language, mocks] = await Promise.all([userContentLanguage(), examMocks(exam.id)]);
  let modules = data.publishedModules;
  if (language === "hi") {
    const hi = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({ examSlug: slug, language: "hi" });
    if (hi.status === "FOUND" && hi.data) modules = preferModules(hi.data.publishedModules, modules);
  }

  const body = exam.conductingOrg.id ? exam.conductingOrg.name : null;
  const totals = syllabus.state === "AVAILABLE" ? syllabus.totals : null;
  const signedOutCta = resolveExamCta({ signedIn: false, signupOpen: false }, exam.slug);

  return (
    <div data-exam-home="">
      <ExamHomeHeader title={exam.title} body={body}>
        <Suspense fallback={<ExamCtaView examId={exam.id} cta={signedOutCta} />}>
          <HeaderCta examId={exam.id} examSlug={exam.slug} />
        </Suspense>
      </ExamHomeHeader>

      <ExamGlance examTitle={exam.title} table={glanceRows(structuredFacts.patterns)} />

      <ExamCycle info={cycleInfo(activeCycle)} />

      <Suspense fallback={<ExamMocks mocks={mocks} statuses={null} />}>
        <MocksWithStatus examId={exam.id} mocks={mocks} />
      </Suspense>

      {/* Syllabus — canonical read model (GAP2-4b); "coming soon" until a version is published */}
      {/* section#syllabus: the signed-in smoke + the read-model check (scripts/smoke/_syllabus-expect.cjs) read it */}
      <ExamSyllabusHome id="syllabus" totals={totals}>
        <ExamSyllabusSection syllabus={syllabus} examTitle={exam.title} />
      </ExamSyllabusHome>

      <ExamGuides
        groups={guideGroups(modules, exam.slug, (k) => ExamModuleRegistry.getModuleDefinition(k).displayName)}
        sources={officialSources
          .filter((s) => typeof s.sourceUrl === "string" && /^https:\/\//.test(s.sourceUrl))
          .map((s) => ({ id: s.id, title: s.title, issuingAuthority: s.issuingAuthority || null, sourceUrl: s.sourceUrl }))}
      />
    </div>
  );
}
