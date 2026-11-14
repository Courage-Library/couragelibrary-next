import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasPro, getProPricing } from "@/lib/payments/pro-server";

export interface SubscriptionPlanItem {
  id: string;
  planCode: string;
  name: string;
  description: string | null;
  durationDays: number;
  basePriceInr: number;
  currency: string;
  taxRatePct: number;
  isActive: boolean;
  displayOrder: number;
}

export interface UserSubscriptionStatus {
  isPro: boolean;
  entitlementId?: string;
  planName?: string;
  validUntil?: string;
  status: "ACTIVE" | "FREE" | "EXPIRED";
}

export interface BillingInvoiceItem {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  billingName: string;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  status: string;
}

export interface PaymentOrderItem {
  id: string;
  orderType: string;
  baseAmount: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  totalPayableAmount: number;
  currency: string;
  gateway: string;
  status: string;
  createdAt: string;
  planName?: string;
}

interface RawPlanRecord {
  id: string;
  plan_code: string;
  name: string;
  description: string | null;
  duration_days: number;
  base_price_inr: number;
  currency: string;
  tax_rate_pct: number;
  is_active: boolean;
  display_order: number;
}


interface RawInvoiceRecord {
  id: string;
  invoice_number: string;
  invoice_date: string;
  billing_name: string;
  taxable_amount: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  total_amount: number;
  currency: string;
  status: string;
}

interface RawOrderRecord {
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
  created_at: string;
  subscription_plans?: { name?: string } | null;
}

export class BillingService {
  /**
   * Fetches active subscription plans catalog.
   */
  static async getSubscriptionPlans(): Promise<SubscriptionPlanItem[]> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("subscription_plans")
      .select("id, plan_code, name, description, duration_days, base_price_inr, currency, tax_rate_pct, is_active, display_order")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (error || !data) return [];

    const plans = data as RawPlanRecord[];
    return plans.map((p) => ({
      id: p.id,
      planCode: p.plan_code,
      name: p.name,
      description: p.description,
      durationDays: p.duration_days,
      basePriceInr: Number(p.base_price_inr),
      currency: p.currency,
      taxRatePct: Number(p.tax_rate_pct),
      isActive: p.is_active,
      displayOrder: p.display_order,
    }));
  }

  /**
   * PAY-1 B1: the user's Pro status from the F9 sources of truth (was a read of legacy columns that always returned
   * FREE; that TYPES-1 escape is closed): hasPro() = fn_has_pro (fails closed) and the latest end of the
   * user's active paid / granted Pro (getProPricing account.currentEnd; null = open-ended library Pro).
   */
  static async getUserSubscriptionStatus(): Promise<UserSubscriptionStatus> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { isPro: false, status: "FREE" };
    if (!(await hasPro(user.id))) return { isPro: false, status: "FREE" };
    const { account } = await getProPricing(user.id);
    return { isPro: true, planName: "Courage Library Pro", validUntil: account.unlimited ? undefined : account.currentEnd ?? undefined, status: "ACTIVE" };
  }

  // PAY-1 B1 (PAY-LEGACY-RETIRE-1): createPaymentOrder (legacy fn_create_payment_order, dropped by migration 140) and
  // getUserInvoices (legacy GST invoices, no longer shown on /billing) are retired.

  /**
   * Fetches user's payment orders history.
   */
  static async getUserPaymentOrders(): Promise<PaymentOrderItem[]> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return [];

    const { data, error } = await supabase
      .from("payment_orders")
      .select("id, order_type, base_amount, discount_amount, taxable_amount, tax_amount, total_payable_amount, currency, gateway, status, created_at, subscription_plans(name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error || !data) return [];

    const orders = data as RawOrderRecord[];
    return orders.map((o) => ({
      id: o.id,
      orderType: o.order_type,
      baseAmount: Number(o.base_amount),
      discountAmount: Number(o.discount_amount),
      taxableAmount: Number(o.taxable_amount),
      taxAmount: Number(o.tax_amount),
      totalPayableAmount: Number(o.total_payable_amount),
      currency: o.currency,
      gateway: o.gateway,
      status: o.status,
      createdAt: o.created_at,
      planName: o.subscription_plans?.name || undefined,
    }));
  }
}
