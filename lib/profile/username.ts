/**
 * F8 (#80) + USERNAME-1 (owner ruling 2026-11-02) — username rules (pure; unit-tested in scripts/test_f8_profile.cjs and
 * scripts/test_username1.cjs). The database is authoritative (fn_set_username, migrations 096 + 134, seeded from THESE
 * lists — the gates check they stay identical); this module only gives instant feedback in the form.
 *   format     3–20 characters: lowercase letters, digits, "_" and "."; starts with a letter; no two separators in a
 *              row; does not end with a separator. Unique case-insensitively (stored lower-case).
 *   reserved   names that would impersonate the service or clash with routes — also matched with "." / "_" swapped
 *              or removed ("courage.library")
 *   phone / e-mail  8+ digits, a mail provider name or a domain ending are refused (never a contact detail in public)
 *   profanity  blocked as a substring after folding digits / symbols that stand in for letters (0→o, 1→i, 3→e, 4→a,
 *              5→s, 7→t, @→a, $→s) and removing "_" — false positives are accepted for a username
 *   change     at most once every 30 days (the first choice is free)
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_CHANGE_DAYS = 30;
export const USERNAME_RX = /^[a-z][a-z0-9_.]{2,19}$/;
/** the automatic username every account gets (migration 134): "aspirant_" + 6 digits */
export const AUTO_USERNAME_RX = /^aspirant_\d{6,7}$/;

export const RESERVED_USERNAMES = [
  "about", "account", "accounts", "admin", "administrator", "anonymous", "api", "articles", "auth", "billing", "ceo",
  "aspirant", "contact", "courage", "couragelibrary", "courage_library", "dashboard", "email", "exam", "exams", "founder",
  "grievance", "guest", "help", "helpdesk", "ibps", "learn", "legal", "library", "login", "logout", "mail", "me", "mock", "mocks",
  "mod", "moderator", "null", "official", "owner", "payments", "police", "practice", "privacy", "profile", "profiles",
  "register", "root", "rrb", "security", "settings", "signin", "signup", "ssc", "staff", "support", "system", "team",
  "terms", "test", "tests", "undefined", "upsc", "user", "users", "www", "you",
] as const;

export const PROFANITY_TERMS = [
  "asshole", "bastard", "behenchod", "bhosdi", "bitch", "chutiya", "cunt", "dick", "fuck", "gandu", "harami", "lund",
  "madarchod", "porn", "pussy", "randi", "shit", "slut", "whore",
] as const;

const FOLD: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

/** Lower-case, trimmed; the stored form. */
export function normalizeUsername(input: string): string {
  return String(input ?? "").trim().toLowerCase();
}

/** Folded form used only for the profanity check. */
export function foldForProfanity(u: string): string {
  return normalizeUsername(u)
    .split("")
    .map((c) => FOLD[c] ?? c)
    .join("")
    .replace(/[^a-z]/g, "");
}

export type UsernameCheck = "OK" | "INVALID_FORMAT" | "NOT_ALLOWED";

export function checkUsername(input: string): UsernameCheck {
  const u = normalizeUsername(input);
  if (!USERNAME_RX.test(u) || /[_.][_.]/.test(u) || /[_.]$/.test(u)) return "INVALID_FORMAT";
  const plain = u.replace(/[_.]/g, "");
  if ((RESERVED_USERNAMES as readonly string[]).some((t) => t === u || t === u.replace(/\./g, "_") || t.replace(/_/g, "") === plain)) return "NOT_ALLOWED";
  if (u.replace(/[^0-9]/g, "").length >= 8) return "NOT_ALLOWED"; // phone-like
  if (/(gmail|yahoo|outlook|hotmail|rediffmail|icloud|protonmail)/.test(u) || /[.](com|in|net|org|co|edu|gov|io)$/.test(u)) return "NOT_ALLOWED"; // e-mail-like
  const folded = foldForProfanity(u);
  if (PROFANITY_TERMS.some((t) => folded.includes(t))) return "NOT_ALLOWED";
  return "OK";
}

/** The next day a username may change again (null = it may change now). */
export function nextChangeAllowedAt(changedAt: string | null, now: Date = new Date()): Date | null {
  if (!changedAt) return null;
  const next = new Date(new Date(changedAt).getTime() + USERNAME_CHANGE_DAYS * 86_400_000);
  return next.getTime() > now.getTime() ? next : null;
}

export const USERNAME_COPY = {
  rules: `${USERNAME_MIN}–${USERNAME_MAX} characters: lowercase letters, numbers, "_" and ".", starting with a letter. Others see only your username — never your name, e-mail or phone. You can change it once every ${USERNAME_CHANGE_DAYS} days.`,
  results: {
    SET: "Username saved.",
    UNCHANGED: "That is already your username.",
    INVALID_FORMAT: `Use ${USERNAME_MIN}–${USERNAME_MAX} characters: lowercase letters, numbers, "_" or "." (not two in a row, not at the end), starting with a letter.`,
    NOT_ALLOWED: "This username is not allowed (reserved words, phone numbers and e-mail addresses cannot be used). Please choose another.",
    TAKEN: "This username is not available. Please choose another.",
    TOO_SOON: `You can change your username once every ${USERNAME_CHANGE_DAYS} days.`,
    NOT_SIGNED_IN: "Sign in to choose a username.",
    FAILED: "Could not save your username. Please try again.",
  } as Record<string, string>,
  /** USERNAME-1: the availability check answers yes / no only */
  availability: {
    AVAILABLE: "Available.",
    NOT_AVAILABLE: "Not available. Please choose another.",
    INVALID_FORMAT: "Use 3–20 characters: lowercase letters, numbers, \"_\" or \".\", starting with a letter.",
    NOT_ALLOWED: "This username is not allowed. Please choose another.",
    RATE_LIMITED: "Too many checks. Please wait a minute.",
    NOT_SIGNED_IN: "Sign in to check a username.",
    FAILED: "Could not check right now. Please try again.",
  } as Record<string, string>,
} as const;
