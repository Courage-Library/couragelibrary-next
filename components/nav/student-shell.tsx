import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { logoutAction } from "@/app/(site)/auth/actions";
import type { NavLabels } from "@/content/nav/labels";
import { accountLinks, activeStudentKey, bottomItems, initials, studentItems, studentTitle, STUDENT_HOME, type AccountView, type StudentFlags, type StudentItem } from "@/lib/nav/student-nav";
import { ChevronLeft, CircleHelp, Languages, LogOut } from "lucide-react";
import { BrandIcon } from "@/components/icons/brand-icon";
import { Icon } from "@/components/icons/icon";
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
 * BRAND-ICONS-1: the nav meanings are THE brand icons (active style on the aria-current item only), the centre button is
 * todays-mock on blue; help / collapse / language / sign out are Lucide utility icons via <Icon>.
 */

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
        <BrandIcon name={it.icon} size={20} active="current" />
        <span className="cl-ss__lbl">{it.label}</span>
        {it.key === "mistakeVault" && <ProChip paywall={paywall} />}
      </Link>
    </li>
  );
}

function BarItem({ it, current }: { it: StudentItem; current: boolean }) {
  return (
    <Link className="cl-ss__tab" href={it.href} aria-current={current ? "page" : undefined} data-student-key={it.key}>
      <BrandIcon name={it.icon} size={22} active="current" />
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
            <Icon icon={CircleHelp} className="cl-ss__ic" />
            <span className="cl-ss__lbl">{t.help}</span>
          </Link>
          <button type="button" className="cl-ss__it cl-ss__toggle" data-sidebar-toggle="" data-label-collapse={t.collapse} data-label-expand={t.expand} aria-label={t.collapse} title={t.collapse}>
            <Icon icon={ChevronLeft} className="cl-ss__ic" />
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
                  <Icon icon={Languages} size={18} className="cl-ss__ic cl-ss__ic--sm" />
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
                  <Icon icon={LogOut} size={18} className="cl-ss__ic cl-ss__ic--sm" />
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
            <BrandIcon name="todays-mock" size={22} onBlue />
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
