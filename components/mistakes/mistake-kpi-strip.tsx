import React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { AlertTriangle, RotateCcw, CheckCircle2, Flame, Layers } from "lucide-react";

interface MistakeKpiStripProps {
  activeMistakesCount: number;
  unresolvedCount: number;
  repeatedCount: number;
  revisitingCount: number;
  masteredCount: number;
  currentStatus?: string;
  isRepeated?: boolean;
}

export function MistakeKpiStrip({
  activeMistakesCount,
  unresolvedCount,
  repeatedCount,
  revisitingCount,
  masteredCount,
  currentStatus,
  isRepeated,
}: MistakeKpiStripProps) {
  const kpis = [
    {
      label: "Active Mistakes",
      value: activeMistakesCount,
      icon: Layers,
      color: "text-slate-900",
      iconColor: "text-blue-600",
      href: "/mistakes",
      isActive: (!currentStatus || currentStatus === "ALL") && !isRepeated,
    },
    {
      label: "Needs Revision",
      value: unresolvedCount,
      icon: AlertTriangle,
      color: "text-rose-600",
      iconColor: "text-rose-500",
      href: "/mistakes?status=UNRESOLVED",
      isActive: currentStatus === "UNRESOLVED" && !isRepeated,
    },
    {
      label: "Repeated Mistakes",
      value: repeatedCount,
      icon: RotateCcw,
      color: "text-amber-600",
      iconColor: "text-amber-500",
      href: "/mistakes?repeated=true",
      isActive: isRepeated === true,
    },
    {
      label: "Improving",
      value: revisitingCount,
      icon: Flame,
      color: "text-indigo-600",
      iconColor: "text-indigo-500",
      href: "/mistakes?status=REVISITING",
      isActive: currentStatus === "REVISITING" && !isRepeated,
    },
    {
      label: "Mastered",
      value: masteredCount,
      icon: CheckCircle2,
      color: "text-emerald-600",
      iconColor: "text-emerald-500",
      href: "/mistakes?status=MASTERED",
      isActive: currentStatus === "MASTERED" && !isRepeated,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <Link key={kpi.label} href={kpi.href} className="block group">
            <Card
              className={`p-4 bg-white border transition-all h-full ${
                kpi.isActive
                  ? "border-blue-500 ring-2 ring-blue-500/10 shadow-xs"
                  : "border-slate-200 hover:border-slate-300 hover:shadow-xs"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-semibold">{kpi.label}</span>
                <Icon className={`w-4 h-4 ${kpi.iconColor}`} />
              </div>
              <span className={`text-2xl font-black mt-1.5 block ${kpi.color}`}>
                {kpi.value}
              </span>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
