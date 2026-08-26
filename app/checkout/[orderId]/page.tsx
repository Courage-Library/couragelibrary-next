import React from "react";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CheckoutClient } from "./checkout-client";

interface Props {
  params: Promise<{ orderId: string }>;
}

interface PaymentOrderRecord {
  id: string;
  order_type: string;
  base_amount: number;
  discount_amount: number;
  taxable_amount: number;
  tax_amount: number;
  total_payable_amount: number;
  currency: string;
  gateway: string;
  status: string;
  subscription_plans?: {
    name?: string;
    duration_days?: number;
  } | null;
}

export default async function CheckoutPage({ params }: Props) {
  const { orderId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: rawOrder } = await supabase
    .from("payment_orders")
    .select("*, subscription_plans(name, duration_days)")
    .eq("id", orderId)
    .maybeSingle();

  if (!rawOrder) {
    notFound();
  }

  const order = rawOrder as unknown as PaymentOrderRecord;

  const orderItem = {
    id: order.id,
    orderType: order.order_type,
    baseAmount: Number(order.base_amount),
    discountAmount: Number(order.discount_amount),
    taxableAmount: Number(order.taxable_amount),
    taxAmount: Number(order.tax_amount),
    totalPayableAmount: Number(order.total_payable_amount),
    currency: order.currency,
    gateway: order.gateway,
    status: order.status,
    planName: order.subscription_plans?.name || "Courage Library PRO",
    durationDays: order.subscription_plans?.duration_days || 30,
  };

  return <CheckoutClient order={orderItem} />;
}
