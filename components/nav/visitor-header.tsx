import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import type { NavLabels } from "@/content/nav/labels";
import { VISITOR_ROUTES, visitorLinks, type NavCategory, type NavLink, type StartLink } from "@/lib/nav/visitor-nav";
import { VisitorNavEnhancer } from "./visitor-nav-enhancer";

/**
 * NAV-1 Stage A — THE visitor header (docs/design/NAV_V1_SPEC.md §1), one component for every public page: the landing
 * ("/", "/hi"), the cached pages (/exams, category hubs) and every per-request public page and the auth pages.
 *
 * A server component: the whole header is HTML (no cookie, no request header — the cached pages stay ISR,
 * PERF-HOME-1). Without JavaScript everything works: "Exams" is a link to /exams, the phone menu is a native <details>,
 * the exam list inside it is a native <details>. One small client component (VisitorNavEnhancer) adds the Exams menu
 * (click / hover intent / keyboard), the drawer's focus trap + Esc + overlay close, and the active link.
 *
 * Owner exemptions recorded for this header (LANDING-1 round 3, extended to the shared header by NAV-1):
 *   - BRAND-3 R4: the header's "Start free" is the SOLID cl-blue pill (spec §1)
 *   - UXFIX1 X-05: on phones the bar is logo + start action + menu; "Sign in" is in the menu (before the start action)
 * Signed-in visitors: `auth="hint"` (cached pages) renders both link sets and the pre-paint <html data-auth> hint shows
 * one (lib/ui/auth-hint.ts); `auth="out"` (a per-request page that knows there is no session) renders the signed-out set.
 * Colours: cl-* tokens only (app/nav.css).
 */

const LOGO = "/brand/courage-library-logo-suite/svg/logo-horizontal.svg";
const LOGO_RATIO = 694.36 / 148;

