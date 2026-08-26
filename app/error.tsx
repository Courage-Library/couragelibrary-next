"use client";

import React, { useEffect } from "react";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { logger } from "@/lib/logger";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Route Error Boundary caught error", "ErrorBoundary", error);
  }, [error]);

  return (
    <div className="py-20 flex items-center justify-center min-h-[60vh]">
      <Container>
        <Card className="max-w-md mx-auto border-rose-100 shadow-md">
          <CardHeader>
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-xl mb-2">
              !
            </div>
            <CardTitle className="text-xl text-rose-900">Something went wrong</CardTitle>
            <CardDescription>
              An unexpected error occurred while loading this page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error.digest && (
              <p className="text-xs font-mono text-slate-400 bg-slate-50 p-2 rounded-lg border border-slate-100">
                Digest: {error.digest}
              </p>
            )}
          </CardContent>
          <CardFooter className="flex gap-3">
            <Button variant="default" onClick={() => reset()} className="w-full">
              Try Again
            </Button>
            <Button variant="outline" onClick={() => (window.location.href = "/")} className="w-full">
              Go Home
            </Button>
          </CardFooter>
        </Card>
      </Container>
    </div>
  );
}
