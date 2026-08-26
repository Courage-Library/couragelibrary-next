import React from "react";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Zap, ArrowRight, FileText } from "lucide-react";

export default function CheckoutSuccessPage() {
  return (
    <div className="py-16 bg-slate-50/50 min-h-[calc(100vh-4rem)] flex items-center justify-center">
      <Container className="max-w-md">
        <Card className="p-8 text-center space-y-6 border-emerald-200 bg-white shadow-lg">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <Badge variant="success" className="text-xs">
              PAYMENT VERIFIED & PRO ACTIVATED
            </Badge>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Welcome to Courage Library PRO!
            </h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              Your payment has been successfully confirmed and your PRO subscription entitlement is active immediately.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 font-semibold flex items-center justify-center gap-2">
            <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
            <span>Full Access to Mock Tests, Mistake Vault & Flashcards Unlocked!</span>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Link href="/dashboard">
              <Button size="lg" variant="default" className="w-full bg-indigo-600 hover:bg-indigo-700 font-bold text-xs">
                Go to Dashboard <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </Link>
            <Link href="/billing">
              <Button size="sm" variant="outline" className="w-full text-xs font-semibold">
                <FileText className="w-3.5 h-3.5 mr-1.5" /> View GST Invoice in Billing
              </Button>
            </Link>
          </div>
        </Card>
      </Container>
    </div>
  );
}
