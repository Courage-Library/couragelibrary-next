export interface SiteConfig {
  name: string;
  tagline: string;
  description: string;
  url: string;
  ogImage: string;
  links: {
    twitter?: string;
    telegram?: string;
    youtube?: string;
    [key: string]: string | undefined;
  };
  routes: {
    home: string;
    exams: string;
    learn: string;
    currentAffairs: string;
    blog: string;
    student: {
      dashboard: string;
      myExams: string;
      mocks: string;
      results: string;
      studyPlan: string;
    };
    admin: {
      dashboard: string;
      content: string;
      questions: string;
      exams: string;
    };
    auth: {
      login: string;
      register: string;
    };
  };
}

/**
 * SEO-HYGIENE-1: the ONE canonical site base for everything search engines read — canonical, OG, hreflang, JSON-LD,
 * sitemap, robots. Deliberately NOT the deployment URL (NEXT_PUBLIC_SITE_URL / getAppEnv().siteUrl, used for auth
 * redirects): a preview or pre-launch deploy must never declare itself canonical.
 */
export const CANONICAL_SITE_URL = "https://couragelibrary.in";
const CANONICAL_HOSTS = ["couragelibrary.in", "www.couragelibrary.in"];

/** True only for the production hosts; every other host (*.vercel.app, previews, localhost) is noindex + Disallow. */
export function isCanonicalHost(host: string | null | undefined): boolean {
  const h = String(host ?? "").trim().toLowerCase().replace(/:\d+$/, "");
  return CANONICAL_HOSTS.includes(h);
}

/** next.config headers(): `missing` host rule (Next anchors it ^…$, strips the port, lowercases) — matches the canonical hosts. */
export const CANONICAL_HOST_PATTERN = String.raw`(www\.)?couragelibrary\.in`;

export const siteConfig: SiteConfig = {
  name: "Courage Library",
  tagline: "Learn Smarter. Prepare Independently.",
  // Decision #47 (UX-2a.1): the site default description; honest, no exam counts.
  description:
    "Courage Library helps you prepare for Indian government exams with free mock tests, answer analysis and a Mistake Vault that turns every wrong answer into revision. Learn Smarter. Prepare Independently.",
  url: CANONICAL_SITE_URL, // SEO-HYGIENE-1: never the deployment URL
  ogImage: "/images/logo.png",
  // Placeholder social links — to be configured with official handles upon production launch
  links: {
    twitter: "",
    telegram: "",
    youtube: "",
  },
  routes: {
    home: "/",
    exams: "/exams",
    learn: "/learn",
    currentAffairs: "/current-affairs",
    blog: "/blog",
    student: {
      dashboard: "/dashboard",
      myExams: "/dashboard/exams",
      mocks: "/dashboard/mocks",
      results: "/dashboard/results",
      studyPlan: "/dashboard/study-plan",
    },
    admin: {
      dashboard: "/admin",
      content: "/admin/lessons/legacy",
      questions: "/admin/questions",
      exams: "/admin/exams",
    },
    auth: {
      login: "/auth/login",
      register: "/auth/signup",
    },
  },
};
