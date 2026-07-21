CREATE OR REPLACE FUNCTION public.create_invoice_approval_chain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into invoice_approvals(invoice_id, step, step_label, status)
  values (NEW.id, 1, 'Yönetici Onayı', 'bekliyor');

  update invoices set status = 'yönetici_onayında' where id = NEW.id;

  return NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_invoice_approval_cascade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if OLD.status = 'bekliyor' and NEW.status = 'onaylandı' then

    if NEW.step_label = 'Muhasebe Onayı' then
      insert into invoice_approvals(invoice_id, step, step_label, status)
      values (NEW.invoice_id, 2, 'Yönetici Onayı', 'bekliyor');

      update invoices set status = 'yönetici_onayında', updated_at = now() where id = NEW.invoice_id;
    else
      update invoices set status = 'onaylandı', updated_at = now() where id = NEW.invoice_id;
    end if;

  elsif OLD.status = 'bekliyor' and NEW.status = 'reddedildi' then
    update invoices set status = 'reddedildi', updated_at = now() where id = NEW.invoice_id;
  end if;

  NEW.reviewed_at = now();

  return NEW;
end;
$function$;

UPDATE invoice_approvals ia
SET status = 'onaylandı',
    note = 'Sistem: fatura onay akışı tek adıma indirildi (2026-07-20)',
    reviewed_at = now()
FROM invoices i
WHERE ia.invoice_id = i.id
  AND ia.step_label = 'Muhasebe Onayı'
  AND ia.status = 'bekliyor'
  AND i.status = 'muhasebe_onayında'
  AND NOT EXISTS (
    SELECT 1 FROM invoice_approvals ia2 WHERE ia2.invoice_id = ia.invoice_id AND ia2.step = 2
  );

