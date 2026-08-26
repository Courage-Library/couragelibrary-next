import React, { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "info" | "success" | "warning" | "error";
}

const alertStyles = {
  info: "bg-blue-50/80 border-blue-200 text-blue-900",
  success: "bg-emerald-50/80 border-emerald-200 text-emerald-900",
  warning: "bg-amber-50/80 border-amber-200 text-amber-900",
  error: "bg-rose-50/80 border-rose-200 text-rose-900",
};

export function Alert({ className, variant = "info", children, ...props }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        "relative w-full rounded-2xl border p-4 text-sm leading-relaxed shadow-xs",
        alertStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function AlertTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h5 className={cn("mb-1 font-bold leading-none tracking-tight", className)} {...props}>
      {children}
    </h5>
  );
}

export function AlertDescription({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <div className={cn("text-xs opacity-90", className)} {...props}>
      {children}
    </div>
  );
}