function Chevron() {
  return (
    <svg className="cl-vh__chev" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function Logo() {
  // a plain <img>: a static SVG of the final suite (no next/image client code on the cached pages; BRAND2 P-07)
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="cl-vh__logo-img" src={LOGO} alt="Courage Library" width={Math.round(LOGO_RATIO * 30)} height={30} decoding="async" fetchPriority="high" />;
}

/** The start action, streamed when the sign-up setting is still being read (the closed view until it is known). */
function StartSlot({ start, closed, render }: { start: StartLink | Promise<StartLink>; closed: StartLink; render: (s: StartLink) => ReactNode }) {
  if (!(start instanceof Promise)) return <>{render(start)}</>;
  return (
    <Suspense fallback={render(closed)}>
      <ResolvedStart start={start} render={render} />
    </Suspense>
  );
}
async function ResolvedStart({ start, render }: { start: Promise<StartLink>; render: (s: StartLink) => ReactNode }) {
  return <>{render(await start)}</>;
}

function LangSwitch({ t, className }: { t: NavLabels; className: string }) {
  return (
    <nav className={className} aria-label={t.languageSwitch} data-lang-switch="">
      <Link href="/" hrefLang="en" lang="en" aria-current={t.lang === "en" ? "page" : undefined}>
        EN
      </Link>
      <Link href="/hi" hrefLang="hi" lang="hi" aria-current={t.lang === "hi" ? "page" : undefined}>
        हिंदी
      </Link>
    </nav>
  );
}

function CategoryTile({ c }: { c: NavCategory }) {
  const body = (
    <>
      <span className="cl-vh__swatch" style={{ background: c.swatch }} aria-hidden="true" />
      <span className="cl-vh__cat-tx">
        <b>{c.name}</b>
        <small>{c.status}</small>
      </span>
    </>
  );
  return c.href ? (
    <a className="cl-vh__cat" href={c.href} data-exams-item="">
      {body}
    </a>
  ) : (
    <span className="cl-vh__cat cl-vh__cat--soon" data-category-soon="">
      {body}
    </span>
  );
}

export interface VisitorHeaderProps {
  t: NavLabels;
  /** the logo's target: "/" (or "/hi" on the Hindi landing) */
  homeHref: "/" | "/hi";
  /** the EN | हिंदी switch — the landing only (spec §0) */
  langSwitch: boolean;
  categories: NavCategory[];
  start: StartLink | Promise<StartLink>;
  /** "hint": both link sets, CSS shows one (cached pages); "out": the signed-out set only */
  auth: "hint" | "out";
  /** the current section when the server knows the path (per-request pages); the cached pages set it in the browser */
  active?: "exams" | NavLink["key"] | null;
  /** the current path when the server knows it — an action pointing to this page says so (UX-IMP-1 I-8) */
  pathname?: string | null;
}

export function VisitorHeader({ t, homeHref, langSwitch, categories, start, auth, active = null, pathname = null }: VisitorHeaderProps) {
  // UX-IMP-1 (IMPECCABLE-1 A-10): an action that points to the page you are on says so (aria-current + active style);
  // on the cached pages the enhancer sets it in the browser ([data-nav-action])
  const here = (href: string): "page" | undefined => (pathname === (href.split(/[?#]/)[0] || "/") ? "page" : undefined);
  const links = visitorLinks(t);
  const closed: StartLink = { href: VISITOR_ROUTES.exams, label: t.exploreExams };
  const cur = (k: string): "page" | undefined => (active === k ? "page" : undefined);
  const out = auth === "hint" ? "auth-out " : "";

  return (
    <header className="cl-vh" lang={t.lang} data-visitor-header="">
      <div className="cl-vh__in">
        <Link className="cl-vh__logo" href={homeHref} aria-label="Courage Library">
          <Logo />
        </Link>

        <nav className="cl-vh__nav" aria-label={t.mainNav}>
          <div className="cl-vh__exams" data-exams-menu="">
            <a className="cl-vh__link" href={VISITOR_ROUTES.exams} data-nav-key="exams" data-exams-trigger="" aria-controls="cl-vh-exams" aria-expanded="false" aria-current={cur("exams")}>
              {t.exams}
              <Chevron />
            </a>
            <div className="cl-vh__mega" id="cl-vh-exams" role="region" aria-label={t.examsMenu} data-exams-panel="" hidden>
              <p className="cl-vh__mega-h">{t.chooseExam}</p>
              <ul className="cl-vh__grid">
                {categories.map((c) => (
                  <li key={c.slug}>
                    <CategoryTile c={c} />
                  </li>
                ))}
              </ul>
              <a className="cl-vh__all" href={VISITOR_ROUTES.exams} data-exams-item="">
                {t.allExams}
              </a>
            </div>
          </div>
          {links.map((l) => (
            <Link key={l.key} className="cl-vh__link" href={l.href} data-nav-key={l.key} aria-current={cur(l.key)}>
              {l.label}
            </Link>
          ))}
        </nav>

        <span className="cl-vh__sp" />
        {langSwitch && <LangSwitch t={t} className="cl-vh__lang cl-vh__lang--bar" />}

        {/* desktop actions */}
        <span className={`${out}cl-vh__auth`}>
          <Link className="cl-vh__signin" href={VISITOR_ROUTES.signIn} aria-current={here(VISITOR_ROUTES.signIn)} data-nav-action="">
            {t.signIn}
          </Link>
          <StartSlot
            start={start}
            closed={closed}
            render={(s) => (
              <Link className="cl-vh__pill" href={s.href} aria-current={here(s.href)} data-nav-action="" data-start="header">
                {s.label}
              </Link>
            )}
          />
        </span>
        {auth === "hint" && (
          <span className="auth-in cl-vh__auth">
            <Link className="cl-vh__pill" href={VISITOR_ROUTES.dashboard} aria-current={here(VISITOR_ROUTES.dashboard)} data-nav-action="" data-dashboard="header">
              {t.goToDashboard}
            </Link>
          </span>
        )}

        {/* phone: the compact action + the menu */}
        <span className={`${out}cl-vh__compact`}>
          <StartSlot
            start={start}
            closed={closed}
            render={(s) => (
              <Link className="cl-vh__pill cl-vh__pill--sm" href={s.href} aria-current={here(s.href)} data-nav-action="" data-start="compact">
                {s.label}
              </Link>
            )}
          />
        </span>
        {auth === "hint" && (
          <span className="auth-in cl-vh__compact">
            <Link className="cl-vh__pill cl-vh__pill--sm" href={VISITOR_ROUTES.dashboard} aria-current={here(VISITOR_ROUTES.dashboard)} data-nav-action="" data-dashboard="compact">
              {t.goToDashboard}
            </Link>
          </span>
        )}

        <details className="cl-vh__drawer" data-nav-drawer="">
          <summary className="cl-vh__burger" aria-label={t.menu} data-close-label={t.closeMenu} data-drawer-toggle="">
            <svg className="cl-vh__ic cl-vh__ic--menu" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            <svg className="cl-vh__ic cl-vh__ic--close" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </summary>
          <div className="cl-vh__backdrop" data-drawer-backdrop="" aria-hidden="true" />
          <div className="cl-vh__panel" role="dialog" aria-label={t.menu} data-drawer-panel="">
            <p className="cl-vh__panel-h">{t.menu}</p>
            <nav aria-label={t.menu} className="cl-vh__panel-nav">
              <details className="cl-vh__acc">
                <summary className="cl-vh__item">
                  {t.exams}
                  <Chevron />
                </summary>
                <ul className="cl-vh__sub">
                  {categories.map((c) => (
                    <li key={c.slug}>
                      {c.href ? (
                        <a href={c.href}>
                          <i style={{ background: c.swatch }} aria-hidden="true" />
                          {c.name}
                        </a>
                      ) : (
                        <span data-category-soon="">
                          <i style={{ background: c.swatch }} aria-hidden="true" />
                          {c.name}
                          <small>{t.comingSoon}</small>
                        </span>
                      )}
                    </li>
                  ))}
                  <li>
                    <a className="cl-vh__sub-all" href={VISITOR_ROUTES.exams}>
                      {t.allExams}
                    </a>
                  </li>
                </ul>
              </details>
              {links.map((l) => (
                <Link key={l.key} className="cl-vh__item" href={l.href} aria-current={cur(l.key)}>
                  {l.label}
                </Link>
              ))}
            </nav>
            {langSwitch && <LangSwitch t={t} className="cl-vh__lang cl-vh__lang--menu" />}
            {/* UXFIX1 X-05 exemption: "Sign in" in the menu, before the start action */}
            <div className={`${out}cl-vh__ctas`}>
              <Link className="cl-vh__pill cl-vh__pill--ghost" href={VISITOR_ROUTES.signIn} aria-current={here(VISITOR_ROUTES.signIn)} data-nav-action="" data-menu-item="signin">
                {t.signIn}
              </Link>
              <StartSlot
                start={start}
                closed={closed}
                render={(s) => (
                  <Link className="cl-vh__pill" href={s.href} aria-current={here(s.href)} data-nav-action="" data-menu-item="start" data-start="menu">
                    {s.label}
                  </Link>
                )}
              />
            </div>
            {auth === "hint" && (
              <div className="auth-in cl-vh__ctas">
                <Link className="cl-vh__pill" href={VISITOR_ROUTES.dashboard} aria-current={here(VISITOR_ROUTES.dashboard)} data-nav-action="" data-menu-item="dashboard">
                  {t.goToDashboard}
                </Link>
              </div>
            )}
          </div>
        </details>
      </div>
      <VisitorNavEnhancer />
    </header>
  );
}
