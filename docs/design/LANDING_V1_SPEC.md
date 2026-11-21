# LANDING-1 — Landing Page Spec v1 (approved design)

Source of truth for the public landing page (`/`). Design reference: `docs/design/landing-v1-reference.html` (open in a browser; Desktop/Phone and EN/हिंदी toggles). Owner-approved 21 Nov 2026.

## 0. Non-negotiables
- Light mode only for this phase. Dark mode is a later phase.
- No product screenshots, no stock photos, no AI people, no fake numbers, no testimonials, no "No.1", no counters, no carousels, no parallax, no auto-rotating anything.
- All visible copy comes from this spec (EN + HI). Do not invent claims.
- Facts that must stay editable in ONE place (constants file): founding date "August 2024", city "Kanpur, Uttar Pradesh", "MSME-registered", exam example lists, library facts.

## 1. Design tokens (final palette, locked 19 Nov 2026)
| Token | Hex | Use |
|---|---|---|
| `cl-blue` | #475BFF | Primary buttons/CTAs (white text 4.99:1) |
| `cl-blue-hover` | #394EFF | Hover/pressed |
| `cl-blue-text` | #3A4BEB | Links on white |
| `cl-blue-deep` | #2A3587 | Gradient icon base |
| `cl-blue-tint` | #EEF0FF | Badges, selected, FAQ icon bg |
| `cl-band` | linear-gradient(135deg,#485BFF 0%,#4262F3 45%,#3973D6 100%) | "Find your exam" band + final CTA box |
| `cl-charcoal` | #18191B | Text, search pill, library section, footer |
| `cl-slate` | #5B6070 | Secondary text |
| `cl-silver` | #A9AEBB | Text on charcoal |
| `cl-cloud` | #F5F6FA | Alternate sections |
| `cl-line` | #E6E8EF | Borders |
| `cl-ocean` | #0471AC | Category / promise icon |
| `cl-violet` | #7A4CE2 | Category / promise icon |
| `cl-teal` | #2E8694 | Category gradients |
| `cl-coral` | #FF6B4A | ONLY "Improve" moments |
| `cl-coral-text` / `cl-coral-tint` | #C2401F / #FFEDE7 | Improvement text/badges |
| Logo | cyan #22E3F2 + violet #4B00E6 | Logo only; never recolour |

Category card gradients (135deg): SSC #475BFF→#2A3587 · Banking #2E8694→#1E5E6B · Railway #0471AC→#034A73 · Police #7A4CE2→#4B2A9E · Defence #3973D6→#24458A · Teaching #5B4FE0→#2E2A8F · State PSC #0471AC→#2A3587 · All exams: dashed border, #F5F6FA card, #EEF0FF top, #3A4BEB icon.
Step icon tiles: #5A6CFF→#2A3587; the 6th step ("Improve") #FF8A6E→#E2502F.
Promise icon chips (bg/icon): #F1ECFE/#7A4CE2 · #E6F4FB/#0471AC · #E5F4F5/#22767F · #EEF0FF/#3A4BEB.

Add these as NEW tokens (prefix `cl-`). Do not remap or rename existing palette tokens in this phase.

## 2. Typography
- Headings: Poppins 600/700. Body EN: Inter 400/500/600. Hindi (headings and body): Noto Sans Devanagari 400–700.
- When language = HI, body 17 px (EN 16 px), Hindi H1 line-height 1.25.
- H1 clamp(32px → 58px), section H2 clamp(26px → 40px), line-height 1.1–1.2, letter-spacing −0.01 to −0.015em, `text-wrap: balance`.
- Use `next/font` (self-hosted, `display: swap`); reuse any font setup that already exists.

## 3. Layout and components
- Content max width 1080 px; side padding 28 px (18 px on phone). Breakpoints: ≤600 phone, ≤900 tablet.
- Buttons: pill (radius 999), min height 46 px (header 38 px). Primary = cl-blue + soft blue shadow; on the band/final box = white button with #2A3587 text.
- Cards: white, 1 px cl-line, radius 16–20; hover (desktop, `hover:hover` only) lift 2 px + shadow, 180 ms ease-out.
- Soft radial blue glow behind hero (rgba(71,91,255,.15)); library section has a blue glow top-right.
- Header: sticky, white 92% + blur, 66 px (60 px phone). Phone: logo, EN/हिंदी switch, menu button; nav and CTAs move into the menu.

## 4. Sections (order, purpose, notes)
| # | Section | Visual | Why (research) |
|---|---|---|---|
| 1 | Header | Logo, nav, EN/हिंदी switch, Sign in, Start free | Header: the language switch sits in plain sight (98% of Indian internet users use Indic-language content, IAMAI). One main action, Start free. |
| 2 | Hero | Badge, H1, sub, CTAs, tagline with cyan→violet rules, improvement-loop diagram card (wide ellipse on desktop, circle on phone) | Hero: says what we do in 5 seconds (NN/G, Baymard: purpose first; slogans alone fail). Diagram, not a screenshot, because the product UI is not final. |
| 3 | Find your exam | Blue band, charcoal search pill with round blue button, popular-exam chips | Find your exam: students arrive with one exam in mind; every competitor routes by exam second. Spaceship-style blue band + charcoal search pill. |
| 3b | Choose your exam | 8 cards (4/3/2 columns) with gradient tops + icon | Exam cards: one gradient colour per category from the palette (Ocean, Violet, Teal, Blue). Whole card is one link; 2 px lift on hover (180 ms). |
| 4 | Pain → answer | 3 cards: quote + blue tick + answer (cloud bg) | Pain → answer: written in aspirants' own words from voice-of-customer research ("I made too many mistakes"). Only promises the product already keeps. |
| 5 | How it works | 6 steps, gradient icon tiles, dashed connector; vertical timeline on phone | How it works: no competitor explains its loop; this is our story. Coral marks only the "Improve" moment (palette rule). |
| 6 | Free / Pro | Free card (2 px blue border, main) + Pro card (cloud, muted, "Optional") | What's free: aspirants want to "try free first" before paying. No prices until payments open; Pro clearly labelled optional. |
| 7 | Real library | Charcoal section, facts as pills, map pin, 3 photo slots (1 large + 2) | Real library: showing a real organisation is a top credibility signal (Stanford Web Credibility guidelines). Placeholders until the owner's photo shoot. |
| 8 | Promises | 4 cards with coloured icon chips | Promises: competitors lose trust through fake selection claims and refund complaints. We state the opposite, plainly. |
| 9 | FAQ | Native `<details>` accordion, first open | FAQ: answers the last objections (exams, price, language, device, refunds, who runs it). Accordion opens in 200 ms. |
| 10 | Final CTA + footer | Gradient box with white button; charcoal footer, 4 columns | Final call: repeat the main action at the end of the story. Footer carries the purpose line and legal links (grievance officer per IT Rules). |

Photo slots: until real photos exist, render tasteful placeholders (no stock). Real photos later as AVIF/WebP via `next/image`, 60–120 KB each, explicit width/height.

## 5. Copy (EN + HI)

### Header, hero, band
| Key | English | हिंदी |
|---|---|---|
| Nav | Exams · Learn · Current Affairs · Mock Tests | परीक्षाएँ · पढ़ाई · करेंट अफेयर्स · मॉक टेस्ट |
| Sign in | Sign in | साइन इन |
| Primary CTA | Start free | मुफ़्त शुरू करें |
| Hero badge | Free for every aspirant · Hindi & English | हर aspirant के लिए मुफ़्त · हिंदी और English |
| H1 (bold part = blue) | Find your weak topics. Fix them. **Score better** in your next attempt. | अपने कमज़ोर टॉपिक पहचानें। उन्हें सुधारें। अगले attempt में **बेहतर स्कोर** करें। |
| Hero sub | Free lessons, practice and mock tests for SSC, Banking, Railway and other government exams, in Hindi and English. | SSC, बैंकिंग, रेलवे और दूसरी सरकारी परीक्षाओं के लिए मुफ़्त lessons, practice और mock tests, हिंदी और English में। |
| Secondary CTA | Explore exams | परीक्षाएँ देखें |
| Tagline | Har attempt, behtar. | हर attempt, बेहतर। |
| Loop labels (1→6) | Learn · Practise · Mock · Weak topics · Fix · Improve | पढ़ें · Practice · Mock · कमज़ोर टॉपिक · सुधारें · बेहतर |
| Band H2 | Find your exam | अपनी परीक्षा खोजें |
| Band text | Syllabus, lessons, practice and mocks for your exam, in one place. | आपकी परीक्षा का syllabus, lessons, practice और mocks, एक ही जगह। |
| Search placeholder | Search SSC CGL, IBPS PO, RRB NTPC… | SSC CGL, IBPS PO, RRB NTPC खोजें… |
| Chips | SSC CGL · RRB NTPC · IBPS PO · UP Police · CTET | SSC CGL · RRB NTPC · IBPS PO · UP Police · CTET |

### Choose your exam
| Key | English | हिंदी |
|---|---|---|
| H2 | Choose your exam | अपनी परीक्षा चुनें |
| Lead | Start with the exam you are preparing for. Everything inside follows its syllabus. | जिस परीक्षा की तैयारी कर रहे हैं, वहीं से शुरू करें। अंदर सब कुछ उसी के syllabus के हिसाब से है। |

| # | Name (EN) | Examples (EN) | Name (HI) | Examples (HI) |
|---|---|---|---|---|
| 1 | SSC | CGL, CHSL, MTS, GD | SSC | CGL, CHSL, MTS, GD |
| 2 | Banking | IBPS, SBI PO & Clerk | बैंकिंग | IBPS, SBI PO और Clerk |
| 3 | Railway | NTPC, Group D, ALP | रेलवे | NTPC, Group D, ALP |
| 4 | Police | UP Police, Delhi Police | पुलिस | UP Police, Delhi Police |
| 5 | Defence | Agniveer, CDS, AFCAT | डिफेंस | Agniveer, CDS, AFCAT |
| 6 | Teaching | CTET, UPTET, KVS | टीचिंग | CTET, UPTET, KVS |
| 7 | State PSC | UPPSC, BPSC, RPSC | राज्य PSC | UPPSC, BPSC, RPSC |
| 8 | All exams | See the full list → | सभी परीक्षाएँ | पूरी सूची देखें → |

### Pain → answer
| Key | English | हिंदी |
|---|---|---|
| H2 | Scoring low and don't know why? | नंबर कम आ रहे हैं और वजह नहीं पता? |
| Lead | Most aspirants work hard. What's missing is knowing exactly what to fix. | ज़्यादातर aspirants मेहनत करते हैं। कमी बस यह जानने की है कि ठीक-ठीक क्या सुधारना है। |

| # | Quote (EN) | Answer (EN) | Quote (HI) | Answer (HI) |
|---|---|---|---|---|
| 1 | “I keep making the same mistakes.” | Every wrong answer comes with an explanation and a link to the exact lesson, so the mistake doesn't repeat. | “बार-बार वही गलतियाँ हो जाती हैं।” | हर गलत जवाब के साथ explanation और उसी lesson का link मिलता है, ताकि वह गलती दोबारा न हो। |
| 2 | “I don't know which topic is weak.” | Each mock breaks your score down topic by topic, so you can see where marks are lost. | “समझ नहीं आता कौन-सा टॉपिक कमज़ोर है।” | हर mock आपका स्कोर टॉपिक के हिसाब से बाँटकर दिखाता है, ताकि पता चले नंबर कहाँ कटे। |
| 3 | “I study a lot, but my marks don't rise.” | After every attempt you get a short list of what to learn and practise next. Nothing extra. | “इतनी पढ़ाई के बाद भी नंबर नहीं बढ़ते।” | हर attempt के बाद एक छोटी सूची मिलती है: आगे क्या पढ़ना है और क्या practice करनी है। बस उतना ही। |

### How it works
| Key | English | हिंदी |
|---|---|---|
| H2 | How it works | यह कैसे काम करता है |
| Lead | One simple loop. Every attempt teaches you something, and the next one goes better. | एक आसान loop। हर attempt कुछ सिखाता है, और अगला attempt बेहतर होता है। |

| # | Step (EN) | Text (EN) | Step (HI) | Text (HI) |
|---|---|---|---|---|
| 1 | Learn | Clear lessons for every syllabus topic | पढ़ें | हर syllabus टॉपिक के साफ़ lessons |
| 2 | Practise | Topic-wise questions with solutions | Practice | टॉपिक के हिसाब से सवाल, हल के साथ |
| 3 | Mock | Full tests in the real exam pattern | Mock | असली exam pattern में पूरे टेस्ट |
| 4 | Find weak topics | See exactly where marks were lost | कमज़ोर टॉपिक | देखें नंबर ठीक कहाँ कटे |
| 5 | Fix | Open the lesson and practise that topic | सुधारें | वही lesson खोलें और practice करें |
| 6 | Improve | Score better in your next attempt | बेहतर | अगले attempt में बेहतर स्कोर |

### Free / Pro
| Key | English | हिंदी |
|---|---|---|
| H2 | Start free. Stay free. | मुफ़्त शुरू करें। मुफ़्त ही रहेगा। |
| Lead | Everything you need to begin is free. Pro is optional, for when you want more. | शुरुआत के लिए जो कुछ चाहिए, सब मुफ़्त है। Pro वैकल्पिक है, जब आपको ज़्यादा चाहिए। |
| Free title | Free | Free |
| Free tag | For everyone | सबके लिए |
| Free sub | No card needed. Sign up and start. | कोई कार्ड नहीं चाहिए। Sign up करें और शुरू करें। |
| Free list | Topic-wise lessons for every exam · Daily practice questions with solutions · Daily current affairs and quiz · Free mock tests in the exam pattern · Your result, topic by topic | हर परीक्षा के टॉपिक-वार lessons · रोज़ के practice सवाल, हल के साथ · रोज़ करेंट अफेयर्स और quiz · Exam pattern में मुफ़्त mock tests · आपका result, टॉपिक के हिसाब से |
| Pro title | Pro | Pro |
| Pro tag | Optional | वैकल्पिक |
| Pro sub | For aspirants who want the full mock series. | उन aspirants के लिए जो पूरी mock series चाहते हैं। |
| Pro list | Full mock test series · Advanced analysis of every attempt · Mistake drills and revision | पूरी mock test series · हर attempt का गहरा analysis · गलतियों की drills और revision |
| Pro note | Pro opens soon. Free features stay free. | Pro जल्द आ रहा है। Free features हमेशा free रहेंगे। |

### Library
| Key | English | हिंदी |
|---|---|---|
| Eyebrow | A real library behind it | पीछे एक असली लाइब्रेरी |
| H2 | Built inside a real study library in Kanpur | कानपुर की एक असली स्टडी लाइब्रेरी में बना |
| Text | Since August 2024, Courage Library has given aspirants a quiet place to prepare. This platform takes the same focus online, for students who study on their own. | अगस्त 2024 से Courage Library aspirants को तैयारी के लिए एक शांत जगह दे रही है। यह platform वही focus online लाता है, खुद से पढ़ने वाले students के लिए। |
| Fact pills | Since Aug 2024 · Noise-controlled reading hall · AC · 5G Wi-Fi · Newspapers daily · RO water | अगस्त 2024 से · शांत reading hall · AC · 5G Wi-Fi · रोज़ अख़बार · RO पानी |
| Location | Kanpur, Uttar Pradesh | कानपुर, उत्तर प्रदेश |
| Photo slot labels | Reading hall · Desk close-up · Entrance & signboard | Reading hall · Desk की नज़दीकी फ़ोटो · Entrance और बोर्ड |
| Placeholder note | Real photo to be shot | असली फ़ोटो ली जानी है |

### Promises
| Key | English | हिंदी |
|---|---|---|
| H2 | Our promises to you | आपसे हमारे वादे |
| Lead | What we will never do, and what we will always do. | हम क्या कभी नहीं करेंगे, और क्या हमेशा करेंगे। |

| # | Title (EN) | Text (EN) | Title (HI) | Text (HI) |
|---|---|---|---|---|
| 1 | No fake toppers | We never show invented selection numbers or fake results. Ever. | कोई नकली टॉपर नहीं | हम कभी बनावटी selection numbers या नकली results नहीं दिखाते। |
| 2 | Checked answers | Every question has a “Report a problem” button, and we fix what you report. | जाँचे हुए जवाब | हर सवाल पर “Report a problem” बटन है, और आप जो बताते हैं, हम ठीक करते हैं। |
| 3 | Clear refund policy | Simple rules, written in plain words, before you pay anything. | साफ़ refund policy | पैसे देने से पहले, आसान शब्दों में लिखे साफ़ नियम। |
| 4 | Hindi and English | Learn in the language you think in. Switch any time. | हिंदी और English | जिस भाषा में सोचते हैं, उसी में पढ़ें। कभी भी बदलें। |

### FAQ
| Key | English | हिंदी |
|---|---|---|
| H2 | Questions aspirants ask | Aspirants के सवाल |

| # | Question (EN) | Answer (EN) | Question (HI) | Answer (HI) |
|---|---|---|---|---|
| 1 | Which exams are covered? | SSC, Banking, Railway, Police, Defence, Teaching and State PSC exams. We are adding more exams step by step, following each official syllabus. | कौन-सी परीक्षाएँ शामिल हैं? | SSC, बैंकिंग, रेलवे, पुलिस, डिफेंस, टीचिंग और राज्य PSC परीक्षाएँ। हर official syllabus के हिसाब से हम धीरे-धीरे और परीक्षाएँ जोड़ रहे हैं। |
| 2 | Is it really free? | Yes. Lessons, daily practice, current affairs, free mocks and your topic-wise result are free. Pro is optional. | क्या यह सच में मुफ़्त है? | हाँ। Lessons, रोज़ की practice, करेंट अफेयर्स, मुफ़्त mocks और टॉपिक-वार result मुफ़्त हैं। Pro वैकल्पिक है। |
| 3 | Can I study in Hindi? | Yes. Switch between Hindi and English at any time with the button at the top. | क्या हिंदी में पढ़ाई हो सकती है? | हाँ। ऊपर दिए बटन से कभी भी हिंदी और English के बीच बदलें। |
| 4 | Do I need an app? | No. It works in the browser on any phone or computer. | क्या app चाहिए? | नहीं। यह किसी भी फ़ोन या कंप्यूटर के browser में चलता है। |
| 5 | What if I pay for Pro and change my mind? | Our refund policy explains exactly when and how you get your money back, in simple words. | Pro लेने के बाद मन बदल जाए तो? | हमारी refund policy आसान शब्दों में बताती है कि पैसे कब और कैसे वापस मिलते हैं। |
| 6 | Who runs Courage Library? | Courage Library is an MSME-registered study library in Kanpur, running since August 2024. | Courage Library कौन चलाता है? | Courage Library कानपुर की एक MSME-registered स्टडी लाइब्रेरी है, जो अगस्त 2024 से चल रही है। |

### Final CTA + footer
| Key | English | हिंदी |
|---|---|---|
| H2 | Your next attempt starts today | आपका अगला attempt आज से शुरू |
| Text | Pick your exam, take a free mock and see exactly what to fix. | अपनी परीक्षा चुनें, एक मुफ़्त mock दें और देखें कि ठीक क्या सुधारना है। |
| Purpose line | We give every aspirant the courage to attempt again and the clarity to do better each time. | हम हर aspirant को फिर से attempt करने की हिम्मत और हर बार बेहतर करने की स्पष्टता देते हैं। |
| Copyright | © 2026 Courage Library · Kanpur | © 2026 Courage Library · कानपुर |
| Made line | Made for aspirants, in Hindi and English | Aspirants के लिए, हिंदी और English में |

Footer columns (EN): Platform: Exams, Lessons, Mock tests, Current affairs · Company: About, Library in Kanpur, Contact, Help · Legal: Terms, Privacy, Refund policy, Grievance officer
Footer columns (HI): Platform: परीक्षाएँ, Lessons, Mock tests, करेंट अफेयर्स · Company: हमारे बारे में, कानपुर लाइब्रेरी, संपर्क, मदद · Legal: Terms, Privacy, Refund policy, Grievance officer

## 6. Links (map to EXISTING routes; inspect the app, never invent)
Start free → existing sign-up · Sign in → existing sign-in · Exams/Explore exams/All exams/category cards → existing exam listing/category routes · chips → that exam's page if it exists, else the exam listing · search pill → existing exam search if it exists, else link to the exam listing · Learn, Current Affairs, Mock Tests → existing routes · footer legal → existing /terms, /privacy, refund, grievance pages. A target that does not exist → plain link to the closest existing page + note in the report. Never a 404.

## 7. Motion
Hover 150 ms ease-out · press 100 ms · card lift 180 ms · accordion 200 ms ease-in-out · no scroll animations required (optional fade+8 px rise, once). `prefers-reduced-motion`: no transitions. CLS < 0.1.

## 8. Accessibility
WCAG 2.2 AA contrast (all pairs above pass); visible focus ring 2 px #475BFF; one H1; landmark elements; `lang="hi"` on Hindi content; language switch is real buttons/links with `aria-pressed`/`aria-current`; diagrams have text alternatives; tap targets ≥ 44 px; no information by colour alone.

## 9. Performance
No new runtime dependencies for visuals (inline SVG). LCP element = H1 text. Images lazy below the fold. Keep the page JS minimal (server components by default; client only for the menu and language switch if needed).
