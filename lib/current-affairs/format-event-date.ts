/**
 * Formats a YYYY-MM-DD news date as "17 Oct 2026". Pure and runtime-agnostic, so server components can call it.
 * (UX-2a.1: it lived in the client module components/current-affairs/current-affairs-card.tsx, and calling it from
 * the server pages /current-affairs and /current-affairs/date/[date] threw "Attempted to call formatEventDate() from
 * the server" — hidden as HTTP 200 + error UI by the root app/loading.tsx boundary until #48 removed it.)
 */
export function formatEventDate(dateStr: string): string {
  if (!dateStr) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const d = parts[2];
  const m = parseInt(parts[1], 10) - 1;
  const y = parts[0];
  return `${d} ${months[m] || parts[1]} ${y}`;
}
