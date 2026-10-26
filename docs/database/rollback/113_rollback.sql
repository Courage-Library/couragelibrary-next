-- Rollback for 20261026000113_f9_pricing_schema.sql. Run as ONE transaction by the operator, AFTER 114's rollback.
-- Only safe while no PRO_PLAN order / receipt exists (TEST mode; payments OFF in production).
BEGIN;

GRANT EXECUTE ON FUNCTION public.fn_create_payment_order(text, uuid, uuid, text, text, text) TO authenticated;
DROP TABLE IF EXISTS public.pro_reminders_sent;
DROP TABLE IF EXISTS public.payment_receipts;
DROP INDEX IF EXISTS public.uq_user_entitlements_order;
DROP INDEX IF EXISTS public.idx_user_entitlements_user_active;
ALTER TABLE public.user_entitlements DROP COLUMN IF EXISTS pro_plan_version_id, DROP COLUMN IF EXISTS revoked_at, DROP COLUMN IF EXISTS founding,
    DROP COLUMN IF EXISTS granted_by, DROP COLUMN IF EXISTS order_id, DROP COLUMN IF EXISTS source;
ALTER TABLE public.payment_orders DROP CONSTRAINT IF EXISTS chk_order_target;
ALTER TABLE public.payment_orders ADD CONSTRAINT chk_order_target CHECK (
       (order_type = 'SUBSCRIPTION_PURCHASE' AND plan_id IS NOT NULL AND course_id IS NULL)
    OR (order_type = 'COURSE_PURCHASE' AND course_id IS NOT NULL AND plan_id IS NULL));
ALTER TABLE public.payment_orders DROP CONSTRAINT IF EXISTS payment_orders_order_type_check;
ALTER TABLE public.payment_orders ADD CONSTRAINT payment_orders_order_type_check CHECK (order_type = ANY (ARRAY['SUBSCRIPTION_PURCHASE', 'COURSE_PURCHASE']));
DROP INDEX IF EXISTS public.idx_payment_orders_user_created;
ALTER TABLE public.payment_orders DROP COLUMN IF EXISTS founding, DROP COLUMN IF EXISTS amount_paise, DROP COLUMN IF EXISTS plan_version,
    DROP COLUMN IF EXISTS plan_code, DROP COLUMN IF EXISTS pro_plan_version_id;
DROP TABLE IF EXISTS public.founding_offer;
DROP TABLE IF EXISTS public.app_settings;
DROP TABLE IF EXISTS public.pro_plan_versions;

COMMIT;
