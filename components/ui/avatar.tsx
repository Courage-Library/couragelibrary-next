import { cn } from "./cn";

const SIZES = { sm: "size-8 text-caption", md: "size-10 text-body-sm", lg: "size-14 text-body-lg" };

export type AvatarProps = {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  /** True when the name is shown next to the avatar (the image is then hidden from screen readers). */
  decorative?: boolean;
  className?: string;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/** Photo, or initials on primary-100 (primary-800 text, 9.84:1). */
export function Avatar({ name, src, size = "md", decorative = false, className }: AvatarProps) {
  const base = cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full", SIZES[size], className);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatars come from arbitrary auth providers
      <img src={src} alt={decorative ? "" : name} className={cn(base, "object-cover")} />
    );
  }
  return (
    <span
      className={cn(base, "bg-primary-100 font-semibold text-primary-800")}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
    >
      {initials(name)}
    </span>
  );
}
