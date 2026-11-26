import { logoutAction } from "@/app/(site)/auth/actions";

/**
 * ADMIN-MFA-UX-1 §1.2 — "Signed in as j•••@domain · Not you? Sign out". Server component: it receives ONLY the masked
 * address (the full e-mail never reaches the HTML) and uses the existing sign-out action (unchanged). `inert` in the
 * fixture (no action, no request).
 */
export function MfaAccountRow({ masked, inert }: { masked: string; inert?: boolean }) {
  const initial = masked === "your account" ? "" : masked.slice(0, 1).toUpperCase();
  const button = (
    <button type={inert ? "button" : "submit"} className="focus-ring -my-2 ml-auto inline-flex min-h-12 shrink-0 items-center rounded px-1 font-semibold text-cl-blue-text hover:underline">
      <span className="hidden sm:inline">Not you?&nbsp;</span>Sign out
    </button>
  );
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-cl-line bg-cl-cloud px-3 py-2 text-[13px] text-cl-slate" data-mfa-account="">
      {initial && (
        <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-cl-blue-tint text-[12px] font-bold text-cl-blue-text">
          {initial}
        </span>
      )}
      <span className="min-w-0 truncate">
        <span className="hidden sm:inline">Signed in as </span>
        <span className="font-medium text-cl-charcoal">{masked}</span>
      </span>
      {inert ? button : <form action={logoutAction} className="ml-auto flex">{button}</form>}
    </div>
  );
}
