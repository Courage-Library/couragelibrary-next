/**
 * SEC-1C L-04 (option (a)): the middleware forwards the request pathname to Server Components in this header, so the
 * admin layout can deny a staff user's admin-only route BEFORE the admin shell renders. The middleware ALWAYS overwrites
 * it (a client-sent value never reaches the app); it carries no role or session data.
 */
export const PATHNAME_HEADER = "x-cl-pathname";
