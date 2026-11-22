/**
 * NAV-1 Stage B — the student navigation's client-side preferences (no database: spec §2 / §4).
 *   - sidebar: "collapsed" | "expanded" (default expanded), applied to <html data-sidebar> BEFORE the first paint by this
 *     inline script (app/layout.tsx), so the content column never shifts
 *   - language: "en" | "hi" — the student's language choice, used where a Hindi version of the page exists
 * Every access is wrapped: private windows / blocked storage simply fall back to the defaults.
 */
export const SIDEBAR_PREF_KEY = "cl-nav-sidebar";
export const LANG_PREF_KEY = "cl-nav-lang";

export const NAV_PREFS_SCRIPT = `try{if(localStorage.getItem("${SIDEBAR_PREF_KEY}")==="collapsed")document.documentElement.setAttribute("data-sidebar","collapsed")}catch(e){}`;
