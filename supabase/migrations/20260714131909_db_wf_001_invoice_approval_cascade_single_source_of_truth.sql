
CREATE OR REPLACE FUNCTION public.fn_invoice_approval_cascade()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if OLD.status = 'bekliyor' and NEW.status = 'onaylandı' then

    if NEW.step = 1 then
      -- Muhasebe onayladı → step 2 (Yönetici) aç
      insert into invoice_approvals(invoice_id, step, step_label, status)
      values (NEW.invoice_id, 2, 'Yönetici Onayı', 'bekliyor');

      update invoices set status = 'yönetici_onayında', updated_at = now() where id = NEW.invoice_id;

    elsif NEW.step = 2 then
      -- Yönetici onayladı → onaylandı (fiilen odenmesi ayrı, henuz UI'da olmayan bir adim)
      update invoices set status = 'onaylandı', updated_at = now() where id = NEW.invoice_id;
    end if;

  elsif OLD.status = 'bekliyor' and NEW.status = 'reddedildi' then
    update invoices set status = 'reddedildi', updated_at = now() where id = NEW.invoice_id;
  end if;

  -- reviewed_at'i set et
  NEW.reviewed_at = now();

  return NEW;
end;
$function$;

