-- ============================================================================
-- COURAGE LIBRARY — PHASE 3I: MONETIZATION & PAYMENT FOUNDATION DDL
-- Target Database: couragelibrary-next
-- ============================================================================

-- 1. Create Invoice Number Sequence
CREATE SEQUENCE IF NOT EXISTS public.seq_invoice_number START WITH 1001;

-- 2. Create subscription_plans (Pro Subscription Catalog)
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_code TEXT NOT NULL UNIQUE CHECK (plan_code ~* '^[A-Z0-9_]+$'),
    name TEXT NOT NULL CHECK (length(name) <= 100),
    description TEXT,
    duration_days INTEGER NOT NULL CHECK (duration_days > 0),
    base_price_inr NUMERIC(10,2) NOT NULL CHECK (base_price_inr >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    tax_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 18.00 CHECK (tax_rate_pct >= 0.00),
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create discount_coupons (Promotional Rules & Global Caps)
CREATE TABLE IF NOT EXISTS public.discount_coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_code TEXT NOT NULL UNIQUE CHECK (coupon_code ~* '^[A-Z0-9_-]+$'),
    discount_type TEXT NOT NULL CHECK (discount_type IN ('PERCENTAGE', 'FLAT')),
    discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
    max_discount_inr NUMERIC(10,2) CHECK (max_discount_inr > 0),
    min_order_inr NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (min_order_inr >= 0),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    max_total_usage INTEGER CHECK (max_total_usage > 0),
    current_usage_count INTEGER NOT NULL DEFAULT 0 CHECK (current_usage_count >= 0),
    max_usage_per_user INTEGER NOT NULL DEFAULT 1 CHECK (max_usage_per_user > 0),
    applicability_scope TEXT NOT NULL DEFAULT 'ALL' CHECK (applicability_scope IN ('SUBSCRIPTION_PURCHASE', 'COURSE_PURCHASE', 'ALL')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create payment_orders (Server-Authoritative Checkout Snapshot)
CREATE TABLE IF NOT EXISTS public.payment_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    order_type TEXT NOT NULL CHECK (order_type IN ('SUBSCRIPTION_PURCHASE', 'COURSE_PURCHASE')),
    plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
    course_id UUID REFERENCES public.courses(id) ON DELETE RESTRICT,
    base_amount NUMERIC(10,2) NOT NULL CHECK (base_amount >= 0),
    discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    taxable_amount NUMERIC(10,2) NOT NULL CHECK (taxable_amount >= 0),
    tax_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 18.00 CHECK (tax_rate_pct >= 0.00),
    tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
    total_payable_amount NUMERIC(10,2) NOT NULL CHECK (total_payable_amount >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    gateway TEXT NOT NULL DEFAULT 'RAZORPAY' CHECK (gateway IN ('RAZORPAY', 'STRIPE', 'CASHFREE', 'MANUAL')),
    gateway_order_id TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED')),
    idempotency_key TEXT UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_order_target CHECK (
        (order_type = 'SUBSCRIPTION_PURCHASE' AND plan_id IS NOT NULL AND course_id IS NULL) OR
        (order_type = 'COURSE_PURCHASE' AND course_id IS NOT NULL AND plan_id IS NULL)
    )
);

-- 5. Create coupon_redemptions (Concurrency-Safe Coupon Reservations)
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES public.discount_coupons(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    order_id UUID NOT NULL UNIQUE REFERENCES public.payment_orders(id) ON DELETE CASCADE,
    discount_amount NUMERIC(10,2) NOT NULL CHECK (discount_amount >= 0),
    status TEXT NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED', 'COMMITTED', 'RELEASED')),
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    committed_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Create payment_transactions (Verified Payment Capture Records)
CREATE TABLE IF NOT EXISTS public.payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
    gateway TEXT NOT NULL,
    gateway_payment_id TEXT UNIQUE,
    gateway_signature TEXT,
    payment_method TEXT,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED', 'PENDING', 'REFUNDED')),
    gateway_response_json JSONB DEFAULT '{}'::jsonb,
    captured_at TIMESTAMPTZ,
    refund_reason TEXT,
    refund_amount NUMERIC(10,2) DEFAULT 0.00 CHECK (refund_amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Create payment_webhook_events (Append-Only Replay Protection Log)
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gateway TEXT NOT NULL,
    gateway_event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    raw_payload JSONB NOT NULL,
    signature_verified BOOLEAN NOT NULL DEFAULT false,
    processing_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (processing_status IN ('PENDING', 'PROCESSED', 'FAILED', 'IGNORED')),
    processing_error TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    CONSTRAINT uq_webhook_gateway_event UNIQUE (gateway, gateway_event_id)
);

-- 8. Create billing_invoices (Sequential Legal GST Tax Invoices)
CREATE TABLE IF NOT EXISTS public.billing_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    order_id UUID NOT NULL UNIQUE REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
    transaction_id UUID REFERENCES public.payment_transactions(id) ON DELETE RESTRICT,
    invoice_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    billing_name TEXT NOT NULL CHECK (length(billing_name) <= 150),
    billing_address TEXT,
    billing_state TEXT NOT NULL DEFAULT 'DELHI',
    gstin TEXT,
    place_of_supply TEXT NOT NULL DEFAULT 'DELHI',
    taxable_amount NUMERIC(10,2) NOT NULL CHECK (taxable_amount >= 0),
    tax_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 18.00 CHECK (tax_rate_pct >= 0.00),
    cgst_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (cgst_amount >= 0),
    sgst_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (sgst_amount >= 0),
    igst_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (igst_amount >= 0),
    total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED', 'CANCELLED', 'REFUNDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Performance B-Tree Indexes
CREATE INDEX IF NOT EXISTS idx_po_user_created ON public.payment_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_po_status ON public.payment_orders (status);
CREATE INDEX IF NOT EXISTS idx_po_gateway_order ON public.payment_orders (gateway_order_id);
CREATE INDEX IF NOT EXISTS idx_pt_order_id ON public.payment_transactions (order_id);
CREATE INDEX IF NOT EXISTS idx_pt_gateway_payment ON public.payment_transactions (gateway_payment_id);
CREATE INDEX IF NOT EXISTS idx_cr_coupon_user ON public.coupon_redemptions (coupon_id, user_id);
CREATE INDEX IF NOT EXISTS idx_bi_user_created ON public.billing_invoices (user_id, created_at DESC);

-- 10. Enable Row Level Security (RLS)
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;

-- 11. Define RLS Policies
DROP POLICY IF EXISTS "Public can view active subscription plans" ON public.subscription_plans;
CREATE POLICY "Public can view active subscription plans"
    ON public.subscription_plans FOR SELECT
    USING (is_active = true);

DROP POLICY IF EXISTS "Authenticated users can view active coupons" ON public.discount_coupons;
CREATE POLICY "Authenticated users can view active coupons"
    ON public.discount_coupons FOR SELECT
    TO authenticated
    USING (is_active = true);

DROP POLICY IF EXISTS "Users can view own payment orders" ON public.payment_orders;
CREATE POLICY "Users can view own payment orders"
    ON public.payment_orders FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own coupon redemptions" ON public.coupon_redemptions;
CREATE POLICY "Users can view own coupon redemptions"
    ON public.coupon_redemptions FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own payment transactions" ON public.payment_transactions;
CREATE POLICY "Users can view own payment transactions"
    ON public.payment_transactions FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.payment_orders po
        WHERE po.id = payment_transactions.order_id AND po.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Users can view own billing invoices" ON public.billing_invoices;
CREATE POLICY "Users can view own billing invoices"
    ON public.billing_invoices FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- 12. Role Grants
GRANT SELECT ON public.subscription_plans TO anon, authenticated;
GRANT SELECT ON public.discount_coupons TO authenticated;
GRANT SELECT ON public.payment_orders TO authenticated;
GRANT SELECT ON public.coupon_redemptions TO authenticated;
GRANT SELECT ON public.payment_transactions TO authenticated;
GRANT SELECT ON public.billing_invoices TO authenticated;

GRANT ALL ON public.subscription_plans TO service_role;
GRANT ALL ON public.discount_coupons TO service_role;
GRANT ALL ON public.payment_orders TO service_role;
GRANT ALL ON public.coupon_redemptions TO service_role;
GRANT ALL ON public.payment_transactions TO service_role;
GRANT ALL ON public.payment_webhook_events TO service_role;
GRANT ALL ON public.billing_invoices TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.seq_invoice_number TO service_role;

NOTIFY pgrst, 'reload schema';
