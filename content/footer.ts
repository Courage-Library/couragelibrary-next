/**
 * FOOTER-1 copy (owner spec docs/design/FOOTER_V1_SPEC.md §6, 23 Nov 2026). EN + HI with the same keys (gated). The
 * tagline stays English in both. Hindi is used ONLY on /hi (owner decision 4); /hi/learn/* keeps the English footer.
 */
export type FooterLang = "en" | "hi";

export interface FooterCopy {
  lang: FooterLang;
  bandTitle: string;
  bandText: string;
  startFree: string;
  exploreExams: string;
  tagline: string;
  library: string;
  exams: string;
  prepare: string;
  company: string;
  helpLegal: string;
  allExams: string;
  mockTests: string;
  currentAffairs: string;
  about: string;
  contact: string;
  help: string;
  privacy: string;
  terms: string;
  refund: string;
  shipping: string;
  soon: string;
  msme: string;
  razorpay: string;
  notAffiliated: string;
  footerNav: string;
  socialNav: string;
  socialOn: (network: string) => string;
  opensNewTab: string;
  /** student slim line */
  refunds: string;
  studentNav: string;
}

export const FOOTER_EN: FooterCopy = {
  lang: "en",
  bandTitle: "Start preparing today",
  // LIVE-GREEN-1 3b / FOOTER-BAND-CLAIM (owner): always-true copy — no daily-mock / current-affairs claim unless backed
  bandText: "Timed mock tests, topic practice and a Mistake Vault.",
  startFree: "Start free",
  exploreExams: "Explore exams",
  tagline: "Learn Smarter. Prepare Independently.",
  library: "Also a study library in Kanpur",
  exams: "Exams",
  prepare: "Prepare",
  company: "Company",
  helpLegal: "Help & legal",
  allExams: "All exams",
  mockTests: "Mock Tests",
  currentAffairs: "Current Affairs",
  about: "About us",
  contact: "Contact",
  help: "Help centre",
  privacy: "Privacy Policy",
  terms: "Terms of Use",
  refund: "Refund Policy",
  shipping: "Shipping Policy",
  soon: "soon",
  msme: "Registered MSME (Udyam)",
  razorpay: "Secure payments by Razorpay",
  notAffiliated: "Courage Library is an independent platform and is not affiliated with any exam conducting body.",
  footerNav: "Footer",
  socialNav: "Courage Library on social media",
  socialOn: (n) => `Courage Library on ${n}`,
  opensNewTab: "(opens in a new tab)",
  refunds: "Refunds",
  studentNav: "Help and legal",
};

export const FOOTER_HI: FooterCopy = {
  lang: "hi",
  bandTitle: "आज से तैयारी शुरू करें",
  bandText: "समयबद्ध mock tests, टॉपिक practice और Mistake Vault।",
  startFree: "मुफ़्त शुरू करें",
  exploreExams: "परीक्षाएँ देखें",
  tagline: "Learn Smarter. Prepare Independently.",
  library: "कानपुर में स्टडी लाइब्रेरी भी",
  exams: "परीक्षाएँ",
  prepare: "तैयारी",
  company: "कंपनी",
  helpLegal: "मदद और नियम",
  allExams: "सभी परीक्षाएँ",
  mockTests: "मॉक टेस्ट",
  currentAffairs: "करेंट अफेयर्स",
  about: "हमारे बारे में",
  contact: "संपर्क",
  help: "सहायता केंद्र",
  privacy: "प्राइवेसी पॉलिसी",
  terms: "उपयोग की शर्तें",
  refund: "रिफ़ंड पॉलिसी",
  shipping: "शिपिंग पॉलिसी",
  soon: "जल्द",
  msme: "पंजीकृत MSME (उद्यम)",
  razorpay: "Razorpay द्वारा सुरक्षित भुगतान",
  notAffiliated: "Courage Library एक स्वतंत्र प्लेटफ़ॉर्म है और किसी भी परीक्षा आयोजित करने वाली संस्था से संबद्ध नहीं है।",
  footerNav: "फ़ुटर",
  socialNav: "सोशल मीडिया पर Courage Library",
  socialOn: (n) => `${n} पर Courage Library`,
  opensNewTab: "(नए टैब में खुलता है)",
  refunds: "रिफ़ंड",
  studentNav: "मदद और नियम",
};

export const footerCopy = (lang: FooterLang): FooterCopy => (lang === "hi" ? FOOTER_HI : FOOTER_EN);
