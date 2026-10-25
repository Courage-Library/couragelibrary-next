/**
 * F11 (#79) support copy: help centre + grievance redressal. Plain English UI (R9); every statement describes what the
 * product does TODAY (R12) — nothing promised that is not built.
 *
 * OWNER: fill GRIEVANCE_OFFICER with the real, appointed person's details. Until ALL four fields are set, the page shows
 * "details will be published here" and the support email as the interim channel — it never shows an invented person.
 * Set GRIEVANCE_TIMELINES.confirmed = true only after you have approved the response times shown there.
 */
import { SHELL_COPY } from "@/content/landing";

export const SUPPORT_EMAIL = SHELL_COPY.supportEmail;

export type HelpTopic = { id: string; title: string; items: Array<{ q: string; a: string; link?: { href: string; label: string } }> };

export const HELP_PAGE = {
  meta: { title: "Help", description: "Answers about mock tests, practice, your account and getting support at Courage Library." },
  title: "Help",
  lead: "Short answers to common questions. If yours is not here, email us.",
  topics: [
    {
      id: "mock-tests",
      title: "Mock tests",
      items: [
        { q: "Are my answers saved during a test?", a: "Yes. Each answer is saved to our server as you go. The status at the top says Saved, Saving… or Not saved — retrying; an answer that could not be saved yet stays on your device and is sent again." },
        { q: "What happens if I close the tab or lose the connection?", a: "Open the same test again before the time runs out. On the same device it continues from the question you were on, with your answers." },
        { q: "Who keeps the time?", a: "Our server. The timer on your screen counts down to the server's end time; when it reaches zero the test is submitted for you." },
        { q: "Where do I see my result?", a: "Right after you submit: your score, accuracy, each section, what to do next and a review of every question with its explanation.", link: { href: "/mock-tests", label: "Go to mock tests" } },
      ],
    },
    {
      id: "practice",
      title: "Practice and mistakes",
      items: [
        { q: "What happens to questions I get wrong?", a: "Wrong answers from mock tests and practice are saved to your mistakes, so you can drill them later.", link: { href: "/mistakes", label: "Open my mistakes" } },
        { q: "How do I report a mistake in a question?", a: "Use “Report this question” under the question. Choose a reason and add a short note if you like; our team reviews every report." },
      ],
    },
    {
      id: "account",
      title: "Account and sign-in",
      items: [
        { q: "I forgot my password.", a: "Use “Forgot password” on the sign-in page; we email you a link to set a new one.", link: { href: "/auth/forgot-password", label: "Reset my password" } },
        { q: "How do I change my exam or daily study time?", a: "Open the account menu and choose Study preferences, when it is shown for your account." },
      ],
    },
    {
      id: "plans",
      title: "Plans and payments",
      items: [{ q: "Do I need to pay?", a: "Paid plans are not available yet. Everything you can open today is free.", link: { href: "/pricing", label: "See plans" } }],
    },
    {
      id: "privacy",
      title: "Your data",
      items: [{ q: "How is my data used?", a: "Our privacy policy explains what we collect and why. It is a draft under legal review.", link: { href: "/privacy", label: "Read the privacy policy" } }],
    },
  ] satisfies HelpTopic[],
  contactTitle: "Still need help?",
  contactLead: "Email us from the address you use for Courage Library. We reply from the same address.",
  grievanceLink: "Complaints and grievance redressal",
} as const;

/** OWNER: the appointed Grievance Officer. Leave null until the real details are approved. */
export const GRIEVANCE_OFFICER: { name: string | null; designation: string | null; email: string | null; postalAddress: string | null } = {
  name: null,
  designation: null,
  email: null,
  postalAddress: null,
};

/** OWNER: shown only when confirmed. */
export const GRIEVANCE_TIMELINES = {
  confirmed: false,
  acknowledge: "We acknowledge a complaint within 24 hours.",
  resolve: "We aim to resolve it within 15 days.",
} as const;

export const GRIEVANCE_PAGE = {
  meta: { title: "Grievance redressal", description: "How to raise a complaint with Courage Library and who handles it." },
  title: "Grievance redressal",
  lead: "If something went wrong — with your account, a test, a question or your data — tell us and we will look into it.",
  officerTitle: "Grievance Officer",
  officerPending: "The Grievance Officer's details will be published on this page.",
  interim: (email: string) => `Until then, email ${email} with “Grievance” in the subject line.`,
  howTitle: "How to raise a complaint",
  how: [
    "Write from the email address you use for Courage Library.",
    "Say what happened, when it happened and which page, test or question it is about.",
    "Add a screenshot if it helps.",
  ],
  timelinesTitle: "Response times",
} as const;

export function grievanceOfficerReady(o = GRIEVANCE_OFFICER): boolean {
  return Boolean(o.name && o.designation && o.email && o.postalAddress);
}
