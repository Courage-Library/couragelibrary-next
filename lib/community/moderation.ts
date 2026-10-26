/**
 * D-1 (ADMIN-UX-1 Q2, architect 2026-10-26): admin decisions on community flags map onto the CANONICAL table
 * public.discussion_moderation_flags (phase 3L schema, unchanged since): status PENDING → RESOLVED_REMOVED |
 * RESOLVED_DISMISSED, plus resolution_action (CHECK: DISMISSED | CONTENT_REMOVED | USER_WARNED | USER_MUTED).
 * The same mapping fn_moderate_flagged_content uses; that RPC needs auth.uid() and has no client EXECUTE (090), so the
 * guarded admin action applies it with the service role. Pure: no clients, no env (the offline gate loads it).
 */
export type ModerationChoice = "RESOLVED" | "DISMISSED";

export interface ModerationDecision {
  status: "RESOLVED_REMOVED" | "RESOLVED_DISMISSED";
  resolution_action: "CONTENT_REMOVED" | "DISMISSED";
  /** "Resolve" removes the flagged content: soft-delete a message, lock a thread (as the RPC does). */
  removeContent: boolean;
}

export function moderationDecision(choice: unknown): ModerationDecision | null {
  const c = typeof choice === "string" ? choice.trim().toUpperCase() : "";
  if (c === "RESOLVED") return { status: "RESOLVED_REMOVED", resolution_action: "CONTENT_REMOVED", removeContent: true };
  if (c === "DISMISSED") return { status: "RESOLVED_DISMISSED", resolution_action: "DISMISSED", removeContent: false };
  return null;
}

export const FLAG_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
