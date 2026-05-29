-- Add active status for customers.
-- 1 = active, 0 = inactive

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS active_status SMALLINT NOT NULL DEFAULT 1;

UPDATE public.customers
   SET active_status = 1
 WHERE active_status IS NULL;

ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS chk_customers_active_status;

ALTER TABLE public.customers
  ADD CONSTRAINT chk_customers_active_status
  CHECK (active_status IN (0, 1));
