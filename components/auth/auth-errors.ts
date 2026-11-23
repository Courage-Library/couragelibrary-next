/**
 * AUTH-UX-1 (spec §3.7): where an error code from lib/auth/messages.ts is shown. Field errors sit under their field;
 * credentials and every other case are form-level (never "this email does not exist" — the codes reveal nothing);
 * the Turnstile codes become the "Quick security check" card; the consent code marks the consent box. Pure.
 */
export type ErrorSlot = "email" | "password" | "confirmPassword" | "consent" | "captcha" | "form";

export function errorSlot(code: string | null | undefined): ErrorSlot {
  switch (code) {
    case "invalid-email":
      return "email";
    case "weak-password":
      return "password";
    case "password-mismatch":
      return "confirmPassword";
    case "age-required":
      return "consent";
    case "captcha-required":
    case "captcha-failed":
      return "captcha";
    default:
      return "form";
  }
}
