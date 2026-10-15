/**
 * COURAGE LIBRARY — typed helpers for Supabase RPC boundaries (TYPES-1).
 *
 * Generated types describe a `jsonb`-returning function as `Json` and never mark function arguments as
 * nullable. These two helpers make those boundaries explicit instead of per-call `as any` / `unknown as`.
 */
import type { Json } from "@/types/database";

/**
 * A jsonb RPC result that must be a JSON object; anything else (null, array, scalar) → null.
 * The caller states the object shape it expects from the SQL function.
 */
export function rpcJsonObject<T extends object>(value: Json | null | undefined): T | null {
  return value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value) ? (value as T) : null;
}

/**
 * SQL NULL for an RPC argument that has NO default but accepts NULL. `supabase gen types` types every function
 * argument as non-nullable, so this is the single, documented place where NULL is passed through. For arguments
 * declared `DEFAULT NULL`, omit the argument (`?? undefined`) instead — the SQL default applies.
 */
export function sqlNullArg<T>(value: T | null | undefined): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generator limitation (no nullable function args), see above
  return (value ?? null) as any as T;
}
