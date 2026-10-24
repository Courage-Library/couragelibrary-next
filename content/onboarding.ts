/**
 * F0 onboarding (decision #76) — every user-facing string, in Hindi AND English (design rule R9: bilingual plain
 * labels; full UI translation is out of scope). Respectful, no urgency, no shame (R11); no numbers beyond the
 * user's own choices. scripts/test_onboarding_f0.cjs checks that every label has a Devanagari Hindi line.
 */
export type Bilingual = { hi: string; en: string };

export const ONBOARDING_COPY = {
  pageTitle: { hi: "अपनी तैयारी सेट करें", en: "Set up your preparation" },
  intro: { hi: "चार छोटे सवाल। कोई भी सवाल छोड़ सकते हैं और बाद में बदल सकते हैं।", en: "Four short questions. You can skip any of them and change them later." },
  progress: (n: number, total: number): Bilingual => ({ hi: `चरण ${n} / ${total}`, en: `Step ${n} of ${total}` }),
  next: { hi: "आगे", en: "Next" },
  back: { hi: "पीछे", en: "Back" },
  skipStep: { hi: "यह सवाल छोड़ें", en: "Skip this question" },
  skipAll: { hi: "अभी के लिए छोड़ें", en: "Skip for now" },
  finish: { hi: "मेरा प्लान दिखाएँ", en: "Show my plan" },
  saving: { hi: "सेव हो रहा है…", en: "Saving…" },
  error: { hi: "सेव नहीं हो पाया। कृपया फिर से कोशिश करें।", en: "We couldn't save that. Please try again." },
  steps: {
    language: {
      title: { hi: "आप किस भाषा में पढ़ना पसंद करते हैं?", en: "Which language do you prefer to study in?" },
      note: { hi: "अभी पूरी साइट अंग्रेज़ी में है; हम आपकी पसंद याद रखेंगे।", en: "The site is in English for now; we'll remember your choice." },
      options: {
        hi: { hi: "हिंदी", en: "Hindi" },
        en: { hi: "अंग्रेज़ी", en: "English" },
        hinglish: { hi: "हिंग्लिश", en: "Hinglish" },
      },
    },
    exams: {
      title: { hi: "आप किस परीक्षा की तैयारी कर रहे हैं?", en: "Which exam are you preparing for?" },
      note: { hi: "ज़्यादा से ज़्यादा 3 परीक्षाएँ चुनें।", en: "Choose up to 3 exams." },
      max: { hi: "आप 3 परीक्षाएँ चुन चुके हैं।", en: "You have chosen 3 exams." },
      none: { hi: "अभी कोई परीक्षा उपलब्ध नहीं है। यह सवाल छोड़ दें।", en: "No exam is available yet. Please skip this question." },
      existing: { hi: "आपके मौजूदा लक्ष्य पहले से चुने हुए हैं। किसी को हटाना हो तो उसका निशान हटाएँ।", en: "Your current goals are already ticked. Untick one only if you want to remove it." },
    },
    timing: {
      title: { hi: "आपकी परीक्षा कब है?", en: "When is your exam?" },
      known: { hi: "परीक्षा की तारीख पता है", en: "I know the exam date" },
      unknown: { hi: "अभी पक्का नहीं", en: "Not sure yet" },
      dateLabel: { hi: "परीक्षा की तारीख", en: "Exam date" },
      datePast: { hi: "तारीख आज या उसके बाद की होनी चाहिए।", en: "The date must be today or later." },
      attemptTitle: { hi: "यह आपका कौन-सा प्रयास है?", en: "Which attempt is this?" },
      attempts: {
        first: { hi: "पहला", en: "First" },
        second: { hi: "दूसरा", en: "Second" },
        third_plus: { hi: "तीसरा या उससे ज़्यादा", en: "Third or more" },
      },
    },
    time: {
      title: { hi: "आप रोज़ कितना समय दे सकते हैं?", en: "How much time can you give each day?" },
      minutes: (m: number): Bilingual => (m >= 90 ? { hi: "90+ मिनट", en: "90+ minutes" } : { hi: `${m} मिनट`, en: `${m} minutes` }),
    },
  },
  plan: {
    title: { hi: "आपका प्लान", en: "Your plan" },
    daily: (n: number): Bilingual => ({ hi: `रोज़: 10 सवाल + ${n} सवालों का एक प्रैक्टिस सेट`, en: `Daily: 10 questions + 1 practice set of ${n} questions` }),
    from: (section: string, exam: string): Bilingual => ({ hi: `${exam} के पहले सेक्शन से: ${section}`, en: `From ${exam}'s first syllabus section: ${section}` }),
    fromExam: (exam: string): Bilingual => ({ hi: `${exam} से`, en: `From ${exam}` }),
    noExam: { hi: "कोई परीक्षा नहीं चुनी। आप सभी परीक्षाएँ देख सकते हैं।", en: "No exam chosen. You can browse all exams." },
    start: { hi: "आज की प्रैक्टिस शुरू करें", en: "Start today's practice" },
    openExam: (exam: string): Bilingual => ({ hi: `${exam} खोलें`, en: `Open ${exam}` }),
    browseExams: { hi: "परीक्षाएँ देखें", en: "Browse exams" },
    practiceNotReady: {
      hi: "इस परीक्षा के प्रैक्टिस सेट अभी तैयार नहीं हैं। तब तक परीक्षा पेज पर मुफ़्त मॉक टेस्ट और सिलेबस देखें।",
      en: "Practice sets for this exam are not ready yet. Until then, use the exam page for free mock tests and the syllabus.",
    },
    later: { hi: "डैशबोर्ड पर जाएँ", en: "Go to dashboard" },
    removed: (names: string): Bilingual => ({ hi: `आपके लक्ष्यों से हटाया गया: ${names}`, en: `Removed from your goals: ${names}` }),
    edit: { hi: "जवाब बदलें", en: "Change answers" },
  },
  dashboardCard: {
    title: { hi: "अपनी तैयारी सेट करें", en: "Set up your preparation" },
    text: { hi: "चार छोटे सवाल, आपके लिए एक आसान रोज़ का प्लान।", en: "Four short questions for a simple daily plan." },
    cta: { hi: "सेटअप करें", en: "Set up" },
    dismiss: { hi: "बंद करें", en: "Dismiss" },
  },
  menuLink: { hi: "अध्ययन पसंद", en: "Study preferences" },
} as const;

/** One-line "English · Hindi" rendering used for compact labels (e.g. menus). */
export const both = (b: Bilingual): string => `${b.en} · ${b.hi}`;
