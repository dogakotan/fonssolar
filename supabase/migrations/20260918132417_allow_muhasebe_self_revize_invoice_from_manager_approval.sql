-- Reconstructed from the deployed function definition for the already-applied
-- migration 20260918132417. This permits accounting to return a manager-pending
-- invoice for correction when accounting itself found an error.
CREATE OR REPLACE FUNCTION public.fn_validate_invoice_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_role text := public.get_my_role();
begin
  if old.status is distinct from new.status then
    if not (
      (old.status = 'taslak' and new.status = 'yönetici_onayında' and v_role in ('admin', 'muhasebe'))
      or (old.status = 'bekliyor' and new.status = 'yönetici_onayında' and v_role in ('admin', 'muhasebe'))
      or (old.status = 'yönetici_onayında' and new.status = 'odeme_bekliyor' and v_role in ('admin', 'proje_yoneticisi'))
      or (old.status = 'yönetici_onayında' and new.status = 'onaylandı' and v_role in ('admin', 'proje_yoneticisi'))
      or (old.status = 'yönetici_onayında' and new.status = 'duzeltme_bekliyor' and v_role in ('admin', 'proje_yoneticisi', 'muhasebe'))
      or (old.status = 'yönetici_onayında' and new.status = 'reddedildi' and v_role in ('admin', 'proje_yoneticisi'))
      or (old.status = 'duzeltme_bekliyor' and new.status = 'yönetici_onayında' and v_role in ('admin', 'muhasebe'))
      or (old.status = 'odeme_bekliyor' and new.status = 'ödendi' and v_role in ('admin', 'muhasebe'))
      or (old.status = any(array['odeme_bekliyor','kismen_odendi','ödendi']) and new.status = any(array['odeme_bekliyor','kismen_odendi','ödendi']) and v_role in ('admin', 'muhasebe'))
      or (old.status = 'onaylandı' and new.status = 'ödendi' and v_role in ('admin', 'muhasebe'))
      or (old.status = 'onaylandı' and new.status = 'reddedildi' and v_role = 'admin')
      or (old.status = 'odeme_bekliyor' and new.status = 'reddedildi' and v_role = 'admin')
    ) then
      raise exception 'Bu rol için geçersiz fatura durum geçişi: % -> %', old.status, new.status;
    end if;
  end if;
  return new;
end;
$function$;
