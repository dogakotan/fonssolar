
-- Para/miktar negatif olamaz
ALTER TABLE public.invoices ADD CONSTRAINT invoices_amount_nonneg CHECK (amount >= 0);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_vat_rate_range CHECK (vat_rate >= 0 AND vat_rate <= 100);
ALTER TABLE public.purchase_request_items ADD CONSTRAINT pri_quantity_positive CHECK (quantity > 0);
ALTER TABLE public.purchase_request_items ADD CONSTRAINT pri_unit_price_nonneg CHECK (unit_price >= 0);
ALTER TABLE public.budget_lines ADD CONSTRAINT budget_lines_amount_nonneg CHECK (planned_amount >= 0);
ALTER TABLE public.cost_allocations ADD CONSTRAINT cost_allocations_amount_nonneg CHECK (amount >= 0);
ALTER TABLE public.procurement_items ADD CONSTRAINT procurement_items_planned_qty_positive CHECK (planned_qty IS NULL OR planned_qty > 0);
ALTER TABLE public.project_tasks ADD CONSTRAINT project_tasks_target_qty_nonneg CHECK (target_qty IS NULL OR target_qty >= 0);
ALTER TABLE public.progress_daily ADD CONSTRAINT progress_daily_qty_added_nonneg CHECK (qty_added >= 0);
ALTER TABLE public.daily_reports ADD CONSTRAINT daily_reports_worker_count_nonneg CHECK (worker_count >= 0);
ALTER TABLE public.personnel_log_entries ADD CONSTRAINT personnel_log_entries_count_nonneg CHECK (count >= 0);
ALTER TABLE public.machinery_logs ADD CONSTRAINT machinery_logs_count_nonneg CHECK (count >= 0);
ALTER TABLE public.purchase_requests ADD CONSTRAINT purchase_requests_estimated_amounts_nonneg
  CHECK (estimated_amount_excl_vat IS NULL OR estimated_amount_excl_vat >= 0)
  ;
ALTER TABLE public.purchase_requests ADD CONSTRAINT purchase_requests_estimated_amount_incl_nonneg
  CHECK (estimated_amount_incl_vat IS NULL OR estimated_amount_incl_vat >= 0);

-- Teknik kapasite sayıları negatif olamaz
ALTER TABLE public.projects ADD CONSTRAINT projects_counts_nonneg
  CHECK (panel_count >= 0 AND inverter_count >= 0 AND battery_count >= 0);

-- Tarih sıralaması
ALTER TABLE public.projects ADD CONSTRAINT projects_target_after_start
  CHECK (target_date IS NULL OR start_date IS NULL OR target_date >= start_date);
ALTER TABLE public.project_tasks ADD CONSTRAINT project_tasks_planned_order
  CHECK (planned_end IS NULL OR planned_start IS NULL OR planned_end >= planned_start);
ALTER TABLE public.project_tasks ADD CONSTRAINT project_tasks_actual_order
  CHECK (actual_end IS NULL OR actual_start IS NULL OR actual_end >= actual_start);

-- Para birimi allowlist
ALTER TABLE public.purchase_requests ADD CONSTRAINT purchase_requests_currency_allowlist
  CHECK (currency IN ('TRY', 'USD', 'EUR'));

-- Kategori ağırlıkları toplamı proje bazında 100 olmalı (constraint trigger, satırlar arası toplam gerektirir)
CREATE OR REPLACE FUNCTION public.fn_check_category_weights_sum()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id text;
  v_total numeric;
BEGIN
  v_project_id := COALESCE(NEW.project_id, OLD.project_id);
  SELECT sum(weight_pct) INTO v_total FROM project_category_weights WHERE project_id = v_project_id;
  IF v_total IS NOT NULL AND abs(v_total - 100) > 0.01 THEN
    RAISE EXCEPTION 'project_category_weights: proje % için ağırlık toplamı 100 olmalı, mevcut toplam %', v_project_id, v_total;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE CONSTRAINT TRIGGER trg_check_category_weights_sum
AFTER INSERT OR UPDATE OR DELETE ON public.project_category_weights
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_check_category_weights_sum();

