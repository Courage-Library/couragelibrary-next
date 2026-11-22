/**
 * NAV-1 (owner-approved spec, 23 Nov 2026 — docs/design/NAV_V1_SPEC.md §6): every navigation label in English and Hindi.
 * Hindi labels are used only where a Hindi page exists (the landing "/hi", Hindi lessons "/hi/learn/…"); student pages
 * are English today. One typed dictionary per language — the two must have exactly the same keys (gated, NAV-1).
 */
export type NavLang = "en" | "hi";

export interface NavLabels {
  lang: NavLang;
  exams: string;
  currentAffairs: string;
  mockTests: string;
  learn: string;
  signIn: string;
  startFree: string;
  goToDashboard: string;
  exploreExams: string;
  chooseExam: string;
  allExams: string;
  comingSoon: string;
  home: string;
  practice: string;
  mocks: string;
  results: string;
  mistakeVault: string;
  todaysMock: string;
  todaysMockAria: string;
  myResults: string;
  profile: string;
  language: string;
  languageNote: string;
  help: string;
  signOut: string;
  collapse: string;
  expand: string;
  menu: string;
  closeMenu: string;
  mainNav: string;
  examsMenu: string;
  languageSwitch: string;
  liveSuffix: string;
  moreComing: string;
  ca: string;
  account: string;
  studentNav: string;
  billing: string;
  adminStudio: string;
}

export const NAV_EN: NavLabels = {
  lang: "en",
  exams: "Exams",
  currentAffairs: "Current Affairs",
  mockTests: "Mock Tests",
  learn: "Learn",
  signIn: "Sign in",
  startFree: "Start free",
  goToDashboard: "Go to dashboard",
  exploreExams: "Explore exams",
  chooseExam: "Choose your exam",
  allExams: "All exams →",
  comingSoon: "Coming soon",
  home: "Home",
  practice: "Practice",
  mocks: "Mocks",
  results: "Results",
  mistakeVault: "Mistake Vault",
  todaysMock: "Today's mock",
  todaysMockAria: "Start today's free mock",
  myResults: "My results",
  profile: "Profile",
  language: "Language",
  languageNote: "Hindi where available",
  help: "Help",
  signOut: "Sign out",
  collapse: "Collapse",
  expand: "Expand",
  menu: "Menu",
  closeMenu: "Close menu",
  mainNav: "Main",
  examsMenu: "Exams menu",
  languageSwitch: "Language",
  liveSuffix: "live",
  moreComing: "more coming",
  ca: "CA",
  account: "Account",
  studentNav: "Student",
  billing: "Billing",
  adminStudio: "Admin studio",
};

export const NAV_HI: NavLabels = {
  lang: "hi",
  exams: "परीक्षाएँ",
  currentAffairs: "करेंट अफेयर्स",
  mockTests: "मॉक टेस्ट",
  learn: "पढ़ाई",
  signIn: "साइन इन",
  startFree: "मुफ़्त शुरू करें",
  goToDashboard: "डैशबोर्ड पर जाएँ",
  exploreExams: "परीक्षाएँ देखें",
  chooseExam: "अपनी परीक्षा चुनें",
  allExams: "सभी परीक्षाएँ →",
  comingSoon: "जल्द आ रहा है",
  home: "होम",
  practice: "प्रैक्टिस",
  mocks: "मॉक",
  results: "परिणाम",
  mistakeVault: "मिस्टेक वॉल्ट",
  todaysMock: "आज का मॉक",
  todaysMockAria: "आज का मुफ़्त मॉक शुरू करें",
  myResults: "मेरे परिणाम",
  profile: "प्रोफ़ाइल",
  language: "भाषा",
  languageNote: "जहाँ उपलब्ध हो, हिंदी",
  help: "मदद",
  signOut: "साइन आउट",
  collapse: "छोटा करें",
  expand: "बड़ा करें",
  menu: "मेनू",
  closeMenu: "मेनू बंद करें",
  mainNav: "मुख्य",
  examsMenu: "परीक्षाओं का मेनू",
  languageSwitch: "भाषा",
  liveSuffix: "उपलब्ध",
  moreComing: "और जल्द",
  ca: "करेंट",
  account: "खाता",
  studentNav: "छात्र",
  billing: "बिलिंग",
  adminStudio: "एडमिन स्टूडियो",
};

export const navLabels = (lang: NavLang): NavLabels => (lang === "hi" ? NAV_HI : NAV_EN);
