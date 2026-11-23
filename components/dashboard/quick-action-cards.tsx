import Link from "next/link";
import { Swords } from "lucide-react";
import { Card } from "@/components/ui/legacy/card";
import { BrandIcon } from "@/components/icons/brand-icon";
import { MEMORY_LOCK } from "@/content/memory-lock";

/**
 * The dashboard's quick-action cards — moved out of app/(site)/dashboard/page.tsx unchanged (BRAND-ICONS-1) so the
 * local fixture (dev/brand-icons-fixture, EXAM_UX_FIXTURE builds only) renders the REAL cards. Spec §3: the four feature
 * cards show the brand icon (active style, 26 px, cl-blue-tint tile); the "Coming soon" Memory Lock card stays idle.
 * The flags are read by the page (unchanged behaviour): battles = isFeatureEnabled("BATTLES"), memoryLock =
 * isMemoryLockEnabled().
 */
export function QuickActionCards({
  mistakesCount,
  battles,
  memoryLock,
}: {
  mistakesCount: number;
  battles: boolean;
  memoryLock: boolean;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
      <Link href="/mock-tests" className="group">
        <Card className="p-4 hover:border-blue-300 hover:shadow-md transition-all h-full flex flex-col justify-between">
          <div className="w-10 h-10 rounded-xl bg-cl-blue-tint text-cl-blue-text flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <BrandIcon name="mocks" size={26} active />
          </div>
          <div>
            <h4 className="font-bold text-sm text-slate-900">Take Mock Test</h4>
            <p className="text-xs text-slate-500 mt-0.5">Timed mock tests</p>
          </div>
        </Card>
      </Link>
      <Link href="/practice" className="group">
        <Card className="p-4 hover:border-indigo-300 hover:shadow-md transition-all h-full flex flex-col justify-between">
          <div className="w-10 h-10 rounded-xl bg-cl-blue-tint text-cl-blue-text flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <BrandIcon name="practice" size={26} active />
          </div>
          <div>
            <h4 className="font-bold text-sm text-slate-900">
              Custom Practice
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Topic & difficulty filters
            </p>
          </div>
        </Card>
      </Link>
      <Link href="/mistakes" className="group">
        <Card className="p-4 hover:border-red-300 hover:shadow-md transition-all h-full flex flex-col justify-between">
          <div className="w-10 h-10 rounded-xl bg-cl-blue-tint text-cl-blue-text flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <BrandIcon name="mistake-vault" size={26} active />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-slate-900">
                Mistake Vault
              </h4>
              {mistakesCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-red-100 text-red-700 text-[10px] font-bold">
                  {mistakesCount}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Remediation drills</p>
          </div>
        </Card>
      </Link>
      {/* Memory Lock (F5): ONE real link to /memory-lock when MEMORY_LOCK_ENABLED (migration 095 applied); until then a
              plain, non-interactive card — no link, no dead link; the visible "Coming soon" says it is not available yet */}
      {memoryLock ? (
        <Link
          href="/memory-lock"
          className="group"
          data-memory-lock-card=""
          data-memory-lock-live=""
        >
          <Card className="p-4 h-full flex flex-col justify-between hover:border-primary-300 hover:shadow-md transition-all">
            <div className="w-10 h-10 rounded-xl bg-cl-blue-tint text-cl-blue-text flex items-center justify-center mb-3">
              <BrandIcon name="memory-lock" size={26} active />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-900">
                {MEMORY_LOCK.name}
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                {MEMORY_LOCK.tagline}
              </p>
            </div>
          </Card>
        </Link>
      ) : (
        <div data-memory-lock-card="">
          <Card className="p-4 h-full flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center">
                <BrandIcon name="memory-lock" size={26} />
              </div>
              <span className="px-1.5 py-0.5 rounded-md border border-primary-200 bg-primary-50 text-primary-800 text-caption font-medium">
                {MEMORY_LOCK.comingSoon}
              </span>
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-900">
                {MEMORY_LOCK.name}
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                {MEMORY_LOCK.tagline}
              </p>
            </div>
          </Card>
        </div>
      )}
      {battles && (
        <Link href="/battles" className="group">
          <Card className="p-4 hover:border-accent-300 hover:shadow-md transition-all h-full flex flex-col justify-between">
            <div className="w-10 h-10 rounded-xl bg-accent-50 text-accent-700 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Swords className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-900">
                1v1 Quiz Battle
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Live multiplayer challenge
              </p>
            </div>
          </Card>
        </Link>
      )}
    </div>
  );
}
