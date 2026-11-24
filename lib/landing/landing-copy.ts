import type { LandingCopy } from "../../content/landing-page/types";

/**
 * LANDING-1 (owner round 3, 2026-11-21): the copy a visitor sees follows PUBLISHED data — pure, no imports beyond the
 * type, so the offline gate drives this exact code.
 *   - FAQ 1 names the LIVE exams (their display names, joined naturally); none live → the "being added" line
 *   - Hindi claims (hero badge, hero sub, FAQ 3, promise 4) only when published Hindi content > 0 (HOME-1 H-20 rule);
 *     until then the owner's "Hindi on the way" lines. The /hi page itself always exists (a translation, not a claim).
 *   - sign-up closed (UXFIX1 X-01) → every "Start free" becomes "Explore exams" → /exams
 *   - LANDING-1.1: the footer "made" line is a Hindi claim too → behind the same published-Hindi condition; a LIVE
 *     category card names its live exams ("CGL live · more coming"), never a hard-coded exam list
 */
export interface LandingFacts {
  /** display names of the live (active) exams, in order */
  liveExamNames: string[];
  /** published Hindi content exists (questions / lessons with a published Hindi version) */
  hindiLive: boolean;
  /** public sign-up is open ("closed" only when the setting says so) */
  signupOpen: boolean;
  /** LIVE-GREEN-1 3b (owner): ≥ 1 PUBLISHED current-affairs article (a failed read = false: the claim fails closed) */
  currentAffairsLive?: boolean;
}

export interface StartAction {
  label: string;
  href: string;
}

export interface ResolvedLanding {
  t: LandingCopy;
  start: StartAction;
}

export const LIVE_EXAMS_TOKEN = "{LIVE_EXAMS}";

/** "A" · "A and B" · "A, B and C" (EN) / "A और B" (HI) */
export function joinNames(names: readonly string[], and: string): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ${and} ${names[names.length - 1]}`;
}

export function liveExamsAnswer(t: LandingCopy, names: readonly string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return t.liveExams.none;
  return (clean.length === 1 ? t.liveExams.one : t.liveExams.many).replace(LIVE_EXAMS_TOKEN, joinNames(clean, t.liveExams.and));
}

/** a LIVE category's subtitle: "<live short names> live" + " · more coming" when it also has exams not live yet */
export function liveCategorySubtitle(t: LandingCopy, liveShortNames: readonly string[], moreComing: boolean): string {
  const names = liveShortNames.map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) return "";
  return `${names.join(", ")} ${t.exams.liveSuffix}${moreComing ? ` · ${t.exams.moreComing}` : ""}`;
}

/** "SSC CGL" in category "SSC" → "CGL" (the card already names the category); otherwise the full title */
export function examShortName(title: string, categoryName: string): string {
  const t = title.trim();
  const c = categoryName.trim();
  return c && t.toLowerCase().startsWith(`${c.toLowerCase()} `) && t.length > c.length + 1 ? t.slice(c.length + 1).trim() : t;
}

export function resolveLandingCopy(base: LandingCopy, f: LandingFacts, examsHref = "/exams", signUpHref = "/auth/signup"): ResolvedLanding {
  // LIVE-GREEN-1 3b (owner): no current-affairs claim on "/" while none is published (unknown = none)
  const caLive = f.currentAffairsLive === true;
  const faq = base.faq.items.map((item, i) => {
    if (i === 0) return { q: item.q, a: liveExamsAnswer(base, f.liveExamNames) };
    if (i === 2 && !f.hindiLive) return { ...base.hindiPending.faq };
    if (!caLive && item.q === base.currentAffairsPending.faq.q) return { ...base.currentAffairsPending.faq };
    return item;
  });
  const promises = base.promises.items.map((p, i) => (i === 3 && !f.hindiLive ? { ...base.hindiPending.promise } : p));
  const freeList = caLive ? base.plans.free.list : base.plans.free.list.filter((l) => l !== base.currentAffairsPending.planItem);
  const t: LandingCopy = {
    ...base,
    plans: { ...base.plans, free: { ...base.plans.free, list: freeList } },
    hero: { ...base.hero, badge: f.hindiLive ? base.hero.badge : base.hindiPending.badge, sub: f.hindiLive ? base.hero.sub : base.hindiPending.sub },
    faq: { ...base.faq, items: faq },
    promises: { ...base.promises, items: promises },
  };
  const start: StartAction = f.signupOpen ? { label: base.startFree, href: signUpHref } : { label: base.hero.explore, href: examsHref };
  return { t, start };
}
