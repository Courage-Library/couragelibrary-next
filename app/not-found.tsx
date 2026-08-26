import React from "react";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="py-24 flex items-center justify-center min-h-[60vh]">
      <Container>
        <Card className="max-w-md mx-auto text-center border-slate-200 shadow-md">
          <CardHeader className="items-center">
            <span className="text-6xl font-black text-blue-600 tracking-tight">404</span>
            <CardTitle className="text-xl mt-2">Page Not Found</CardTitle>
            <CardDescription className="text-center">
              The page you are looking for might have been moved or does not exist.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center pt-2">
            <Link href="/">
              <Button variant="default">Return to Home</Button>
            </Link>
          </CardFooter>
        </Card>
      </Container>
    </div>
  );
}
