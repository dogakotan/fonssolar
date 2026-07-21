
-- 1) Audit-trail tablosu: hangi onaylı talep, hangi kalemde ne kadar artış yaptı
CREATE TABLE procurement_item_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES projects(id),
  procurement_item_id uuid NOT NULL REFERENCES procurement_items(id),
  purchase_request_id uuid NOT NULL REFERENCES purchase_requests(id),
  delta_qty numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz
);

ALTER TABLE procurement_item_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY procurement_item_adjustments_select ON procurement_item_adjustments
  FOR SELECT
  USING (has_project_access(project_id));

-- 2) Onay anında: BOM'a bağlı kalemlerde plan aşımı varsa planned_qty + quantity'yi yükselt, iz bırak
CREATE OR REPLACE FUNCTION fn_apply_approved_material_excess(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id text;
  r RECORD;
  v_requested_total numeric;
  v_delta numeric;
BEGIN
  SELECT project_id INTO v_project_id FROM purchase_requests WHERE id = p_request_id;
  IF v_project_id IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT DISTINCT pi.id, pi.planned_qty
    FROM purchase_request_items pri
    JOIN procurement_items pi ON pi.id = pri.bom_item_id
    WHERE pri.request_id = p_request_id
      AND pi.planned_qty IS NOT NULL AND pi.planned_qty > 0
  LOOP
    SELECT COALESCE(SUM(pri.quantity), 0) INTO v_requested_total
    FROM purchase_request_items pri
    JOIN purchase_requests pr ON pr.id = pri.request_id
    WHERE pri.bom_item_id = r.id
      AND pr.status NOT IN ('reddedildi','iptal');

    IF v_requested_total > r.planned_qty THEN
      v_delta := v_requested_total - r.planned_qty;

      UPDATE procurement_items
      SET planned_qty = v_requested_total,
          quantity = v_requested_total::text
      WHERE id = r.id;

      INSERT INTO procurement_item_adjustments (project_id, procurement_item_id, purchase_request_id, delta_qty)
      VALUES (v_project_id, r.id, p_request_id, v_delta);
    END IF;
  END LOOP;
END;
$function$;

-- 3) Onay iptal/reddedilince: bu talebe atfedilen artışları geri al
CREATE OR REPLACE FUNCTION fn_rollback_material_excess(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  a RECORD;
BEGIN
  FOR a IN
    SELECT procurement_item_id, SUM(delta_qty) AS total_delta
    FROM procurement_item_adjustments
    WHERE purchase_request_id = p_request_id
      AND reversed_at IS NULL
    GROUP BY procurement_item_id
  LOOP
    UPDATE procurement_items
    SET planned_qty = GREATEST(0, planned_qty - a.total_delta),
        quantity = GREATEST(0, planned_qty - a.total_delta)::text
    WHERE id = a.procurement_item_id;
  END LOOP;

  UPDATE procurement_item_adjustments
  SET reversed_at = now()
  WHERE purchase_request_id = p_request_id
    AND reversed_at IS NULL;
END;
$function$;

-- 4) Tetikleyici: onay anında uygula, iptal/red anında geri al, her durumda riskleri yeniden hesapla
CREATE OR REPLACE FUNCTION public.trg_recompute_risks_from_purchase_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'onaylandi' AND (OLD.status IS DISTINCT FROM 'onaylandi') THEN
    PERFORM fn_apply_approved_material_excess(NEW.id);
  ELSIF NEW.status IN ('reddedildi','iptal') AND OLD.status = 'onaylandi' THEN
    PERFORM fn_rollback_material_excess(NEW.id);
  END IF;

  PERFORM fn_recompute_auto_risks(COALESCE(NEW.project_id, OLD.project_id));
  RETURN COALESCE(NEW, OLD);
END;
$function$;

