# Design rules (R1–R13)

The product design rules for Courage Library. Every UI phase brief and every review refers to them by number.

- **R1** Practice and mocks are the centre; everything else feeds them.
- **R2** Wrong answers return on a spaced schedule until recalled correctly on a later day.
- **R3** Feedback is about the task and the next step, never about the person.
- **R4** One primary action per screen = **solid blue-700** (`bg-brand`); secondary actions visibly quieter (outline / ghost). On the dark / brand-gradient hero the primary is the white pill with blue text. Amber is retired (decision #84, 2026-10-26).
- **R5** Show, don't make users remember: status, progress and "continue" always visible.
- **R6** Mock player follows the real CBT's meanings (status colours, buttons, palette).
- **R7** Every answer autosaves with visible confirmation; interruptions resume exactly.
- **R8** No surprise alerts, flashing or alarm sounds during tests.
- **R9** Website UI in plain English only (#82); learning content in English/Hindi by user preference; official exam terms kept, glossed once.
- **R10** Light-first reading; WCAG 2.2 AA contrast, reflow, touch targets ≥ 48 px.
- **R11** Gamification only where it reflects real learning; no shame, no fake urgency (CCPA).
- **R12** Credibility through consistency and real facts, never claims or invented values.
- **R13** Study comfort (decision #84, research-based):
  - **Reading surfaces always light:** navy / slate text on white or the canvas `#F7F8FC`. Question and article text ≥ 7:1 contrast, 16–18 px, line-height 1.6.
  - **Saturated colour only small:** buttons, highlights, chips, the hero. Never a background behind reading text.
  - **Exam timer:** blue normally, orange (`warning-600` #EA580C) in the last 5 minutes, never flashing, never red (with R8).
  - **Results:** a wrong answer = a soft red tint plus a prominent "Here's why" explanation (learning first, not failure).
  - **No yellow / amber anywhere.** Orange is for warnings only; the brand gradient (cyan → blue → violet) only for brand moments: the hero, the Today mission card, the email band, the active nav marker, the logo.
  - **Dark mode:** backlog DARK-MODE-1 (soft navy, not pure black).
