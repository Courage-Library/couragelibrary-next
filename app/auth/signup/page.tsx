import Link from "next/link";
import { getSignupAvailability } from "@/lib/auth/signup-availability";
import { Card, CardBody, CardDescription, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/logo";
import { SignupForm } from "./signup-form";
import { isCaptchaEnabled, turnstileSiteKey } from "@/lib/auth/captcha";

export const dynamic = "force-dynamic";

/**
 * AUTH-1 Stage 2a (decision #60.2): while public registration is off (the Supabase project's "Allow new users to sign
 * up" setting, or AUTH_SIGNUP_ENABLED=false), the page says so honestly and shows no form. The form and the
 * server action keep working for when registration is re-opened.
 * AUTH-1 2b-2: when the form is shown and the Turnstile flag is on, the public site key is passed to it.
 */
export default async function SignupPage() {
  if ((await getSignupAvailability()) !== "closed") {
    return <SignupForm captcha={isCaptchaEnabled() ? { siteKey: turnstileSiteKey() as string } : null} />;
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md text-center" data-signup-closed="">
        <CardHeader className="items-center">
          <BrandLogo variant="icon" size="lg" />
          <h1 className="text-h2 font-bold text-fg">Registrations open soon</h1>
          <CardDescription className="text-body">
            We aren&apos;t taking new accounts yet. If you already have an account, you can sign in.
          </CardDescription>
        </CardHeader>
        <CardBody className="items-center gap-3">
          <ButtonLink href="/auth/login" variant="primary">
            Sign in
          </ButtonLink>
          <Link href="/" className="text-body-sm font-medium text-link underline underline-offset-2">
            Back to the home page
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}
