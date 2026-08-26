import React from "react";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, ArrowLeft, CheckCircle2 } from "lucide-react";
import { constructMetadata } from "@/lib/seo/metadata";

export const metadata = constructMetadata({
  title: "Notifications",
  description: "Stay updated on your test results, study reminders, and community discussions.",
});

export default function NotificationsPage() {
  return (
    <div className="py-10 bg-slate-50 min-h-[calc(100vh-4rem)]">
      <Container className="max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Bell className="w-6 h-6 text-blue-600" /> Notifications
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Updates on test results, daily study streaks, and doubt replies
            </p>
          </div>
          <Link href="/dashboard">
            <Button variant="outline" size="sm" className="font-semibold gap-1.5 text-xs">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
            </Button>
          </Link>
        </div>

        <Card className="border-slate-200/80 shadow-xs">
          <CardContent className="py-16 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-xs">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1 max-w-sm mx-auto">
              <h3 className="text-lg font-extrabold text-slate-900">You&apos;re All Caught Up!</h3>
              <p className="text-xs text-slate-500">
                You have no unread notifications at this time. Important updates regarding your mock tests and study progress will appear here.
              </p>
            </div>
            <div className="pt-2">
              <Link href="/practice">
                <Button variant="default" size="sm" className="font-semibold shadow-xs">
                  Start Practice Drill
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </Container>
    </div>
  );
}
