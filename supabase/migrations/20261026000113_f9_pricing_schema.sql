-- =====================================================================================================================
-- 113 F9-B PRICING SCHEMA — one-time Pro plans (3 / 6 / 12 months, no auto-renew), Razorpay TEST mode only
-- Architect GO (F9-B) as a CONDITIONAL GO: apply only if the chunked smoke AS THE REAL ROLES + dry-run ALL pass.
-- Rollback: docs/database/rollback/113_rollback.sql. No BEGIN / COMMIT: the runner owns the transaction.
-- Design: docs/payments/F9_DESIGN.md (§3). 0 live payment orders / entitlements exist.
--
--   pro_plan_versions — canonical prices in paise; a price change = a new version (old orders keep their snapshot);
--     at most ONE active version per plan_code. Seed v1: PRO_3M 29900 · PRO_6M 49900 · PRO_12M 79900 (Best value) ·
--     PRO_12M_FOUNDING 59900 (first 1,000 buyers; founding buyers keep it on renewal). Public read of ACTIVE rows only.
--   app_settings — one row: Free / Pro limits + gst_registered (false). Server (service role) only.
--   founding_offer — one row: the atomic sold counter (limit in app_settings).
--   payment_orders — + PRO_PLAN order type with a snapshot (plan version, plan code, version, amount in paise,
--     founding). Prices are NEVER taken from the client.
--   user_entitlements — + source (PAYMENT / LIBRARY / PROMO), order_id (one entitlement per order), granted_by,
--     founding, revoked_at, pro_plan_version_id.
--   payment_receipts — "Payment receipt" (no GST): own read only.
--   pro_reminders_sent — idempotent expiry reminders (one per entitlement per kind).
--   fn_create_payment_order — client EXECUTE REVOKED (mandatory; replaced by the server-only fn_create_pro_order, 114).
-- =====================================================================================================================

