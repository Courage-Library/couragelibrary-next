import Link from "next/link";
import type { LandingCopy } from "@/content/landing-page/types";
import { LANDING_CATEGORIES, LANDING_CHIPS, LANDING_FACTS, LANDING_LIBRARY_FACTS, LANDING_ROUTES as R } from "@/content/landing-page/facts";
import { LandingIcon, SearchIcon, Tick, type LandingIconKey } from "./icons";
import { LoopDiagram } from "./loop-diagram";
import type { StartAction } from "@/lib/landing/landing-copy";

/**
 * LANDING-1 — the public landing page ("/" English, "/hi" Hindi). One server component, no client JavaScript:
 *   - the phone menu and the FAQ are native <details> (work without JavaScript)
 *   - the language switch is two plain links (EN → /, हिंदी → /hi) with aria-current
 *   - signed-in visitors see "Go to dashboard" through the existing pre-paint <html data-auth> hint
 *     (lib/ui/auth-hint.ts + the .auth-in / .auth-out rule in app/globals.css) — no session read on the server
 *   - the copy is RESOLVED before it gets here (lib/landing/landing-copy.ts): FAQ 1 names the live exams, the Hindi
 *     lines follow published Hindi content, and `start` is "Start free" → sign-up or, while sign-up is closed,
 *     "Explore exams" → /exams (UXFIX1 X-01)
 *   - BRAND-3 R4 exemption (owner round 3): the landing header carries the spec's SOLID "Start free"; other headers keep R4
 *   - UXFIX1 X-05 exemption (owner round 3): on phones the bar is logo + language switch + menu; "Sign in" is the FIRST
 *     menu item and the start action the second
 *   - category cards and chips are data-driven (owner L3): a category with ≥ 1 live exam is a link, otherwise a muted
 *     "Coming soon" card that is not a link; a chip shows only for a live exam
 * Copy: content/landing-page/{en,hi}.ts · facts: content/landing-page/facts.ts · styles: app/(landing)/landing.css.
 */

export type CategoryState = Record<string, boolean>; // category slug → has ≥ 1 live exam

const LOGO = "/brand/courage-library-logo-suite/svg/logo-horizontal.svg";
const LOGO_REVERSED = "/brand/courage-library-logo-suite/svg/logo-horizontal-reversed.svg";
const LOGO_W = 694.36;
const LOGO_H = 148;

const STEP_ICONS: LandingIconKey[] = ["learn", "prac", "mock", "weak", "fix", "up"];
const PROMISE_ICONS: Array<{ k: LandingIconKey; tone: string }> = [
  { k: "shield", tone: "violet" },
  { k: "check", tone: "ocean" },
  { k: "refund", tone: "teal" },
  { k: "lang", tone: "blue" },
];

// A plain <img>: the logos are static SVG files of the final suite (no optimisation possible or needed), and next/image
// would add its client component to the page's JavaScript (BRAND2 P-07 budget on "/"). Width + height → no layout shift.
function Logo({ reversed = false, height }: { reversed?: boolean; height: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={reversed ? LOGO_REVERSED : LOGO}
      alt="Courage Library"
      width={Math.round((LOGO_W / LOGO_H) * height)}
      height={height}
      decoding="async"
      loading={reversed ? "lazy" : "eager"}
      fetchPriority={reversed ? "auto" : "high"}
      className="lp-logo"
    />
  );
}

function LangSwitch({ t }: { t: LandingCopy }) {
  return (
    <nav className="lp-lang" aria-label={t.langSwitch.label}>
      <a href={R.home.en} hrefLang="en" lang="en" aria-current={t.lang === "en" ? "page" : undefined}>
        {t.langSwitch.en}
      </a>
      <a href={R.home.hi} hrefLang="hi" lang="hi" aria-current={t.lang === "hi" ? "page" : undefined}>
        {t.langSwitch.hi}
      </a>
    </nav>
  );
}

