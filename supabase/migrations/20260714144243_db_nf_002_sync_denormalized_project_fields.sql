
CREATE OR REPLACE FUNCTION public.fn_sync_report_child_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id text;
  v_report_date date;
BEGIN
  SELECT project_id, report_date INTO v_project_id, v_report_date
  FROM daily_reports WHERE id = NEW.report_id;

  NEW.project_id := v_project_id;

  IF TG_TABLE_NAME = 'daily_report_photos' THEN
    NEW.report_date := v_report_date;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_sync_project_fields
  BEFORE INSERT OR UPDATE OF report_id ON public.daily_report_material_usage
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_report_child_fields();

CREATE TRIGGER trg_sync_project_fields
  BEFORE INSERT OR UPDATE OF report_id ON public.daily_report_issues
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_report_child_fields();

CREATE TRIGGER trg_sync_project_fields
  BEFORE INSERT OR UPDATE OF report_id ON public.daily_report_photos
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_report_child_fields();

CREATE OR REPLACE FUNCTION public.fn_sync_cost_allocation_project_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  SELECT project_id INTO NEW.project_id FROM invoices WHERE id = NEW.invoice_id;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_sync_cost_allocation_project_id
  BEFORE INSERT OR UPDATE OF invoice_id ON public.cost_allocations
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_cost_allocation_project_id();

