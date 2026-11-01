/**
 * PERF-HOME-1: the signed-in user as stored in THIS browser's session cookie (@supabase/ssr: `sb-<ref>-auth-token`,
 * optionally chunked `.0`, `.1` …, value "base64-<base64url JSON>" or plain JSON). DISPLAY ONLY — the bottom nav on the
 * cached public pages; nothing is trusted or sent anywhere. Reading the cookie directly keeps the Supabase client (and
 * the project address) out of those pages' JavaScript (anonymous smoke: no project ref in "/" HTML + chunks).
 * A missing / unreadable cookie → null (the visitor simply sees no student nav).
 */
export interface LocalSessionUser {
  email: string | null;
  fullName: string | null;
  role: string | null;
}

function decode(raw: string): unknown {
  const v = raw.startsWith("base64-") ? raw.slice(7) : null;
  if (v === null) return JSON.parse(raw);
  const b64 = v.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(v.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function readLocalSessionUser(cookie: string = typeof document === "undefined" ? "" : document.cookie): LocalSessionUser | null {
  try {
    const jar = new Map<string, string>();
    for (const part of cookie.split(/;\s*/)) {
      const i = part.indexOf("=");
      if (i > 0) jar.set(part.slice(0, i), decodeURIComponent(part.slice(i + 1)));
    }
    const base = [...jar.keys()].map((k) => /^(sb-[^=;]+-auth-token)(?:\.\d+)?$/.exec(k)?.[1]).find(Boolean);
    if (!base) return null;
    // the unchunked value, else the chunks .0, .1 … joined in order
    let raw = jar.get(base) ?? "";
    if (!jar.has(base)) for (let n = 0; jar.has(`${base}.${n}`); n++) raw += jar.get(`${base}.${n}`);
    if (!raw) return null;
    const s = decode(raw) as { user?: { email?: string; user_metadata?: { full_name?: unknown }; app_metadata?: { role?: unknown } } } | null;
    const u = s?.user;
    if (!u) return null;
    const fullName = typeof u.user_metadata?.full_name === "string" ? u.user_metadata.full_name.trim() || null : null;
    return { email: u.email ?? null, fullName, role: typeof u.app_metadata?.role === "string" ? u.app_metadata.role : null };
  } catch {
    return null;
  }
}
