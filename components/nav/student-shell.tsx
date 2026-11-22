import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { logoutAction } from "@/app/(site)/auth/actions";
import type { NavLabels } from "@/content/nav/labels";
import { accountLinks, activeStudentKey, bottomItems, initials, studentItems, studentTitle, STUDENT_HOME, type AccountView, type StudentFlags, type StudentIcon, type StudentItem } from "@/lib/nav/student-nav";
import { StudentNavEnhancer } from "./student-nav-enhancer";
import { CoinBalance } from "./coin-balance";

/**
 * NAV-1 Stage B — THE student shell (docs/design/NAV_V1_SPEC.md §2, owner-approved 23 Nov 2026) for every per-request
 * page of a signed-in user: a left sidebar ≥ 1024 px (240 / 72 px, collapse remembered client-side and applied before the
 * first paint — lib/ui/nav-prefs.ts), a top bar with the avatar menu, and < 1024 px a top bar + a bottom tab bar with the
 * centre "Today's mock" button and an avatar sheet. Exam attempts never get it (exam focus — AppShell).
 * A server component: all markup is HTML (links work without JavaScript; the avatar menu / sheet is a native <details>);
 * StudentNavEnhancer adds the collapse toggle, focus handling, the active item after client navigation and the language
 * preference. It shows only the signed-in user's own name (from the session the shell already read). Sign out = the
 * existing sign-out form (logoutAction), unchanged. Colours: cl-* tokens only (app/nav.css).
 */

const ICONS: Record<StudentIcon | "help" | "collapse" | "play" | "lang" | "out" | "user", string> = {
  home: "M4 11 12 4l8 7v9h-5v-6H9v6H4z",
  book: "M4 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4zM20 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z",
  clock: "M12 5a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 9v4l3 2M10 3h4",
  news: "M6 5h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM8 9h8M8 13h8M8 17h5",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  vault: "M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM12 9.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4 9h2",
  learn: "M3 9 12 4l9 5-9 5zM7 11v5c1.5 1.5 3 2 5 2s3.5-.5 5-2v-5",
  help: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.3M12 17h.01",
  collapse: "M15 6l-6 6 6 6",
  play: "M8 5v14l11-7z",
  lang: "M4 6h12M10 4v2M6.5 6c.8 4 3.5 7 7.5 8.5M13.5 6C12.5 10 9.5 13 5 15M14 20l4-9 4 9M15.3 17h5.4",
  out: "M10 4H5v16h5M15 8l4 4-4 4M19 12H9",
  user: "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 20a8 8 0 0 1 16 0",
};

function Icon({ k, className = "cl-ss__ic" }: { k: keyof typeof ICONS; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={ICONS[k]} />
    </svg>
  );
}

function Brand({ variant }: { variant: "side" | "phone" }) {
  // static SVGs of the final logo suite (never recoloured): the lock-up expanded / on phones, the mark when collapsed
  return (
    <Link className={`cl-ss__brand cl-ss__brand--${variant}`} href={STUDENT_HOME} aria-label="Courage Library">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="cl-ss__lockup" src="/brand/courage-library-logo-suite/svg/logo-horizontal.svg" alt="" width={variant === "phone" ? 122 : 132} height={variant === "phone" ? 26 : 28} decoding="async" />
      {variant === "side" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="cl-ss__mark" src="/brand/courage-library-logo-suite/svg/mark.svg" alt="" width={28} height={28} decoding="async" />
      )}
    </Link>
  );
}

function ProChip({ paywall }: { paywall: Promise<boolean> }) {
  return (
    <Suspense fallback={null}>
      <ResolvedProChip paywall={paywall} />
    </Suspense>
  );
}
async function ResolvedProChip({ paywall }: { paywall: Promise<boolean> }) {
  return (await paywall) ? <span className="cl-ss__pro" data-pro-chip="">PRO</span> : null;
}

function SideItem({ it, current, paywall }: { it: StudentItem; current: boolean; paywall: Promise<boolean> }) {
  return (
    <li>
      <Link className="cl-ss__it" href={it.href} aria-current={current ? "page" : undefined} data-student-key={it.key} title={it.label}>
        <Icon k={it.icon} />
        <span className="cl-ss__lbl">{it.label}</span>
        {it.key === "mistakeVault" && <ProChip paywall={paywall} />}
      </Link>
    </li>
  );
}

function BarItem({ it, current }: { it: StudentItem; current: boolean }) {
  return (
    <Link className="cl-ss__tab" href={it.href} aria-current={current ? "page" : undefined} data-student-key={it.key}>
      <Icon k={it.icon} />
      <span>{it.label}</span>
    </Link>
  );
}

export interface StudentShellProps {
  t: NavLabels;
  account: AccountView;
  /** practice / payments are server flags (known); the paywall switch streams (bounded, never rejects) */
  flags: Omit<StudentFlags, "paywall">;
  paywall: Promise<boolean>;
  pathname: string;
  /** COURSE-UX-1 (owner: kept, flag-gated): the coin balance in the top bar while lesson coins are on */
  lessonCoins: boolean;
  studyPreferencesLabel: string;
  footer: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
}

