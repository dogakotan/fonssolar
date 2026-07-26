-- trg_recompute_risks_from_purchase_request() SECURITY INVOKER olarak kalmıştı;
-- fn_apply_approved_material_excess()/fn_recompute_auto_risks() çağırıyor ama bu
-- fonksiyonların EXECUTE yetkisi yalnızca postgres/service_role'de, authenticated'da
-- yok. Sonuç: bir satın alma talebi onaylandi'ye her taşındığında (gerçek admin
-- "Onayla" akışında) "permission denied for function fn_apply_approved_material_excess"
-- ile başarısız oluyordu. Kardeş trigger fonksiyonları (trg_recompute_risks_from_
-- purchase_item/_daily_report/_task) hepsi zaten SECURITY DEFINER — burada da aynı
-- şekle getiriliyor, başka hiçbir mantık değişmiyor.

CREATE OR REPLACE FUNCTION public.trg_recompute_risks_from_purchase_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'onaylandi' AND (OLD.status IS DISTINCT FROM 'onaylandi') THEN
    PERFORM fn_apply_approved_material_excess(NEW.id);
    PERFORM fn_recompute_auto_risks(NEW.project_id, true);
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF NEW.status IN ('reddedildi','iptal') AND OLD.status = 'onaylandi' THEN
    PERFORM fn_rollback_material_excess(NEW.id);
  END IF;

  PERFORM fn_recompute_auto_risks(COALESCE(NEW.project_id, OLD.project_id));
  RETURN COALESCE(NEW, OLD);
END;
$function$;
