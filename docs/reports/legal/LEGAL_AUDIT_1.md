# LEGAL-AUDIT-1: inspection of the legal pages

This report inspects the legal pages and lists the gaps. It changes no page text; the architect writes the text.

- **Date:** 2026-10-25.
- **Source:** the routes and copy below.

The checks are against Razorpay website compliance, the DPDP Act 2023, the IT Rules 2021 (grievance), and the Consumer Protection (E-Commerce) Rules 2020. They are indicative engineering findings, not legal advice.

## Pages today

| Page | Route | Source | Last content change | State |
|---|---|---|---|---|
| Privacy policy | `/privacy` | `content/public-pages.ts` `PRIVACY_PAGE` | 2026-10-21 | Marked as a draft under legal review. No "last updated" date on the page. |
| Terms of use | `/terms` | `content/public-pages.ts` `TERMS_PAGE` | 2026-10-21 | Draft. "Governing law: To be confirmed in legal review." |
| Refund / cancellation | — | — | — | **Missing** |
| Delivery (shipping) of a digital service | — | — | — | **Missing** |
| Contact | `/contact` | `content/public-pages.ts` `CONTACT_PAGE` | 2026-10-21 | Email + "Kanpur, Uttar Pradesh". No phone, no full address, no legal entity name. |
| Pricing | `/pricing` | `app/pricing` + `config/payments.ts` | 2026-10-21 | Payments off: the page shows the free / early-access view. Paid plans are shown only with payments on. |
| Grievance redressal | `/grievance` | `content/support.ts` | 2026-10-25 | Officer name and designation, email, phone + hours, postal address. Acknowledgement within 24 hours, resolution within 15 days. |
| Help | `/help` | `content/support.ts` | 2026-10-25 | FAQ, contact email, grievance link and officer line. |

## Gaps by framework

| # | Framework | Requirement (summary) | Today | Gap |
|---|---|---|---|---|
| 1 | Razorpay website compliance | Terms, privacy, **refund & cancellation**, **delivery / shipping**, contact page with email + phone + address; prices in INR; one consistent business name | Terms and privacy are drafts; contact has email + city only | Missing refund / cancellation page; missing delivery page (digital access: when and how it is given); contact lacks phone + full address + legal entity name (the phone and address now exist on `/grievance` only); no prices to review while payments are off |
| 2 | Razorpay | Policies reachable from every page (footer) | Footer: privacy + terms (draft labels), contact, help, grievance | The refund and delivery links are needed once those pages exist |
| 3 | DPDP Act 2023: notice (s.5) | Itemised data and purposes; how to exercise rights; how to complain to the Data Protection Board | "What we collect" and "How we use" are listed | The list predates new processing: Memory Lock schedule, profile / username / public profile / leaderboard opt-in, support tickets, proctoring events (tab / fullscreen during a test), admin MFA factor (Supabase), Google sign-in, Cloudflare Turnstile. No mention of the right to complain to the Data Protection Board. |
| 4 | DPDP: consent (s.6) | Free, specific, informed, unambiguous; withdrawal as easy as giving it | Consent is implied by sign-up; no consent record | No explicit consent step or record; no withdrawal path except by email |
| 5 | DPDP: rights (s.11–14) | Access to a summary, correction, erasure, grievance redressal, nomination | "Email us to see, correct or delete" | Nomination is missing; there are no response times for rights requests; no in-app path (support tickets exist once flagged on) |
| 6 | DPDP: contact (s.8(9)) | Contact of the person who answers data-processing questions | Support email | The Grievance Officer is now named on `/grievance`, but the privacy policy does not reference them |
| 7 | DPDP: retention (s.8(7)) | Erase data when its purpose is served, unless the law requires keeping it | "except where the law requires us to keep something" | No retention periods per data type (account, attempts, logs, tickets, proctoring events, backups) |
| 8 | DPDP: children (s.9) | Verifiable parental consent under 18; no tracking / behavioural monitoring / targeted ads | "Not yet open to school students"; public profile and leaderboards need an 18+ self-confirmation | No age statement at sign-up for general users; proctoring events and analytics may count as monitoring for under-18 users; parental-consent flow not built (the CNTS note says it will be) |
| 9 | DPDP: breach (s.8(6)) | Notify the Board and the affected users | Not mentioned | Breach-notification commitment missing |
| 10 | DPDP: processors | Processors bound by contract; named where helpful | Supabase, Vercel, "our email provider" | Email provider unnamed; Google (sign-in) and Cloudflare (Turnstile) missing |
| 11 | IT Rules 2021, rule 3(1)(a) | Publish rules, privacy policy and user agreement prominently | Drafts published | Final texts pending; the terms lack the prohibited-content list rule 3(1)(b) expects (community / discussion features exist behind flags) |
| 12 | IT Rules 2021, rule 3(2) | Grievance Officer name + contact; acknowledge within 24 h; dispose within 15 days | Done on `/grievance` (Q1) | Reference the Grievance Officer from the terms and privacy pages too |
| 13 | E-Commerce Rules 2020, rule 4 | Legal name, principal address, customer-care contact (incl. phone); grievance officer details; ticket number for complaints; acknowledge within 48 h, redress within 1 month | Grievance details + 24 h / 15 days published; ticket refs exist (CL-YYMMDD-…) once tickets are on | Legal entity name not shown anywhere; contact page lacks phone + address; no refund / cancellation / exchange info |
| 14 | E-Commerce Rules 2020, rule 4(5) | Price breakdown and all charges before purchase | Payments off | Review when paid plans go on (GST shown?) |
| 15 | E-Commerce Rules 2020, rule 6(4)/(5) | No manipulated prices, no fake urgency, no fake reviews | UX-2b.H honesty gates enforce this in the product | — (keep the gates) |
| 16 | General | "Last updated" date on each policy | None | Add a visible date to privacy, terms and the future refund / delivery pages |

## Facts the text will need (from the code)

- **Sign-up data:** email, the name entered (stored as `full_name`), a password hash at Supabase. Google sign-in, when enabled, adds the Google name and avatar.
- **Learning data:** attempts and answers, results, mistakes / Memory Lock schedule, practice answers, reports of questions, support tickets.
- **Proctoring events:** tab hidden or visible, fullscreen exit or enter, each with a server time. They are linked to the attempt, with no IP and no device data.
- **Profile:** username, public-profile and leaderboard choices, and the 18+ confirmation time. No date of birth is stored.
- **Processors in the stack:** Supabase (database, auth, MFA), Vercel (hosting), the email provider (auth mail), Google (OAuth, when enabled), Cloudflare Turnstile (when enabled). No AI service receives student answers.
- **Payments:** off (`config/payments.ts`). Razorpay is not active.
