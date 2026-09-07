/**
 * Centralized Time and Duration Utilities for Courage Library Examination Engine.
 * Enforces Asia/Kolkata (IST, UTC+05:30) timezone for all candidate-facing displays.
 */

/**
 * Formats a Date object or ISO timestamp into India Standard Time (IST).
 * Example: "07 Sep 2026, 02:30 PM"
 */
export function formatIstDateTime(date: Date | string | null | undefined): string {
  if (!date) return "Date unavailable";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return "Invalid date";

    const datePart = d.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const timePart = d.toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    return `${datePart}, ${timePart.toUpperCase()}`;
  } catch {
    return "Date unavailable";
  }
}

/**
 * Returns ISO calendar date string (YYYY-MM-DD) in India Standard Time (Asia/Kolkata).
 */
export function getIstDateString(date: Date | string = new Date()): string {
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
  } catch {
    return "";
  }
}

/**
 * Formats a duration in seconds into a clean, human-readable string.
 * Examples:
 * - 0 -> "0s"
 * - 42 -> "42s"
 * - 118 -> "1m 58s"
 * - 3665 -> "1h 01m 05s"
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || isNaN(seconds) || seconds < 0) {
    return "Time unavailable";
  }

  const s = Math.floor(seconds);
  if (s === 0) return "0s";

  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const remainingSecs = s % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m ${remainingSecs.toString().padStart(2, "0")}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remainingSecs.toString().padStart(2, "0")}s`;
  }
  return `${remainingSecs}s`;
}

/**
 * Calculates authoritative wall-clock duration between exam start and submission timestamps.
 */
export function calculateExamDuration(
  startedAt: string | Date | null | undefined,
  submittedAt: string | Date | null | undefined
): number {
  if (!startedAt) return 0;
  const startMs = typeof startedAt === "string" ? new Date(startedAt).getTime() : startedAt.getTime();
  const submitMs = submittedAt
    ? typeof submittedAt === "string" ? new Date(submittedAt).getTime() : submittedAt.getTime()
    : Date.now();

  if (isNaN(startMs) || isNaN(submitMs)) return 0;
  return Math.max(0, Math.floor((submitMs - startMs) / 1000));
}