export function StudentShell({ t, account, flags, paywall, pathname, lessonCoins, studyPreferencesLabel, footer, banner, children }: StudentShellProps) {
  // the PRO chip itself streams; the item list never depends on the switch (paywall false here = no layout change)
  const f: StudentFlags = { ...flags, paywall: false };
  const items = studentItems(t, f);
  const bar = bottomItems(t, f);
  const active = activeStudentKey(pathname);
  const title = studentTitle(t, pathname, f);
  const links = accountLinks(t, account, f, studyPreferencesLabel, false);
  const sheetOnly = accountLinks(t, account, f, studyPreferencesLabel, true).filter((l) => !links.some((x) => x.key === l.key));

  return (
    <div className="cl-ss" data-student-shell="">
      <aside className="cl-ss__side" aria-label={t.studentNav}>
        <Brand variant="side" />
        <nav className="cl-ss__nav" aria-label={t.studentNav}>
          <ul>
            {items.map((it) => (
              <SideItem key={it.key} it={it} current={active === it.key} paywall={paywall} />
            ))}
          </ul>
        </nav>
        <div className="cl-ss__foot">
          <Link className="cl-ss__it" href="/help" title={t.help} aria-current={pathname === "/help" ? "page" : undefined}>
            <Icon k="help" />
            <span className="cl-ss__lbl">{t.help}</span>
          </Link>
          <button type="button" className="cl-ss__it cl-ss__toggle" data-sidebar-toggle="" data-label-collapse={t.collapse} data-label-expand={t.expand} aria-label={t.collapse} title={t.collapse}>
            <Icon k="collapse" />
            <span className="cl-ss__lbl">{t.collapse}</span>
          </button>
        </div>
      </aside>

      <div className="cl-ss__col">
        <header className="cl-ss__top" data-student-top="">
          <Brand variant="phone" />
          {title ? (
            <p className="cl-ss__title" data-student-title="">
              {title}
            </p>
          ) : (
            <p className="cl-ss__title" data-student-title="" />
          )}
          <span className="cl-ss__sp" />
          <CoinBalance enabled={lessonCoins} />
          <details className="cl-ss__acct" data-account-menu="">
            <summary className="cl-ss__av" aria-label={`${t.account}: ${account.name}`} data-account-toggle="">
              <span aria-hidden="true">{initials(account.name)}</span>
            </summary>
            <div className="cl-ss__backdrop" data-account-backdrop="" aria-hidden="true" />
            <div className="cl-ss__menu" role="dialog" aria-label={t.account} data-account-panel="">
              <span className="cl-ss__grab" aria-hidden="true" />
              <div className="cl-ss__who">
                <span className="cl-ss__av cl-ss__av--sm" aria-hidden="true">
                  {initials(account.name)}
                </span>
                <b>{account.name}</b>
              </div>
              <ul className="cl-ss__links">
                {sheetOnly.map((l) => (
                  <li key={l.key} className="cl-ss__sheet-only">
                    <Link className="cl-ss__mi" href={l.href} data-account-item={l.key}>
                      {l.label}
                    </Link>
                  </li>
                ))}
                {links.map((l) => (
                  <li key={l.key}>
                    <Link className="cl-ss__mi" href={l.href} data-account-item={l.key}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="cl-ss__lang" data-student-lang="">
                <span className="cl-ss__lang-l">
                  <Icon k="lang" className="cl-ss__ic cl-ss__ic--sm" />
                  {t.language}
                </span>
                <span className="cl-ss__seg" role="group" aria-label={t.language}>
                  <button type="button" data-lang-choice="en" aria-pressed="true" lang="en">
                    EN
                  </button>
                  <button type="button" data-lang-choice="hi" aria-pressed="false" lang="hi">
                    हिंदी
                  </button>
                </span>
                <small className="cl-ss__note">{t.languageNote}</small>
              </div>
              {/* the existing sign-out flow, unchanged (app/(site)/auth/actions.ts) */}
              <form action={logoutAction} className="cl-ss__outf">
                <button type="submit" className="cl-ss__out" data-sign-out="">
                  <Icon k="out" className="cl-ss__ic cl-ss__ic--sm" />
                  {t.signOut}
                </button>
              </form>
            </div>
          </details>
        </header>
        {banner}
        <main id="main-content" tabIndex={-1} className="cl-ss__main">
          {children}
        </main>
        {footer}
      </div>

      <nav className="cl-ss__bar" aria-label={t.studentNav} data-student-bar="">
        {bar.left.map((it) => (
          <BarItem key={it.key} it={it} current={active === it.key} />
        ))}
        <Link className="cl-ss__fab" href={bar.centre.href} aria-label={bar.centre.aria} data-todays-mock="">
          <span className="cl-ss__fab-c">
            <Icon k="play" className="cl-ss__ic cl-ss__ic--fab" />
          </span>
          <span aria-hidden="true">{bar.centre.label}</span>
        </Link>
        {bar.right.map((it) => (
          <BarItem key={it.key} it={it} current={active === it.key} />
        ))}
      </nav>
      <StudentNavEnhancer />
    </div>
  );
}
