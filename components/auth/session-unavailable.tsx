"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { Container } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";

/** Slim shell banner for the same condition (the header cannot tell who is signed in). */
export function SessionUnavailableBanner() {
  return (
    <Container className="pt-3">
      <Alert
        tone="warning"
        live
        title="We couldn't check your sign-in"
        action={
          <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
            Try again
          </Button>
        }
      >
        Our server didn&apos;t respond in time. This is usually temporary.
      </Alert>
    </Container>
  );
}

/**
 * AUTH-1 Stage 2a (AUTH-RESILIENCE): shown when the server could not confirm the session (Supabase unreachable).
 * Renders no protected data and does not redirect to login. "Try again" reloads the same URL, or goes to `retryHref`
 * (an already-sanitized same-origin path) when the guard sent the visitor to /auth/unavailable.
 */
export function SessionUnavailable({ headingLevel = 1, retryHref }: { headingLevel?: 1 | 2; retryHref?: string }) {
  const title = "Connection problem";
  const icon = <RefreshCw aria-hidden="true" className="size-4" />;
  return (
    <Container className="py-12">
      {/* UX-2b.A11Y-1: page-level h1 with distinct text, so screen readers don't hear the same heading twice */}
      {headingLevel === 1 && <h1 className="sr-only">We couldn&apos;t check your sign-in</h1>}
      <div role="status" data-session-unavailable="">
        <EmptyState
          icon={<WifiOff />}
          title={title}
          headingLevel={2}
          description="We couldn't check your sign-in because our server didn't respond in time. This is usually temporary. Please try again in a moment."
          action={
            retryHref ? (
              <ButtonLink href={retryHref} variant="primary" leadingIcon={icon} prefetch={false}>
                Try again
              </ButtonLink>
            ) : (
              <Button variant="primary" leadingIcon={icon} onClick={() => window.location.reload()}>
                Try again
              </Button>
            )
          }
        />
      </div>
    </Container>
  );
}
