import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/**
 * Asia/Kolkata (IST) Scheduling and Future Launch Validation Utilities
 */
export function getIstCurrentDateTime(): {
  istDateStr: string;
  istTimeStr: string;
  istTimestampMs: number;
} {
  const now = new Date();
  const istFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = istFormatter.formatToParts(now);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "00";
  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");
  const hour = getPart("hour");
  const minute = getPart("minute");
  const second = getPart("second");

  const istDateStr = `${year}-${month}-${day}`;
  const istTimeStr = `${hour}:${minute}`;
  const istIso = `${year}-${month}-${day}T${hour}:${minute}:${second}+05:30`;
  const istTimestampMs = new Date(istIso).getTime();

  return { istDateStr, istTimeStr, istTimestampMs };
}

export function getIstTomorrowDateStr(): string {
  const { istTimestampMs } = getIstCurrentDateTime();
  const tomorrow = new Date(istTimestampMs + 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(tomorrow);
}

export function validateFutureLaunchDateTime(
  launchDate: string,
  launchTime: string = "09:00",
  referenceNow: Date = new Date()
): { isValid: boolean; error?: string; launchIso?: string; launchMs?: number } {
  if (!launchDate || !/^\d{4}-\d{2}-\d{2}$/.test(launchDate)) {
    return { isValid: false, error: "Valid launch date (YYYY-MM-DD) is required." };
  }
  const timeNormalized =
    launchTime && /^\d{2}:\d{2}(:\d{2})?$/.test(launchTime)
      ? launchTime.slice(0, 5)
      : "09:00";
  const launchIso = `${launchDate}T${timeNormalized}:00+05:30`;
  const launchMs = new Date(launchIso).getTime();

  if (isNaN(launchMs)) {
    return { isValid: false, error: "Invalid launch date or time format." };
  }

  const nowMs = referenceNow.getTime();
  if (launchMs <= nowMs) {
    return { isValid: false, error: "Launch date and time must be in the future." };
  }

  return { isValid: true, launchIso, launchMs };
}

export function mapUiTestTypeToDbTestType(uiType: string): "sectional" | "full_length" | "daily" {
  switch (uiType) {
    case "daily_sectional":
    case "sectional":
      return "sectional";
    case "mixed":
      return "sectional";
    case "full_mock":
    case "full_length":
      return "full_length";
    case "daily":
      return "daily";
    default:
      return "sectional";
  }
}
