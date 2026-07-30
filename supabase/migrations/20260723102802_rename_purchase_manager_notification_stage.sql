create or replace function public.trg_notify_purchase_request_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status is distinct from old.status then
    perform public.notify_user(
      new.requested_by, auth.uid(), new.project_id,
      'purchase_request', new.id, 'status_changed',
      'Talebinizin durumu güncellendi: ' || new.title,
      'Yeni durum: ' || new.status
    );

    if new.status = 'onaylandi' then
      perform public.notify_role(
        'proje_yoneticisi', auth.uid(), new.project_id,
        'purchase_request', new.id, 'approved',
        'Proje yöneticisi işlemi bekleyen talep: ' || new.title,
        'Proje yöneticisinin işlemi tamamlaması bekleniyor.'
      );
    elsif new.status = 'satin_alindi' then
      perform public.notify_role(
        'muhasebe', auth.uid(), new.project_id,
        'purchase_request', new.id, 'status_changed',
        'Fatura bekleyen satın alma: ' || new.title,
        'Proje yöneticisi işlemi tamamladı; fatura girişi bekleniyor.'
      );
    end if;
  end if;
  return new;
end;
$function$;

revoke execute on function public.trg_notify_purchase_request_status()
from public, anon, authenticated;