function Header({ t, start }: { t: LandingCopy; start: StartAction }) {
  const nav = (
    <>
      <Link href={R.exams}>{t.nav.exams}</Link>
      <Link href={R.currentAffairs}>{t.nav.currentAffairs}</Link>
      <Link href={R.mockTests}>{t.nav.mockTests}</Link>
    </>
  );
  return (
    <header className="lp-hd" data-landing-section="header">
      <div className="lp-in lp-hd__in">
        <Link className="lp-lock" href={R.home[t.lang]} aria-label="Courage Library">
          <Logo height={30} />
        </Link>
        <nav className="lp-nav" aria-label={t.nav.label}>
          {nav}
        </nav>
        <span className="lp-sp" />
        <LangSwitch t={t} />
        <span className="auth-out lp-hd__auth">
          <Link className="lp-signin" href={R.signIn}>
            {t.signIn}
          </Link>
          <Link className="lp-pill lp-pill--pri lp-pill--sm" href={start.href} data-landing-start="header">
            {start.label}
          </Link>
        </span>
        <span className="auth-in lp-hd__auth">
          <Link className="lp-pill lp-pill--pri lp-pill--sm" href={R.dashboard}>
            {t.dashboard}
          </Link>
        </span>
        <details className="lp-menu">
          <summary className="lp-burger" aria-label={t.menu.open}>
            <i aria-hidden="true" />
          </summary>
          <div className="lp-menu__panel">
            <div className="auth-out lp-menu__ctas">
              <Link className="lp-pill lp-pill--ghost" href={R.signIn} data-menu-item="1">
                {t.signIn}
              </Link>
              <Link className="lp-pill lp-pill--pri" href={start.href} data-menu-item="2" data-landing-start="menu">
                {start.label}
              </Link>
            </div>
            <div className="auth-in lp-menu__ctas">
              <Link className="lp-pill lp-pill--pri" href={R.dashboard}>
                {t.dashboard}
              </Link>
            </div>
            <nav aria-label={t.nav.label} className="lp-menu__nav">
              {nav}
            </nav>
          </div>
        </details>
      </div>
    </header>
  );
}

