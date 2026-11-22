import Link from "next/link";
import { FOOTER_EN } from "@/content/footer";
import { studentLinks } from "@/lib/site/footer-links";

/**
 * FOOTER-1 §3 — THE student footer: ONE slim line at the bottom of the content area (right of the sidebar on desktop;
 * in the page flow above the bottom nav on phones — the column's padding keeps it fully visible above the nav and any
 * page bar, e.g. the RESULT-UX-1 "Review N mistakes" bar: app/nav-student.css). Desktop: © · Help · Privacy · Terms ·
 * Refunds · Contact; phones: the same without Contact (wrapped). 44 px targets on phones. English (student pages).
 */
export function StudentFooter({ year = new Date().getFullYear() }: { year?: number }) {
  const t = FOOTER_EN;
  return (
    <footer className="cl-sf" data-footer="student">
      <p className="cl-sf__c">© {year} Courage Library</p>
      <nav aria-label={t.studentNav} className="cl-sf__nav">
        <ul>
          {studentLinks(t).map((l) => (
            <li key={l.href} className={l.desktopOnly ? "cl-sf__desk" : undefined}>
              <Link href={l.href!} className="cl-sf__a">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
