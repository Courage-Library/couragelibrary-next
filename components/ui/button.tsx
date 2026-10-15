import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { cn } from "./cn";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-primary-600 text-fg-inverse hover:bg-primary-700 active:bg-primary-800 disabled:bg-ink-200 disabled:text-ink-600 aria-disabled:bg-ink-200 aria-disabled:text-ink-600",
  secondary:
    "border border-line-control bg-surface text-fg hover:bg-ink-50 active:bg-ink-100 disabled:border-ink-300 disabled:text-ink-600 aria-disabled:border-ink-300 aria-disabled:text-ink-600",
  ghost:
    "text-primary-700 hover:bg-primary-50 active:bg-primary-100 disabled:text-ink-600 aria-disabled:text-ink-600",
  danger:
    "bg-danger-600 text-fg-inverse hover:bg-danger-700 active:bg-danger-800 disabled:bg-ink-200 disabled:text-ink-600 aria-disabled:bg-ink-200 aria-disabled:text-ink-600",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-body-sm",
  md: "h-11 px-4 text-body",
  lg: "h-13 px-6 text-body-lg",
};

const ICON_ONLY: Record<ButtonSize, string> = { sm: "w-9 px-0", md: "w-11 px-0", lg: "w-13 px-0" };

export function buttonClasses({
  variant = "primary",
  size = "md",
  iconOnly = false,
  fullWidth = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  fullWidth?: boolean;
  className?: string;
} = {}) {
  return cn(
    "focus-ring relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium",
    "transition-colors duration-120 ease-standard disabled:cursor-not-allowed aria-disabled:cursor-not-allowed",
    VARIANTS[variant],
    SIZES[size],
    iconOnly && ICON_ONLY[size],
    fullWidth && "w-full",
    className,
  );
}

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Square button; requires `aria-label`. */
  iconOnly?: boolean;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

export type ButtonProps = ComponentProps<"button"> &
  CommonProps & {
    /** Shows a spinner, keeps the width, sets aria-busy and blocks clicks. */
    loading?: boolean;
  };

/**
 * Native `<button>`. Variants primary | secondary | ghost | danger; sizes sm 36 · md 44 · lg 52 px.
 * Disabled uses the `disabled` attribute. While loading the label stays in the accessibility tree.
 */
export function Button({
  variant,
  size,
  iconOnly,
  fullWidth,
  leadingIcon,
  trailingIcon,
  loading = false,
  disabled,
  type = "button",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, iconOnly, fullWidth, className })}
      {...props}
    >
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </span>
      )}
      <span className={cn("inline-flex items-center gap-2", loading && "opacity-0")}>
        {leadingIcon}
        {children}
        {trailingIcon}
      </span>
    </button>
  );
}

export type ButtonLinkProps = ComponentProps<typeof Link> & CommonProps;

/** A link styled as a button (navigation, not an action). */
export function ButtonLink({
  variant,
  size,
  iconOnly,
  fullWidth,
  leadingIcon,
  trailingIcon,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={buttonClasses({ variant, size, iconOnly, fullWidth, className })} {...props}>
      {leadingIcon}
      {children}
      {trailingIcon}
    </Link>
  );
}
