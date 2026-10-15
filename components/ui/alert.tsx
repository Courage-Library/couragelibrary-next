import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "./cn";

export type AlertTone = "info" | "success" | "warning" | "danger";

const TONES: Record<AlertTone, { box: string; icon: string; Icon: typeof Info; label: string }> = {
  info: { box: "border-info-200 bg-info-50 text-info-800", icon: "text-info-700", Icon: Info, label: "Information" },
  success: { box: "border-success-200 bg-success-50 text-success-800", icon: "text-success-700", Icon: CheckCircle2, label: "Success" },
  warning: { box: "border-warning-200 bg-warning-50 text-warning-800", icon: "text-warning-700", Icon: AlertTriangle, label: "Warning" },
  danger: { box: "border-danger-200 bg-danger-50 text-danger-800", icon: "text-danger-700", Icon: XCircle, label: "Error" },
};

export type AlertProps = Omit<ComponentProps<"div">, "title"> & {
  tone?: AlertTone;
  title?: ReactNode;
  /** One follow-up action (link or button). */
  action?: ReactNode;
  /**
   * Set when the notice appears in response to something the user did, so screen readers announce it
   * (danger → role="alert", others → role="status"). Static page notices leave it off.
   */
  live?: boolean;
};

/** Inline notice / alert. Tone is also given as hidden text, so meaning never depends on colour. */
export function Alert({ tone = "info", title, action, live = false, className, children, ...props }: AlertProps) {
  const t = TONES[tone];
  return (
    <div
      role={live ? (tone === "danger" ? "alert" : "status") : undefined}
      className={cn("flex gap-3 rounded-card border p-4 text-body-sm", t.box, className)}
      {...props}
    >
      <t.Icon aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", t.icon)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="sr-only">{t.label}: </span>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div>{children}</div>}
        {action && <div className="mt-1">{action}</div>}
      </div>
    </div>
  );
}
