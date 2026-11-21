import { LANDING_FACTS } from "./facts";
import type { LandingCopy } from "./types";

/**
 * LANDING-1 Hindi copy — LANDING_V1_SPEC.md §5 with the owner's amendments of 2026-11-21 (the same keys as en.ts;
 * TypeScript enforces the shape). Mixed Hindi-English words are as approved in the spec.
 */
export const LANDING_HI: LandingCopy = {
  lang: "hi",
  meta: {
    title: "Courage Library — अपने कमज़ोर टॉपिक पहचानें। उन्हें सुधारें।",
    // no Hindi-content claim here (owner round 3; metadata is static)
    description: "सरकारी परीक्षाओं के लिए मुफ़्त lessons, practice और mock tests। शुरुआत SSC से, और परीक्षाएँ जल्द आ रही हैं।",
  },
  skip: "मुख्य सामग्री पर जाएँ",
  nav: { exams: "परीक्षाएँ", currentAffairs: "करेंट अफेयर्स", mockTests: "मॉक टेस्ट", label: "मुख्य" },
  langSwitch: { label: "भाषा", en: "EN", hi: "हिंदी" },
  signIn: "साइन इन",
  startFree: "मुफ़्त शुरू करें",
  dashboard: "डैशबोर्ड पर जाएँ",
  menu: { open: "मेन्यू" },
  hero: {
    badge: "हर aspirant के लिए मुफ़्त · हिंदी और English",
    h1Before: "अपने कमज़ोर टॉपिक पहचानें। उन्हें सुधारें। अगले attempt में ",
    h1Strong: "बेहतर स्कोर",
    h1After: " करें।",
    sub: "सरकारी परीक्षाओं के लिए मुफ़्त lessons, practice और mock tests, हिंदी और English में। शुरुआत SSC से, और परीक्षाएँ जल्द आ रही हैं।",
    explore: "परीक्षाएँ देखें",
    tagline: "हर attempt, बेहतर।",
    loop: ["पढ़ें", "Practice", "Mock", "कमज़ोर टॉपिक", "सुधारें", "बेहतर"],
    loopAlt: "सुधार का loop: पढ़ें, Practice, Mock, कमज़ोर टॉपिक, सुधारें, बेहतर — फिर दोबारा पढ़ें।",
  },
  band: {
    h2: "अपनी परीक्षा खोजें",
    text: "आपकी परीक्षा का syllabus, lessons, practice और mocks, एक ही जगह।",
    search: "अपनी परीक्षा खोजें…",
    searchLabel: "परीक्षाएँ खोजें",
    chipsLabel: "लोकप्रिय परीक्षाएँ",
  },
  liveExams: {
    one: "{LIVE_EXAMS} अभी उपलब्ध है। बाकी परीक्षाएँ आगे आ रही हैं, हर official syllabus के हिसाब से धीरे-धीरे।",
    many: "{LIVE_EXAMS} अभी उपलब्ध हैं। बाकी परीक्षाएँ आगे आ रही हैं, हर official syllabus के हिसाब से धीरे-धीरे।",
    none: "परीक्षाएँ धीरे-धीरे जोड़ी जा रही हैं, शुरुआत SSC से।",
    and: "और",
  },
  hindiPending: {
    badge: "हर aspirant के लिए मुफ़्त",
    sub: "सरकारी परीक्षाओं के लिए मुफ़्त lessons, practice और mock tests। शुरुआत SSC से, और परीक्षाएँ जल्द आ रही हैं।",
    faq: { q: "क्या यह हिंदी में उपलब्ध है?", a: "यह वेबसाइट आज से हिंदी में उपलब्ध है; ऊपर दिए हिंदी बटन से बदलें। हिंदी lessons और सवाल जोड़े जा रहे हैं।" },
    promise: { title: "हिंदी जल्द आ रही है", text: "वेबसाइट आज हिंदी में है। हिंदी lessons और सवाल जोड़े जा रहे हैं।" },
  },
  exams: {
    h2: "अपनी परीक्षा चुनें",
    lead: "जिस परीक्षा की तैयारी कर रहे हैं, वहीं से शुरू करें। SSC अभी उपलब्ध है; बाकी श्रेणियाँ जल्द आ रही हैं।",
    allName: "सभी परीक्षाएँ",
    allText: "पूरी सूची देखें →",
    comingSoon: "जल्द आ रहा है",
  },
  pain: {
    h2: "नंबर कम आ रहे हैं और वजह नहीं पता?",
    lead: "ज़्यादातर aspirants मेहनत करते हैं। कमी बस यह जानने की है कि ठीक-ठीक क्या सुधारना है।",
    items: [
      { quote: "“बार-बार वही गलतियाँ हो जाती हैं।”", answer: "हर गलत जवाब revision के लिए सेव होता है, explanation के साथ, और जहाँ उपलब्ध हो वहाँ उस टॉपिक के lesson का link भी।" },
      { quote: "“समझ नहीं आता कौन-सा टॉपिक कमज़ोर है।”", answer: "हर mock आपका स्कोर section के हिसाब से दिखाता है और उन टॉपिक के नाम बताता है जहाँ आपके नंबर बार-बार कटते हैं।" },
      { quote: "“इतनी पढ़ाई के बाद भी नंबर नहीं बढ़ते।”", answer: "हर attempt के बाद एक छोटी सूची मिलती है: आगे क्या पढ़ना है और क्या practice करनी है। बस उतना ही।" },
    ],
  },
  how: {
    h2: "यह कैसे काम करता है",
    lead: "एक आसान loop। हर attempt कुछ सिखाता है, और अगला attempt बेहतर होता है।",
    steps: [
      { title: "पढ़ें", text: "टॉपिक-वार साफ़ lessons" },
      { title: "Practice", text: "टॉपिक के हिसाब से सवाल, हल के साथ" },
      { title: "Mock", text: "असली exam pattern में पूरे टेस्ट" },
      { title: "कमज़ोर टॉपिक", text: "देखें किस section और टॉपिक में नंबर कटे" },
      { title: "सुधारें", text: "वही lesson खोलें और practice करें" },
      { title: "बेहतर", text: "अगले attempt में बेहतर स्कोर" },
    ],
  },
  plans: {
    h2: "मुफ़्त शुरू करें। मुफ़्त ही रहेगा।",
    lead: "शुरुआत के लिए जो कुछ चाहिए, सब मुफ़्त है। Pro वैकल्पिक है, जब आपको ज़्यादा चाहिए।",
    free: {
      title: "Free",
      tag: "सबके लिए",
      sub: "कोई कार्ड नहीं चाहिए। Sign up करें और शुरू करें।",
      list: ["हर उपलब्ध परीक्षा के टॉपिक-वार lessons", "रोज़ के practice सवाल, हल के साथ", "रोज़ करेंट अफेयर्स", "Exam pattern में मुफ़्त mock tests", "Section-wise result, कमज़ोर टॉपिक के साथ"],
    },
    pro: {
      title: "Pro",
      tag: "वैकल्पिक",
      sub: "उन aspirants के लिए जो पूरी mock series चाहते हैं।",
      list: ["पूरी mock test series", "हर attempt का गहरा analysis", "गलतियों की drills और revision"],
      note: "Pro जल्द आ रहा है। Free features हमेशा free रहेंगे।",
    },
  },
  library: {
    eyebrow: "पीछे एक असली लाइब्रेरी",
    h2: "कानपुर की एक असली स्टडी लाइब्रेरी में बना",
    text: `${LANDING_FACTS.founded.hi} से Courage Library aspirants को तैयारी के लिए एक शांत जगह दे रही है। यह platform वही focus online लाता है, खुद से पढ़ने वाले students के लिए।`,
    photos: ["Reading hall", "Desk की नज़दीकी फ़ोटो", "Entrance और बोर्ड"],
    photoNote: "असली फ़ोटो ली जानी है",
    photosLabel: "लाइब्रेरी की फ़ोटो (जल्द)",
  },
  promises: {
    h2: "आपसे हमारे वादे",
    lead: "हम क्या कभी नहीं करेंगे, और क्या हमेशा करेंगे।",
    items: [
      { title: "कोई नकली टॉपर नहीं", text: "हम कभी बनावटी selection numbers या नकली results नहीं दिखाते।" },
      { title: "जाँचे हुए जवाब", text: "हर सवाल पर “Report a problem” बटन है, और आप जो बताते हैं, हम ठीक करते हैं।" },
      { title: "साफ़ refund policy", text: "पैसे देने से पहले, आसान शब्दों में लिखे साफ़ नियम।" },
      { title: "हिंदी और English", text: "जिस भाषा में सोचते हैं, उसी में पढ़ें। कभी भी बदलें।" },
    ],
  },
  faq: {
    h2: "Aspirants के सवाल",
    items: [
      // the answer is built from the live exams at render (liveExams above); this text is never shown
      { q: "कौन-सी परीक्षाएँ शामिल हैं?", a: "{LIVE_EXAMS_ANSWER}" },
      { q: "क्या यह सच में मुफ़्त है?", a: "हाँ। Lessons, रोज़ की practice, करेंट अफेयर्स, रोज़ के मुफ़्त mocks और कमज़ोर टॉपिक के साथ आपका result मुफ़्त हैं। Pro वैकल्पिक है।" },
      { q: "क्या हिंदी में पढ़ाई हो सकती है?", a: "हाँ। ऊपर दिए बटन से कभी भी हिंदी और English के बीच बदलें।" },
      { q: "क्या app चाहिए?", a: "नहीं। यह किसी भी फ़ोन या कंप्यूटर के browser में चलता है।" },
      { q: "Pro लेने के बाद मन बदल जाए तो?", a: "हमारी refund policy आसान शब्दों में बताती है कि पैसे कब और कैसे वापस मिलते हैं।" },
      { q: "Courage Library कौन चलाता है?", a: `Courage Library कानपुर की एक MSME-registered स्टडी लाइब्रेरी है, जो ${LANDING_FACTS.founded.hi} से चल रही है।` },
    ],
  },
  final: { h2: "आपका अगला attempt आज से शुरू", text: "अपनी परीक्षा चुनें, एक मुफ़्त mock दें और देखें कि ठीक क्या सुधारना है।" },
  footer: {
    purpose: "हम हर aspirant को फिर से attempt करने की हिम्मत और हर बार बेहतर करने की स्पष्टता देते हैं।",
    made: "Aspirants के लिए, हिंदी और English में",
    platform: "Platform",
    company: "Company",
    legal: "Legal",
    links: {
      exams: "परीक्षाएँ",
      mockTests: "Mock tests",
      currentAffairs: "करेंट अफेयर्स",
      about: "हमारे बारे में",
      library: "कानपुर लाइब्रेरी",
      contact: "संपर्क",
      help: "मदद",
      terms: "Terms",
      privacy: "Privacy",
      refund: "Refund policy",
      grievance: "Grievance officer",
    },
  },
};
