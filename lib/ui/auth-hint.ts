/**
 * PERF-HOME-1: the public pages (/, /exams, category pages) are cached HTML that is IDENTICAL for every visitor — they
 * carry BOTH the signed-out and the signed-in link sets. This tiny script runs in <head> before the first paint and
 * marks <html data-auth="in"> when a Supabase auth cookie is present (the @supabase/ssr cookie is readable by
 * JavaScript; its presence is only a hint for which links to show — every protected page still checks the session
 * on the server). CSS (app/globals.css) then shows .auth-in or .auth-out. No JS → signed-out links (Sign in works).
 */
export const AUTH_HINT_SCRIPT = `try{if(/(?:^|;\\s*)sb-[^=;]+-auth-token(?:\\.0)?=/.test(document.cookie))document.documentElement.setAttribute("data-auth","in")}catch(e){}`;
