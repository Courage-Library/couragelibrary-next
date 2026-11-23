import { notFound } from "next/navigation";
import { StudentShell } from "@/components/nav/student-shell";
import { NoGlassZone } from "@/components/ui/no-glass-zone";
import { StudentFooter } from "@/components/footer/student-footer";
import { QuickActionCards } from "@/components/dashboard/quick-action-cards";
import { BrandIcon } from "@/components/icons/brand-icon";
import { BRAND_ICON_NAMES } from "@/lib/icons/brand-icon-data";
import { navLabels } from "@/content/nav/labels";

/**
 * BRAND-ICONS-1 test fixture: THE student shell on "/dashboard" (Home is the current nav item) with the REAL dashboard
 * quick-action cards (Memory Lock on and "Coming soon") and the 9 brand icons × idle / active / on blue — for the local
 * page checks and screenshots (scripts/live/test_brand_icons1_pages.cjs). Safety (no production data, ever):
 *   - a route only in a build made with EXAM_UX_FIXTURE=1 (next.config pageExtensions) — never in a deployed build;
 *     and a 404 on a production deployment anyway (defence in depth)
 *   - no session, no server read: a fake account ("Fixture Student"), no counts from the database
 */
export const dynamic = "force-dynamic";

export default function BrandIconsFixturePage() {
  if (process.env.VERCEL_ENV === "production" || process.env.EXAM_UX_FIXTURE !== "1") notFound();
  return (
    <StudentShell
      t={navLabels("en")}
      account={{ name: "Fixture Student", isStaff: false }}
      flags={{ practice: true, payments: false }}
      paywall={Promise.resolve(false)}
      pathname="/dashboard"
      lessonCoins={false}
      studyPreferencesLabel="Study preferences"
      footer={<StudentFooter />}
    >
      <NoGlassZone>
        <div className="mx-auto max-w-5xl space-y-8 p-4 md:p-8">
          <section data-fixture-cards="on" aria-label="Quick actions (Memory Lock on)">
            <QuickActionCards mistakesCount={3} battles={false} memoryLock />
          </section>
          <section data-fixture-cards="soon" aria-label="Quick actions (Memory Lock coming soon)">
            <QuickActionCards mistakesCount={0} battles={false} memoryLock={false} />
          </section>
          <section data-fixture-sheet="" aria-label="Brand icons">
            <table className="text-caption text-fg-secondary">
              <tbody>
                {(["idle", "active", "onBlue"] as const).map((v) => (
                  <tr key={v} className={v === "onBlue" ? "bg-cl-blue text-cl-white" : "text-cl-slate"}>
                    <th className="p-2 text-left font-medium">{v}</th>
                    {BRAND_ICON_NAMES.map((n) => (
                      <td key={n} className="p-2" title={n}>
                        <BrandIcon name={n} size={24} active={v === "active"} onBlue={v === "onBlue"} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </NoGlassZone>
    </StudentShell>
  );
}
