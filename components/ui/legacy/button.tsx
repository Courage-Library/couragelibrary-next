import React, { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import type { ComponentSize, ComponentVariant } from "@/types/ui";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ComponentVariant;
  size?: ComponentSize;
  isLoading?: boolean;
}

const variantStyles: Record<ComponentVariant, string> = {
  default: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm active:scale-[0.98]",
  primary: "bg-blue-700 text-white hover:bg-blue-800 shadow-md active:scale-[0.98]",
  secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200 active:scale-[0.98]",
  outline: "border border-slate-300 bg-transparent hover:bg-slate-50 text-slate-800",
  ghost: "hover:bg-slate-100 text-slate-700 hover:text-slate-900",
  destructive: "bg-red-600 text-white hover:bg-red-700 shadow-sm active:scale-[0.98]",
};

const sizeStyles: Record<ComponentSize, string> = {
  sm: "h-8 px-3 text-xs rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-xl gap-2",
  lg: "h-12 px-6 text-base rounded-xl gap-2.5",
  icon: "h-10 w-10 p-0 rounded-xl justify-center",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "md",
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none select-none cursor-pointer",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {isLoading && (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
