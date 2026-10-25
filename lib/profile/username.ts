/**
 * F8 (#80) — username rules (pure; unit-tested in scripts/test_f8_profile.cjs). The database is authoritative
 * (fn_set_username, migration 096, seeded from THESE lists — the gate checks they stay identical); this module only gives
 * instant feedback in the form.
 *   format     3–20 characters: lowercase letters, digits, underscore; starts with a letter; no "__"; no trailing "_"
 *   reserved   exact names that would impersonate the service or clash with routes
 *   profanity  blocked as a substring after folding digits / symbols that stand in for letters (0→o, 1→i, 3→e, 4→a,
 *              5→s, 7→t, @→a, $→s) and removing "_" — false positives are accepted for a username
 *   change     at most once every 30 days (the first choice is free)
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_CHANGE_DAYS = 30;
export const USERNAME_RX = /^[a-z][a-z0-9_]{2,19}$/;

export const RESERVED_USERNAMES = [
  "about", "account", "accounts", "admin", "administrator", "anonymous", "api", "articles", "auth", "billing", "ceo",
  "contact", "courage", "couragelibrary", "courage_library", "dashboard", "email", "exam", "exams", "founder",
  "grievance", "guest", "help", "helpdesk", "learn", "legal", "library", "login", "logout", "mail", "me", "mock", "mocks",
  "mod", "moderator", "null", "official", "owner", "payments", "practice", "privacy", "profile", "profiles", "register",
  "root", "security", "settings", "signin", "signup", "staff", "support", "system", "team", "terms", "test", "tests",
  "undefined", "user", "users", "www", "you",
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
  if (!USERNAME_RX.test(u) || u.includes("__") || u.endsWith("_")) return "INVALID_FORMAT";
  if ((RESERVED_USERNAMES as readonly string[]).includes(u)) return "NOT_ALLOWED";
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
  rules: `${USERNAME_MIN}–${USERNAME_MAX} characters: lowercase letters, numbers and underscores, starting with a letter.`,
  results: {
    SET: "Username saved.",
    UNCHANGED: "That is already your username.",
    INVALID_FORMAT: `Use ${USERNAME_MIN}–${USERNAME_MAX} characters: lowercase letters, numbers and single underscores, starting with a letter.`,
    NOT_ALLOWED: "This username is not allowed. Please choose another.",
    TAKEN: "This username is taken. Please choose another.",
    TOO_SOON: `You can change your username once every ${USERNAME_CHANGE_DAYS} days.`,
    NOT_SIGNED_IN: "Sign in to choose a username.",
    FAILED: "Could not save your username. Please try again.",
  } as Record<string, string>,
} as const;
