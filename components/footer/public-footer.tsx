import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight, Mail } from "lucide-react";
import type { FooterCopy } from "@/content/footer";
import type { NavLabels } from "@/content/nav/labels";
import { LangSwitch } from "@/components/nav/visitor-header";
import { SocialIcon } from "@/components/footer/social-icon";
import { footerEmail, footerLibraryPath, footerSocials } from "@/lib/site/footer-config";
import { FOOTER_ROUTES, footerColumns, trustLine, type FooterCategory, type FooterColumn } from "@/lib/site/footer-links";

/**
 * FOOTER-1 — THE public footer (owner spec docs/design/FOOTER_V1_SPEC.md §2, 23 Nov 2026), one shared server component
 * for every visitor page: the landing (/ and /hi), the cached public shell and the per-request visitor pages (auth and
 * legal included). Never inside a live exam, never for a signed-in student (StudentFooter).
 *   1 sign-up band (not on / and /hi, never on auth pages; hidden when signed in by CSS; never waits on a read —
 *     "Start free" only with a sign-up state already resolved, else "Explore exams")
 *   2 brand block (logo lockup, tagline, contact e-mail ONLY when configured) · 3 library line (configured path only)
 *   4 four columns in <nav aria-label="Footer"> — only live routes are links; not-ready items muted, never links
 *   5 trust line (Razorpay only while payments are on) + the not-affiliated line · 6 configured socials only
 *   7 EN | हिंदी only on / and /hi (THE header switch)
 * No JavaScript needed: real <a> links, CSS layout (app/footer.css). cl-* tokens only; no emoji (SVG line icons).
 */
const LOGO = "/brand/courage-library-logo-suite/svg/logo-horizontal.svg";
const LOGO_RATIO = 694.36 / 148;

export interface PublicFooterProps {
  t: FooterCopy;
  categories: FooterCategory[] | Promise<FooterCategory[]>;
  /**
   * null = no band. `open` is a VALUE, never a promise (owner, FOOTER-1 R-6 follow-up): the band never waits on a DB /
   * auth / settings read. The cached public pages pass the sign-up state they already resolved before rendering (ISR,
   * no request-time read); per-request pages pass false → "Explore exams" (the safe default). A signed-in visitor's band
   * is hidden by CSS only (the pre-paint data-auth hint) — authHint.
   */
  band: { open: boolean; authHint: boolean } | null;
  /** THE header switch labels — only on / and /hi */
  langSwitch: NavLabels | null;
  paymentsEnabled: boolean;
  year?: number;
}

export function PublicFooter({ t, categories, band, langSwitch, paymentsEnabled, year = new Date().getFullYear() }: PublicFooterProps) {
  const email = footerEmail();
  const library = footerLibraryPath();
  const socials = footerSocials();
  return (
    <>
      {band && (
        <aside className={band.authHint ? "cl-ft-band auth-out" : "cl-ft-band"} aria-labelledby="cl-ft-band-h" data-footer-band="">
          <div className="cl-ft-band__in">
            <div>
              <h2 id="cl-ft-band-h" className="cl-ft-band__h">
                {t.bandTitle}
              </h2>
              <p className="cl-ft-band__p">{t.bandText}</p>
            </div>
            <Link className="cl-ft-band__cta" href={band.open ? FOOTER_ROUTES.signUp : FOOTER_ROUTES.exams} data-footer-start={band.open ? "signup" : "explore"}>
              {band.open ? t.startFree : t.exploreExams}
            </Link>
          </div>
        </aside>
      )}
      <footer className="cl-ft" lang={t.lang} data-footer="public">
        <div className="cl-ft__in">
          <div className="cl-ft__top">
            <div className="cl-ft__brand">
              <Link href={t.lang === "hi" ? "/hi" : "/"} className="cl-ft__logo" aria-label="Courage Library">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={LOGO} alt="" width={Math.round(LOGO_RATIO * 28)} height={28} loading="lazy" decoding="async" />
              </Link>
              <p className="cl-ft__tag" lang="en">
                {t.tagline}
              </p>
              {library && (
                <Link href={library} className="cl-ft__lib" data-footer-library="">
                  {t.library} <ChevronRight aria-hidden="true" className="cl-ft__ic" />
                </Link>
              )}
              {email && (
                <a href={`mailto:${email}`} className="cl-ft__mail" data-footer-email="">
                  <Mail aria-hidden="true" className="cl-ft__ic" /> {email}
                </a>
              )}
            </div>
            <nav aria-label={t.footerNav} className="cl-ft__cols" data-footer-nav="">
              <ColumnsSlot t={t} categories={categories} />
            </nav>
          </div>
          <div className="cl-ft__bot">
            {socials.length > 0 && (
              <ul className="cl-ft__soc" aria-label={t.socialNav} data-footer-social="">
                {socials.map((s) => (
                  <li key={s.key}>
                    <a href={s.href} target="_blank" rel="noopener noreferrer" aria-label={t.socialOn(s.label)} className="cl-ft__soc-a">
                      <SocialIcon network={s.key} />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {langSwitch && <LangSwitch t={langSwitch} className="cl-vh__lang cl-ft__lang" />}
            <div className="cl-ft__legal">
              <p data-footer-trust="">{trustLine(t, year, paymentsEnabled)}</p>
              <p className="cl-ft__aff" data-not-affiliated="">
                {t.notAffiliated}
              </p>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}

function Column({ c, soon }: { c: FooterColumn; soon: string }) {
  return (
    <div className="cl-ft__col" data-footer-col={c.key}>
      <h2 className="cl-ft__h">{c.heading}</h2>
      <ul>
        {c.items.map((it) =>
          it.href ? (
            <li key={`${c.key}-${it.label}`}>
              <Link href={it.href} className={it.more ? "cl-ft__a cl-ft__a--more" : "cl-ft__a"}>
                {it.label}
                {it.more && <ChevronRight aria-hidden="true" className="cl-ft__ic" />}
              </Link>
            </li>
          ) : (
            <li key={`${c.key}-${it.label}`}>
              <span className="cl-ft__a cl-ft__a--soon" data-footer-soon="">
                {it.label} · {soon}
              </span>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function Columns({ t, categories }: { t: FooterCopy; categories: FooterCategory[] }) {
  return (
    <>
      {footerColumns(t, categories).map((c) => (
        <Column key={c.key} c={c} soon={t.soon} />
      ))}
    </>
  );
}

/** the Exams column streams when the live read is still running (the rest of the footer never waits) */
function ColumnsSlot({ t, categories }: { t: FooterCopy; categories: FooterCategory[] | Promise<FooterCategory[]> }) {
  if (!(categories instanceof Promise)) return <Columns t={t} categories={categories} />;
  return (
    <Suspense fallback={<Columns t={t} categories={[]} />}>
      <ResolvedColumns t={t} categories={categories} />
    </Suspense>
  );
}
async function ResolvedColumns({ t, categories }: { t: FooterCopy; categories: Promise<FooterCategory[]> }) {
  return <Columns t={t} categories={await categories.catch(() => [])} />;
}
