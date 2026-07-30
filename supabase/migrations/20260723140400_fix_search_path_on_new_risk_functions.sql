-- get_advisors uyarısı: bu iki fonksiyon SET search_path='public' olmadan oluşturulmuştu
-- (trg_recompute_risks_from_purchase_request CREATE OR REPLACE ile bunu kaybetti, diğer
-- 3 kardeş trigger'da hâlâ var; fn_set_risk_closed_at yeni oluşturulurken eklenmemişti).
create or replace function public.trg_recompute_risks_from_purchase_request()
returns trigger
language plpgsql
set search_path = 'public'
as $function$
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

create or replace function public.fn_set_risk_closed_at()
returns trigger
language plpgsql
set search_path = 'public'
as $function$
begin
  if new.status = 'kapatıldı' and (old.status is null or old.status is distinct from 'kapatıldı') then
    new.closed_at := now();
  elsif new.status is distinct from 'kapatıldı' then
    new.closed_at := null;
  end if;
  return new;
end;
$function$;
