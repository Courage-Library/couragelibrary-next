# Courage Library: product context

> Durable product context for design work (read by the Impeccable skill). It holds no design tokens; for those, see [DESIGN.md](DESIGN.md). Written in UX-T0 (2026-10-19). Where this file and a locked decision disagree, the decision wins.

## Mission

**Learn Smarter. Prepare Independently.**

We help Indian government-exam aspirants prepare on their own, with authentic material, honest feedback and a clear next step. We do not depend on coaching-centre hype.

## Audience

- **Who:** candidates for Indian government exams. SSC is live today. Planned areas are Banking, Railways, State PSCs, UPSC, Defence/Police and Teaching.
- **Devices and network:**
  - Many students use **low-end Android phones on metered mobile data**.
  - Design for 360px first, slow 4G and modest CPUs.
  - Every byte and every animation has a cost.
- **Usage scene:**
  - Short sessions on the commute, at a hostel or in a library.
  - Long, focused sessions for full mocks.
  - Light-first in daylight. Accessibility is WCAG 2.2 AA.
- **Language:**
  - Students read **Hindi and English**.
  - The UI ships in **English today** (owner decision, UX-0 §7). It must stay **bilingual-ready**: keyed strings, no text baked into images, layouts that survive longer Hindi strings, and the Devanagari type minimums in DESIGN_SYSTEM.md.
- **Roles:** candidate (primary); staff/SME and admin (internal, Operate surfaces only).

## The learning loop

**EXPLORE → LEARN → PRACTICE → MOCK → ANALYZE → DIAGNOSE → MASTER**

Every student page belongs to one step of the loop and should point to the next one. Examples: a result leads to the mistakes for that result, a mistake leads to a drill, and a drill leads to mastery.

## Offer

**Free / Pro.**
- Free is a real product, not a teaser.
- The correct answer is never paywalled.
- While payments are off, no price may imply that a purchase is possible ("Pricing announced soon" / "Notify me when Pro opens").

## Voice and trust (non-negotiable)

- **Trust and accuracy over hype.**
- **No inflated claims:**
  - no "thousands of aspirants", "N+", "lakhs", toppers, ratings or testimonials unless they are real and verifiable (#47);
  - counts come live from published rows, or they are not shown.
- **Honest states:** "coming soon" only when it is true; empty means empty; never imply work that is not happening (for example "undergoing verification" when nothing is queued).
- **No system words in the UI:** Phase, SRS, pilot, telemetry, UUID and similar (UX-1b U-1).
- **Indian formats:** ₹, lakh/crore grouping, DD Mon YYYY, IST.

## Surfaces and their design mode

The mode applies to the surface, not to the product.

| Mode | Surfaces | Success looks like |
|---|---|---|
| **Operate** | dashboard, test console, results, analytics/performance, mistakes, practice, flashcards, achievements, notifications, admin | the student finishes the task fast and knows the next step |
| **Read** | current affairs (hub, day, month, article), articles, exam detail, course content | the student understands and remembers |
| **Persuade** | landing, pricing, premium, signup/login, CNTS-type pages | the visitor decides honestly and acts |

**The test console is a special Operate surface.** It is server-authoritative and distraction-free: no decorative motion, a timer that never animates, and no change to timer, autosave, palette or submit behaviour.

## Anti-references

- Coaching-portal clutter: banners, blinking badges, countdown pressure, fake scarcity.
- Gamified dark dashboards and leaderboard theatre.
- Gradient-heavy "AI" landing pages.
