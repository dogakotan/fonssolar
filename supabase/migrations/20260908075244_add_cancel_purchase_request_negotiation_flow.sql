-- 3 aşamalı Teklif/Pazarlık/Sipariş akışının bağımsız kod incelemesinde bulundu:
-- plan dosyası ("iptal her aşamadan PM/admin tarafından çağrılabilir") bunu
-- açıkça öngörmüştü ama implementasyonda unutulmuştu — pazarlik_onay_bekliyor/
-- pazarlik/siparis'e giren bir talep hiçbir UI yolundan durdurulamıyordu.
create or replace function public.cancel_purchase_request_negotiation_flow(
  p_request_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_request public.purchase_requests%rowtype;
begin
  if v_actor is null then
    raise exception 'Oturum açmanız gerekiyor.';
  end if;

  if public.get_my_role() not in ('proje_yoneticisi', 'admin') then
    raise exception 'Bu işlemi yalnızca proje yöneticisi veya yönetici yapabilir.';
  end if;

  if coalesce(btrim(p_note), '') = '' then
    raise exception 'İptal için açıklama girmelisiniz.';
  end if;

  select * into v_request from public.purchase_requests where id = p_request_id for update;
  if not found then
    raise exception 'Satın alma talebi bulunamadı.';
  end if;

  if not public.has_project_access(v_request.project_id) then
    raise exception 'Bu projeye erişim yetkiniz yok.';
  end if;

  if v_request.status not in ('teklif_toplama', 'pazarlik_onay_bekliyor', 'pazarlik', 'siparis') then
    raise exception 'Bu talep artık bu akıştan iptal edilemez.';
  end if;

  update public.purchase_requests
  set status = 'iptal',
      notes = case when coalesce(btrim(notes), '') = '' then p_note else notes || E'\n' || p_note end,
      updated_at = now()
  where id = p_request_id;

  return jsonb_build_object('request_id', p_request_id, 'status', 'iptal');
end;
$function$;

grant execute on function public.cancel_purchase_request_negotiation_flow(uuid, text) to authenticated;
revoke execute on function public.cancel_purchase_request_negotiation_flow(uuid, text) from public, anon;
