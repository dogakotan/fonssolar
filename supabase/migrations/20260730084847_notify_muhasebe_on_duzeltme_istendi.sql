-- GERİYE DÖNÜK YENİDEN İNŞA (04.08.2026) — bkz. 20260724104456 dosyasındaki not.
-- fn_invoice_approval_cascade öncesinde yalnızca invoices.status'u
-- duzeltme_bekliyor'a çekiyordu, muhasebeye hiç bildirim gitmiyordu. Bu
-- migration "düzeltme istendi" dalına notify_role('muhasebe', ...) ekliyor.

create or replace function public.fn_invoice_approval_cascade()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_requires_payment boolean;
  v_invoice public.invoices%rowtype;
begin
  if OLD.status = 'bekliyor' and NEW.status = 'onaylandı' then
    select requires_payment_tracking into v_requires_payment
      from public.invoices where id = NEW.invoice_id;

    if coalesce(v_requires_payment, true) then
      update public.invoices set status = 'odeme_bekliyor', updated_at = now() where id = NEW.invoice_id;
    else
      update public.invoices set status = 'onaylandı', updated_at = now() where id = NEW.invoice_id;
    end if;

  elsif OLD.status = 'bekliyor' and NEW.status = 'reddedildi' then
    update public.invoices set status = 'reddedildi', updated_at = now() where id = NEW.invoice_id;

  elsif OLD.status = 'bekliyor' and NEW.status = 'duzeltme_istendi' then
    update public.invoices set status = 'duzeltme_bekliyor', updated_at = now()
      where id = NEW.invoice_id
      returning * into v_invoice;

    if v_invoice.id is not null then
      perform public.notify_role('muhasebe', auth.uid(), v_invoice.project_id,
        'invoice', v_invoice.id, 'status_changed',
        'Faturanızda düzeltme istendi: ' || coalesce(v_invoice.invoice_no, ''),
        coalesce(NEW.note, 'Düzeltme gerekçesi belirtilmedi.'));
    end if;

  elsif OLD.status = 'duzeltme_istendi' and NEW.status = 'bekliyor' then
    update public.invoices set status = 'yönetici_onayında', updated_at = now() where id = NEW.invoice_id;

  end if;

  NEW.reviewed_at = now();
  return NEW;
end;
$function$;
