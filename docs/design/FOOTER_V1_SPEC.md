# FOOTER-1 — Footer Spec v1 (owner-approved 23 Nov 2026)

Visual reference: `docs/design/footer-v1-reference.html` (desktop + phone, 10 numbered changes). Palette/tokens/logo as in LANDING_V1_SPEC (cl-* tokens, public/brand/). Page groups as in NAV_V1_SPEC (visitor / student / exam focus).

## 0. Decisions
| Area | Decision |
|---|---|
| Structure | **Different by page type**: full footer on public pages · slim line on student pages · none inside a live exam |
| Columns | **4**: Exams · Prepare · Company · Help & legal |
| Library | **One small line** linking to an existing library page (hidden if none exists) |
| Bottom strip | Social icons · EN/हिंदी switch (/ and /hi only) · MSME + Razorpay trust line · contact email |

## 1. Rules
- **One shared component per version** (PublicFooter, StudentFooter). Replace every existing footer; no two versions of the same footer.
- **Only live routes are linked.** Items whose route does not exist are muted text ("soon") or hidden (Learn: hidden until the Learn index exists, same flag/route check as NAV-1).
- **Config, not hardcoding:** contact email, social URLs and the library page path come from one typed config file (`lib/site/footer-config.ts` or the existing site config if one exists). Any value not set → that element is hidden. **No placeholder text in production.** Do not invent URLs or emails; do not use the account/owner email.
- **No emoji.** SVG line icons only (existing icon set).
- No DB, API, auth or payment change. Exam category list reuses the existing live-data source used by the NAV-1 Exams menu (no new query if one exists).

## 2. Public footer (all visitor pages per NAV-1 §1, incl. auth and legal pages)
1. **Sign-up band** above the footer: band gradient #485BFF→#3973D6, "Start preparing today" / "Free daily mock, current affairs and practice." + white "Start free" pill. Hidden when signed in (existing pre-paint data-auth) and replaced by "Explore exams" when sign-up is closed (X-01 rule). Not shown on auth pages.
2. **Brand block**: logo lockup (public/brand), tagline "Learn Smarter. Prepare Independently.", contact email as `mailto:` (if configured).
3. **Library line**: "Also a study library in Kanpur ›" → existing library page (if configured/exists).
4. **Columns** (h2-level visually small headings, `nav aria-label="Footer"`):
   - Exams: top categories from live data (max 5, live first; not live → muted "· soon", not a link) + "All exams ›" (/exams)
   - Prepare: Mock Tests · Daily free mock (only if a stable route exists) · Current Affairs · Learn (when ready)
   - Company: About us · Contact · Partner Schools (if route exists)
   - Help & legal: Help centre · Privacy Policy · Terms of Use · Refund Policy (only those that exist)
5. **Trust line**: "© {current year} Courage Library · Registered MSME (Udyam) · Secure payments by Razorpay" — plain text, no logos/badges.
6. **Social icons**: only configured accounts; 44 px targets; aria-label "Courage Library on YouTube" etc.; `target="_blank" rel="noopener noreferrer"`.
7. **EN | हिंदी** switch only on / and /hi (same component/behaviour as the header switch). On /hi all footer copy is Hindi.
Layout desktop: brand block 1.4fr + 4 columns; bottom strip 64 px. Background cl-cloud, top border cl-line.
8. **Phone (< 900 px)**: brand block, then 2 × 2 column grid (all links visible, no accordions), then social + trust line stacked. Link rows ≥ 44 px.

## 3. Student footer (student app pages per NAV-1 §2)
9. **Phone**: one wrapped line "© {year} Courage Library · Help · Privacy · Terms · Refunds" placed in page flow above the bottom bar (content padding keeps it fully visible above the bottom nav and any page bar, e.g. RESULT-UX-1).
10. **Desktop**: one line at the bottom of the content area (right of the sidebar): © · Help · Privacy · Terms · Refunds · Contact. 12.5 px cl-slate, top border cl-line.

## 4. Exam focus
No footer on live attempt routes (`/take` and any live-test attempt route). Result pages use the student footer.

## 5. Accessibility, SEO & quality
`<footer>` landmark (one per page), footer `nav` with distinct aria-label, visible focus ring, links are real `<a>` (crawlable, work without JS), external links marked. Contrast AA. No layout shift (CLS < 0.1). Footer must not appear twice on any page (layout nesting check). Works at 1366×768, 1920×1080, 768×1024, 390×844, 360×740 with no horizontal scroll.

## 6. Copy (EN / HI)
Start preparing today / आज से तैयारी शुरू करें · Free daily mock, current affairs and practice. / मुफ़्त डेली मॉक, करेंट अफेयर्स और प्रैक्टिस। · Start free / मुफ़्त शुरू करें · Explore exams / परीक्षाएँ देखें · Learn Smarter. Prepare Independently. (tagline stays English) · Also a study library in Kanpur / कानपुर में स्टडी लाइब्रेरी भी › · Exams / परीक्षाएँ · Prepare / तैयारी · Company / कंपनी · Help & legal / मदद और नियम · All exams / सभी परीक्षाएँ › · Mock Tests / मॉक टेस्ट · Daily free mock / डेली फ़्री मॉक · Current Affairs / करेंट अफेयर्स · About us / हमारे बारे में · Contact / संपर्क · Partner Schools / पार्टनर स्कूल · Help centre / सहायता केंद्र · Privacy Policy / प्राइवेसी पॉलिसी · Terms of Use / उपयोग की शर्तें · Refund Policy / रिफ़ंड पॉलिसी · soon / जल्द · Registered MSME (Udyam) / पंजीकृत MSME (उद्यम) · Secure payments by Razorpay / Razorpay द्वारा सुरक्षित भुगतान.

## 7. Out of scope
New pages (library page, Learn index, refund page if missing — report only), newsletter, app-store badges, admin footer, CNTS subdomain footer, dark mode.

## 8. Owner inputs pending (elements stay hidden until set in config)
Public contact email · active social account URLs · library page (exists or not).