function Hero({ t, start }: { t: LandingCopy; start: StartAction }) {
  return (
    <section className="lp-hero" aria-labelledby="lp-h1" data-landing-section="hero">
      <div className="lp-in">
        <span className="lp-badge">
          <i aria-hidden="true" />
          {t.hero.badge}
        </span>
        <h1 id="lp-h1" className="lp-h1">
          {t.hero.h1Before}
          <span className="lp-h1__strong">{t.hero.h1Strong}</span>
          {t.hero.h1After}
        </h1>
        <p className="lp-sub">{t.hero.sub}</p>
        <div className="lp-ctas">
          <Link className="lp-pill lp-pill--pri" href={start.href} data-landing-cta="start" data-landing-start="hero">
            {start.label}
          </Link>
          {start.href !== R.exams && (
            <Link className="lp-link" href={R.exams}>
              {t.hero.explore} <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>
        <p className="lp-tag">{t.hero.tagline}</p>
        <LoopDiagram labels={t.hero.loop} tagline={t.hero.tagline} alt={t.hero.loopAlt} />
      </div>
    </section>
  );
}

function Band({ t, liveExams }: { t: LandingCopy; liveExams: readonly string[] }) {
  const chips = LANDING_CHIPS.filter((c) => liveExams.includes(c.slug));
  return (
    <section className="lp-band" aria-labelledby="lp-band-h" data-landing-section="find-exam">
      <div className="lp-in">
        <h2 id="lp-band-h">{t.band.h2}</h2>
        <p>{t.band.text}</p>
        <Link className="lp-search" href={R.exams} aria-label={`${t.band.searchLabel}: ${t.band.search}`}>
          <span className="lp-search__ph">{t.band.search}</span>
          <span className="lp-search__btn" aria-hidden="true">
            <SearchIcon />
          </span>
        </Link>
        {chips.length > 0 && (
        <ul className="lp-chips" aria-label={t.band.chipsLabel}>
          {chips.map((c) => (
            <li key={c.href}>
              <Link href={c.href}>{c.label}</Link>
            </li>
          ))}
        </ul>
        )}
      </div>
    </section>
  );
}

function Exams({ t, live }: { t: LandingCopy; live: CategoryState }) {
  return (
    <section className="lp-sec" aria-labelledby="lp-exams-h" data-landing-section="choose-exam">
      <div className="lp-in">
        <h2 id="lp-exams-h">{t.exams.h2}</h2>
        <p className="lp-lead">{t.exams.lead}</p>
        <ul className="lp-exams">
          {LANDING_CATEGORIES.map((c) => {
            const isLive = live[c.slug] === true;
            const body = (
              <>
                <span className={`lp-exam__top lp-exam__top--${c.key}`}>
                  <LandingIcon k={c.icon} />
                </span>
                <span className="lp-exam__body">
                  <b>{c.name[t.lang]}</b>
                  <small>{c.examples[t.lang]}</small>
                  {!isLive && <span className="lp-exam__soon">{t.exams.comingSoon}</span>}
                </span>
              </>
            );
            return (
              <li key={c.key}>
                {isLive ? (
                  <Link className="lp-exam" href={R.examCategory(c.slug)} data-category={c.slug} data-live="true">
                    {body}
                  </Link>
                ) : (
                  <div className="lp-exam lp-exam--soon" data-category={c.slug} data-live="false">
                    {body}
                  </div>
                )}
              </li>
            );
          })}
          <li>
            <Link className="lp-exam lp-exam--all" href={R.exams} data-category="all">
              <span className="lp-exam__top lp-exam__top--all">
                <LandingIcon k="all" />
              </span>
              <span className="lp-exam__body">
                <b>{t.exams.allName}</b>
                <small>{t.exams.allText}</small>
              </span>
            </Link>
          </li>
        </ul>
      </div>
    </section>
  );
}

function Pain({ t }: { t: LandingCopy }) {
  return (
    <section className="lp-sec lp-sec--cloud" aria-labelledby="lp-pain-h" data-landing-section="pain">
      <div className="lp-in">
        <h2 id="lp-pain-h">{t.pain.h2}</h2>
        <p className="lp-lead">{t.pain.lead}</p>
        <ul className="lp-pains">
          {t.pain.items.map((p) => (
            <li key={p.quote} className="lp-pain">
              <q>{p.quote}</q>
              <p className="lp-pain__ans">
                <Tick />
                <span>{p.answer}</span>
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function How({ t }: { t: LandingCopy }) {
  return (
    <section className="lp-sec" aria-labelledby="lp-how-h" data-landing-section="how">
      <div className="lp-in">
        <h2 id="lp-how-h">{t.how.h2}</h2>
        <p className="lp-lead">{t.how.lead}</p>
        <ol className="lp-steps">
          {t.how.steps.map((s, i) => (
            <li key={s.title} className={i === 5 ? "lp-st lp-st--win" : "lp-st"}>
              <span className="lp-st__ic">
                <LandingIcon k={STEP_ICONS[i]} strokeWidth={2.1} />
              </span>
              <span className="lp-st__tx">
                <span className="lp-st__n" aria-hidden="true">{`0${i + 1}`}</span>
                <b>{s.title}</b>
                <span className="lp-st__p">{s.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Plans({ t, start }: { t: LandingCopy; start: StartAction }) {
  return (
    <section className="lp-sec lp-sec--cloud" aria-labelledby="lp-plans-h" data-landing-section="free-pro">
      <div className="lp-in">
        <h2 id="lp-plans-h">{t.plans.h2}</h2>
        <p className="lp-lead">{t.plans.lead}</p>
        <div className="lp-free">
          <div className="lp-fc lp-fc--main">
            <h3>
              {t.plans.free.title} <span className="lp-tagp">{t.plans.free.tag}</span>
            </h3>
            <p>{t.plans.free.sub}</p>
            <ul>
              {t.plans.free.list.map((l) => (
                <li key={l}>
                  <Tick />
                  <span>{l}</span>
                </li>
              ))}
            </ul>
            <Link className="lp-pill lp-pill--pri" href={start.href} data-landing-start="plans">
              {start.label}
            </Link>
          </div>
          <div className="lp-fc lp-fc--pro">
            <h3>
              {t.plans.pro.title} <span className="lp-tagp lp-tagp--muted">{t.plans.pro.tag}</span>
            </h3>
            <p>{t.plans.pro.sub}</p>
            <ul>
              {t.plans.pro.list.map((l) => (
                <li key={l}>
                  <Tick muted />
                  <span>{l}</span>
                </li>
              ))}
            </ul>
            <p className="lp-note">{t.plans.pro.note}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Library({ t }: { t: LandingCopy }) {
  return (
    <section className="lp-lib" aria-labelledby="lp-lib-h" data-landing-section="library">
      <div className="lp-in lp-lib__in">
        <div>
          <p className="lp-eyebrow">{t.library.eyebrow}</p>
          <h2 id="lp-lib-h">{t.library.h2}</h2>
          <p>{t.library.text}</p>
          <ul className="lp-facts">
            {LANDING_LIBRARY_FACTS[t.lang].map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="lp-pin">
            <LandingIcon k="pin" size={18} />
            {LANDING_FACTS.city[t.lang]}
          </p>
        </div>
        <ul className="lp-photos" aria-label={t.library.photosLabel}>
          {t.library.photos.map((p, i) => (
            <li key={p} className={i === 0 ? "lp-ph lp-ph--big" : "lp-ph"}>
              <LandingIcon k="photo" strokeWidth={1.6} />
              <span>
                <b>{p}</b>
                <br />
                {t.library.photoNote}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Promises({ t }: { t: LandingCopy }) {
  return (
    <section className="lp-sec" aria-labelledby="lp-prom-h" data-landing-section="promises">
      <div className="lp-in">
        <h2 id="lp-prom-h">{t.promises.h2}</h2>
        <p className="lp-lead">{t.promises.lead}</p>
        <ul className="lp-proms">
          {t.promises.items.map((p, i) => (
            <li key={p.title} className="lp-pr">
              <span className={`lp-pr__ic lp-pr__ic--${PROMISE_ICONS[i].tone}`}>
                <LandingIcon k={PROMISE_ICONS[i].k} />
              </span>
              <b>{p.title}</b>
              <p>{p.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Faq({ t }: { t: LandingCopy }) {
  return (
    <section className="lp-sec lp-sec--cloud" aria-labelledby="lp-faq-h" data-landing-section="faq">
      <div className="lp-in">
        <h2 id="lp-faq-h">{t.faq.h2}</h2>
        <div className="lp-faq">
          {t.faq.items.map((f, i) => (
            <details key={f.q} open={i === 0}>
              <summary>
                {f.q}
                <i aria-hidden="true" />
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Final({ t, start }: { t: LandingCopy; start: StartAction }) {
  return (
    <section className="lp-final" aria-labelledby="lp-final-h" data-landing-section="final-cta">
      <div className="lp-in">
        <div className="lp-final__box">
          <h2 id="lp-final-h">{t.final.h2}</h2>
          <p>{t.final.text}</p>
          <Link className="lp-pill lp-pill--light" href={start.href} data-landing-start="final">
            {start.label} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer({ t }: { t: LandingCopy }) {
  const l = t.footer.links;
  const cols: Array<[string, Array<[string, string]>]> = [
    [t.footer.platform, [[l.exams, R.exams], [l.mockTests, R.mockTests], [l.currentAffairs, R.currentAffairs]]],
    [t.footer.company, [[l.about, R.about], [l.library, R.about], [l.contact, R.contact], [l.help, R.help]]],
    [t.footer.legal, [[l.terms, R.terms], [l.privacy, R.privacy], [l.refund, R.refund], [l.grievance, R.grievance]]],
  ];
  return (
    <footer className="lp-ft" data-landing-section="footer">
      <div className="lp-in">
        <div className="lp-ft__grid">
          <div className="lp-ft__brand">
            <Link className="lp-lock" href={R.home[t.lang]} aria-label="Courage Library">
              <Logo reversed height={28} />
            </Link>
            <p className="lp-ft__purpose">{t.footer.purpose}</p>
            <span className="lp-ft__tg">{t.hero.tagline}</span>
          </div>
          {cols.map(([h, links]) => (
            <nav key={h} aria-label={h}>
              <h2 className="lp-ft__h">{h}</h2>
              <ul>
                {links.map(([label, href]) => (
                  <li key={label}>
                    <Link href={href}>{label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="lp-ft__legal">
          <span>{`© ${LANDING_FACTS.copyrightYear} Courage Library · ${t.lang === "hi" ? LANDING_FACTS.city.hiShort : LANDING_FACTS.city.enShort}`}</span>
          <span>{t.footer.made}</span>
        </div>
      </div>
    </footer>
  );
}

export function LandingPageV1({ t, start, live, liveExams }: { t: LandingCopy; start: StartAction; live: CategoryState; liveExams: readonly string[] }) {
  return (
    <div className={t.lang === "hi" ? "lp lp--hi" : "lp"} lang={t.lang} data-landing="v1">
      <a href="#main-content" className="lp-skip">
        {t.skip}
      </a>
      <Header t={t} start={start} />
      <main id="main-content">
        <Hero t={t} start={start} />
        <Band t={t} liveExams={liveExams} />
        <Exams t={t} live={live} />
        <Pain t={t} />
        <How t={t} />
        <Plans t={t} start={start} />
        <Library t={t} />
        <Promises t={t} />
        <Faq t={t} />
        <Final t={t} start={start} />
      </main>
      <Footer t={t} />
    </div>
  );
}
