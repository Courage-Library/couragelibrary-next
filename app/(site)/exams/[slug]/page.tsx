import { isCourseLive } from "@/services/learning/course.service";
import { cache, Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ExamKnowledgeCandidateService } from "@/services/exam-knowledge/exam-knowledge-candidate.service";
import { ExamModuleRegistry } from "@/services/exam-knowledge/exam-module-registry";
import { ExamSyllabusSection } from "@/components/exams/exam-syllabus-section";
import { ExamCtaView, ExamCycle, ExamGlance, ExamGuides, ExamHomeHeader, ExamMocks, ExamSyllabusHome } from "@/components/exams/exam-home";
import { constructMetadata } from "@/lib/seo/metadata";
import { ComingSoonHub } from "@/components/public/coming-soon-hub";
import { ExamBrandLogo } from "@/components/exams/exam-brand-logo";
import { CategoryPage } from "@/components/exams/category-page";
import { loadPublicCategory } from "@/lib/exams/category-data";
import { COMING_SOON_EXAMS, COMING_SOON_HUB } from "@/content/public-pages";
import { getSignupAvailability } from "@/lib/auth/signup-availability";
import { continueTarget, cycleInfo, glanceRows, guideGroups, preferModules, resolveExamCta, type MockListItem } from "@/lib/exams/exam-page";
import { examMocks, examPageUser, userContentLanguage } from "@/lib/exams/exam-page-server";
import { categoryIntro } from "@/lib/exams/categories";

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

/**
 * UX-IMP-1 (IMPECCABLE-1 B-3, root cause of the slow hub): the candidate view was read TWICE per request (metadata and
 * page) — every exam / cycle / pattern / source / claim / guide read and the syllabus RPC ran two times, all before the
 * first byte. One read per request now (React cache), shared by generateMetadata and the page.
 */
const candidateView = cache((slug: string, language: "en" | "hi" = "en") =>
  ExamKnowledgeCandidateService.getExamKnowledgeCandidateView(language === "hi" ? { examSlug: slug, language: "hi" } : { examSlug: slug }),
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  // HOME-1: /exams/<category> (category and exam slugs share one namespace, enforced in the DB — 128)
  const cat = await loadPublicCategory(slug);
  if (cat) {
    return constructMetadata({
      title: `${cat.category.name} exams`,
      // UX-IMP-1: generated from the listed exams only (categoryIntro), never the admin free text
      description: (!cat.examsFailed && categoryIntro(cat.category.name, cat.exams)) || `${cat.category.name} exams on Courage Library: lessons, practice and mock tests.`,
      canonicalUrl: `/exams/${slug}`,
      ogImage: `/exams/${slug}/opengraph-image`, // HOME-1: the category's own share card
      // noindex only when the read worked and the category really has no exam (an outage never de-indexes it)
      noIndex: !cat.examsFailed && cat.category.activeExams === 0,
    });
  }
  const result = await candidateView(slug);

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
    ogImage: `/exams/${slug}/opengraph-image`, // HOME-1: the exam's own share card
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
  // UX-IMP-1: the category check and the exam read run in parallel (both are needed before the first byte)
  const [cat, result] = await Promise.all([loadPublicCategory(slug), candidateView(slug)]);
  if (cat) return <CategoryPage category={cat.category} exams={cat.exams} examsFailed={cat.examsFailed} />;

  const soon = comingSoonFor(result.status, slug);
  if (soon) return <ComingSoonHub title={soon.title} body={soon.body} />;
  if (result.status !== "FOUND" || !result.data) {
    notFound();
  }

  const data = result.data;
  const { exam, activeCycle, structuredFacts, syllabus, officialSources } = data;

  // #82: guides follow the student's content language where a Hindi version is published; the UI stays English
  // UX-IMP-1: language, mocks and the course check in ONE parallel step (they were a chain of round trips)
  const totals = syllabus.state === "AVAILABLE" ? syllabus.totals : null;
  const [language, mocks, courseLive] = await Promise.all([
    userContentLanguage(),
    examMocks(exam.id),
    totals && totals.servable_documents > 0 ? isCourseLive(exam.id) : Promise.resolve(false),
  ]);
  let modules = data.publishedModules;
  if (language === "hi") {
    const hi = await candidateView(slug, "hi");
    if (hi.status === "FOUND" && hi.data) modules = preferModules(hi.data.publishedModules, modules);
  }

  const body = exam.conductingOrg.id ? exam.conductingOrg.name : null;
  const signedOutCta = resolveExamCta({ signedIn: false, signupOpen: false }, exam.slug);

  return (
    <div data-exam-home="">
      <ExamHomeHeader title={exam.title} body={body} logo={<ExamBrandLogo slug={exam.slug} />}>
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
      <ExamSyllabusHome id="syllabus" totals={totals} courseHref={courseLive ? `/exams/${exam.slug}/course` : null}>
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
