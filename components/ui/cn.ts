import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Class merger for design-system components. It teaches tailwind-merge the UX-1a token names, so
 * `text-body` (size) and `text-fg` (colour) are not treated as conflicting, and `rounded-card` /
 * `shadow-e2` override each other correctly.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["caption", "body-sm", "body", "body-lg", "h3", "h2", "h1", "display"],
      radius: ["badge", "control", "card", "sheet", "panel", "hero"],
      shadow: ["e1", "e2", "e3", "soft", "glass"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
