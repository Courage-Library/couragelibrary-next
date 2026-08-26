import React from "react";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { XCircle, ArrowLeft, RefreshCw } from "lucide-react";

export default function CheckoutCancelPage() {
  return (
    <div className="py-16 bg-slate-50/50 min-h-[calc(100vh-4rem)] flex items-center justify-center">
      <Container className="max-w-md">
        <Card className="p-8 text-center space-y-6 border-slate-200 bg-white shadow-md">
          <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
            <XCircle className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <Badge variant="destructive" className="text-xs">
              PAYMENT CANCELLED
            </Badge>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Payment Was Not Completed
            </h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              Your payment order was cancelled or incomplete. No charges were made to your account.
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Link href="/pricing">
              <Button size="lg" variant="default" className="w-full bg-indigo-600 hover:bg-indigo-700 font-bold text-xs">
                <RefreshCw className="w-4 h-4 mr-1.5" /> Try Purchasing PRO Again
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button size="sm" variant="outline" className="w-full text-xs font-semibold">
                <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Return to Dashboard
              </Button>
            </Link>
          </div>
        </Card>
      </Container>
    </div>
  );
}
