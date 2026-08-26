import { createServerSupabaseClient } from "@/lib/supabase/server";

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

interface RawEntitlementRecord {
  id: string;
  status: string;
  valid_until: string;
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

    const plans = data as unknown as RawPlanRecord[];
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
   * Fetches active user PRO entitlement status.
   */
  static async getUserSubscriptionStatus(): Promise<UserSubscriptionStatus> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { isPro: false, status: "FREE" };
    }

    const { data } = await supabase
      .from("user_entitlements")
      .select("id, status, valid_until")
      .eq("user_id", user.id)
      .eq("entitlement_type", "SUBSCRIPTION")
      .eq("status", "ACTIVE")
      .gt("valid_until", new Date().toISOString())
      .order("valid_until", { ascending: false })
      .maybeSingle();

    if (!data) {
      return { isPro: false, status: "FREE" };
    }

    const ent = data as unknown as RawEntitlementRecord;

    return {
      isPro: true,
      entitlementId: ent.id,
      planName: "PRO Access Pass",
      validUntil: ent.valid_until,
      status: "ACTIVE",
    };
  }

  /**
   * Creates a payment order via fn_create_payment_order RPC.
   */
  static async createPaymentOrder(payload: {
    orderType: "SUBSCRIPTION_PURCHASE" | "COURSE_PURCHASE";
    planId?: string;
    courseId?: string;
    couponCode?: string;
  }): Promise<{
    success: boolean;
    order_id?: string;
    total_payable_amount?: number;
    base_amount?: number;
    discount_amount?: number;
    tax_amount?: number;
    currency?: string;
    error?: string;
  }> {
    const supabase = await createServerSupabaseClient();
    const rpcCall = supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

    const { data, error } = await rpcCall("fn_create_payment_order", {
      p_order_type: payload.orderType,
      p_plan_id: payload.planId || null,
      p_course_id: payload.courseId || null,
      p_coupon_code: payload.couponCode || null,
      p_gateway: "RAZORPAY",
      p_idempotency_key: `order:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    });

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to create payment order" };
    }

    return data as {
      success: boolean;
      order_id?: string;
      total_payable_amount?: number;
      base_amount?: number;
      discount_amount?: number;
      tax_amount?: number;
      currency?: string;
      error?: string;
    };
  }

  /**
   * Fetches user's issued GST invoices.
   */
  static async getUserInvoices(): Promise<BillingInvoiceItem[]> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return [];

    const { data, error } = await supabase
      .from("billing_invoices")
      .select("id, invoice_number, invoice_date, billing_name, taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount, currency, status")
      .eq("user_id", user.id)
      .order("invoice_date", { ascending: false });

    if (error || !data) return [];

    const invoices = data as unknown as RawInvoiceRecord[];
    return invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoice_number,
      invoiceDate: i.invoice_date,
      billingName: i.billing_name,
      taxableAmount: Number(i.taxable_amount),
      taxAmount: Number(i.cgst_amount || 0) + Number(i.sgst_amount || 0) + Number(i.igst_amount || 0),
      totalAmount: Number(i.total_amount),
      currency: i.currency,
      status: i.status,
    }));
  }

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

    const orders = data as unknown as RawOrderRecord[];
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
