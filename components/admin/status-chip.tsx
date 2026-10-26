import { cn } from "@/components/ui/cn";
import { CHIP_CLASSES, chipKind, chipLabel } from "@/lib/admin/status";

/** ADMIN-UX-1: the one admin status chip (≥ 12 px, text always present — never colour alone). */
export function StatusChip({ status, className }: { status: string | null | undefined; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-badge border px-2 py-0.5 text-caption font-semibold", CHIP_CLASSES[chipKind(status)], className)} data-status={chipKind(status)}>
      {chipLabel(status)}
    </span>
  );
}
