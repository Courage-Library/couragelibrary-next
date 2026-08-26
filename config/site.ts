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

export const siteConfig: SiteConfig = {
  name: "Courage Library",
  tagline: "The One-Stop Government Exam Preparation Platform",
  description:
    "Master SSC, Defence, Railway, Banking, Police and 50+ government exams with structured learning, adaptive mock tests, and actionable preparation intelligence.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://couragelibrary.in",
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
      content: "/admin/content",
      questions: "/admin/questions",
      exams: "/admin/exams",
    },
    auth: {
      login: "/login",
      register: "/register",
    },
  },
};