-- ------------------------------------------------------------------ plans (versioned, paise)
CREATE TABLE IF NOT EXISTS public.pro_plan_versions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_code        text NOT NULL CHECK (plan_code IN ('PRO_3M', 'PRO_6M', 'PRO_12M', 'PRO_12M_FOUNDING')),
    version          integer NOT NULL CHECK (version >= 1),
    duration_months  integer NOT NULL CHECK (duration_months IN (3, 6, 12)),
    price_paise      integer NOT NULL CHECK (price_paise > 0),
    currency         text NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
    label            text NOT NULL CHECK (length(label) BETWEEN 1 AND 60),
    badge            text CHECK (badge IS NULL OR length(badge) <= 30),
    is_founding      boolean NOT NULL DEFAULT false,
    display_order    integer NOT NULL DEFAULT 0,
    active           boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (plan_code, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pro_plan_versions_one_active ON public.pro_plan_versions (plan_code) WHERE active;

INSERT INTO public.pro_plan_versions (plan_code, version, duration_months, price_paise, label, badge, is_founding, display_order)
VALUES ('PRO_3M', 1, 3, 29900, 'Pro · 3 months', NULL, false, 1),
       ('PRO_6M', 1, 6, 49900, 'Pro · 6 months', NULL, false, 2),
       ('PRO_12M', 1, 12, 79900, 'Pro · 12 months', 'Best value', false, 3),
       ('PRO_12M_FOUNDING', 1, 12, 59900, 'Pro · 12 months (founding)', NULL, true, 4)
ON CONFLICT (plan_code, version) DO NOTHING;

ALTER TABLE public.pro_plan_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pro_plan_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pro_plan_versions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pro_plan_versions TO service_role;
DROP POLICY IF EXISTS p_pro_plan_versions_read_active ON public.pro_plan_versions;
CREATE POLICY p_pro_plan_versions_read_active ON public.pro_plan_versions FOR SELECT TO anon, authenticated USING (active);

-- ------------------------------------------------------------------ settings (Free / Pro limits) + founding counter
CREATE TABLE IF NOT EXISTS public.app_settings (
    id                       boolean PRIMARY KEY DEFAULT true CHECK (id),
    free_practice_daily      integer NOT NULL DEFAULT 30 CHECK (free_practice_daily >= 0),
    free_memory_lock_active  integer NOT NULL DEFAULT 50 CHECK (free_memory_lock_active >= 0),
    free_daily_mock          integer NOT NULL DEFAULT 1 CHECK (free_daily_mock >= 0),
    gst_registered           boolean NOT NULL DEFAULT false,
    founding_limit           integer NOT NULL DEFAULT 1000 CHECK (founding_limit >= 0),
    updated_at               timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.app_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.app_settings TO service_role;

CREATE TABLE IF NOT EXISTS public.founding_offer (
    id    boolean PRIMARY KEY DEFAULT true CHECK (id),
    sold  integer NOT NULL DEFAULT 0 CHECK (sold >= 0)
);
INSERT INTO public.founding_offer (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.founding_offer ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.founding_offer FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.founding_offer TO service_role;

-- ------------------------------------------------------------------ orders: PRO_PLAN + snapshot
ALTER TABLE public.payment_orders
    ADD COLUMN IF NOT EXISTS pro_plan_version_id uuid REFERENCES public.pro_plan_versions(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS plan_code text,
    ADD COLUMN IF NOT EXISTS plan_version integer,
    ADD COLUMN IF NOT EXISTS amount_paise integer CHECK (amount_paise IS NULL OR amount_paise > 0),
    ADD COLUMN IF NOT EXISTS founding boolean NOT NULL DEFAULT false;
ALTER TABLE public.payment_orders DROP CONSTRAINT IF EXISTS payment_orders_order_type_check;
ALTER TABLE public.payment_orders ADD CONSTRAINT payment_orders_order_type_check
    CHECK (order_type = ANY (ARRAY['SUBSCRIPTION_PURCHASE', 'COURSE_PURCHASE', 'PRO_PLAN']));
ALTER TABLE public.payment_orders DROP CONSTRAINT IF EXISTS chk_order_target;
ALTER TABLE public.payment_orders ADD CONSTRAINT chk_order_target CHECK (
       (order_type = 'SUBSCRIPTION_PURCHASE' AND plan_id IS NOT NULL AND course_id IS NULL)
    OR (order_type = 'COURSE_PURCHASE' AND course_id IS NOT NULL AND plan_id IS NULL)
    OR (order_type = 'PRO_PLAN' AND pro_plan_version_id IS NOT NULL AND plan_id IS NULL AND course_id IS NULL
        AND plan_code IS NOT NULL AND plan_version IS NOT NULL AND amount_paise IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_payment_orders_user_created ON public.payment_orders (user_id, created_at DESC);

-- ------------------------------------------------------------------ entitlements: source + order link
ALTER TABLE public.user_entitlements
    ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'PAYMENT' CHECK (source IN ('PAYMENT', 'LIBRARY', 'PROMO')),
    ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS granted_by uuid,
    ADD COLUMN IF NOT EXISTS founding boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
    ADD COLUMN IF NOT EXISTS pro_plan_version_id uuid REFERENCES public.pro_plan_versions(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_entitlements_order ON public.user_entitlements (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_entitlements_user_active ON public.user_entitlements (user_id, expires_at) WHERE is_active;

-- ------------------------------------------------------------------ receipts (no GST)
CREATE TABLE IF NOT EXISTS public.payment_receipts (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number      text NOT NULL UNIQUE CHECK (receipt_number ~ '^CL-R-[0-9]{6}-[A-Z0-9]{6}$'),
    user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    order_id            uuid NOT NULL UNIQUE REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
    transaction_id      uuid REFERENCES public.payment_transactions(id) ON DELETE RESTRICT,
    plan_code           text NOT NULL,
    plan_version        integer NOT NULL,
    period_start        timestamptz NOT NULL,
    period_end          timestamptz NOT NULL CHECK (period_end > period_start),
    amount_paise        integer NOT NULL CHECK (amount_paise > 0),
    currency            text NOT NULL DEFAULT 'INR',
    gateway_payment_id  text NOT NULL,
    business_name       text NOT NULL,
    email_sent_at       timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payment_receipts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payment_receipts TO service_role;
DROP POLICY IF EXISTS p_payment_receipts_own ON public.payment_receipts;
CREATE POLICY p_payment_receipts_own ON public.payment_receipts FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ------------------------------------------------------------------ expiry reminders (idempotent)
CREATE TABLE IF NOT EXISTS public.pro_reminders_sent (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entitlement_id  uuid NOT NULL REFERENCES public.user_entitlements(id) ON DELETE CASCADE,
    kind            text NOT NULL CHECK (kind IN ('D7', 'D1')),
    sent_at         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (entitlement_id, kind)
);
ALTER TABLE public.pro_reminders_sent ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pro_reminders_sent FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.pro_reminders_sent TO service_role;

-- ------------------------------------------------------------------ the legacy client order RPC: client EXECUTE revoked
REVOKE EXECUTE ON FUNCTION public.fn_create_payment_order(text, uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
