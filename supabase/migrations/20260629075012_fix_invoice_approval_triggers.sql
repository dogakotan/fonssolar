
-- 1. Benim çakışan init trigger'ımı kaldır
drop trigger if exists trg_invoice_approval_init on invoices;
drop function if exists fn_invoice_approval_init();

-- 2. Eski BEFORE UPDATE trigger'ı kaldır (cascade ile çakışıyor)
drop trigger if exists invoice_approval_step_trigger on invoice_approvals;
drop function if exists handle_approval_step();

-- 3. create_invoice_approval_chain → sadece step 1 açsın
create or replace function create_invoice_approval_chain()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into invoice_approvals(invoice_id, step, step_label, status)
  values (NEW.id, 1, 'Muhasebe Onayı', 'bekliyor');

  update invoices set status = 'muhasebe_onayında' where id = NEW.id;

  return NEW;
end;
$$;

-- 4. Cascade fonksiyonunu step label'lara göre düzelt
create or replace function fn_invoice_approval_cascade()
returns trigger
language plpgsql
security definer
as $$
begin
  if OLD.status = 'bekliyor' and NEW.status = 'onaylandı' then

    if NEW.step = 1 then
      -- Muhasebe onayladı → step 2 (Yönetici) aç
      insert into invoice_approvals(invoice_id, step, step_label, status)
      values (NEW.invoice_id, 2, 'Yönetici Onayı', 'bekliyor');

      update invoices set status = 'yönetici_onayında' where id = NEW.invoice_id;

    elsif NEW.step = 2 then
      -- Yönetici onayladı → ödendi
      update invoices set status = 'ödendi' where id = NEW.invoice_id;
    end if;

  elsif OLD.status = 'bekliyor' and NEW.status = 'reddedildi' then
    update invoices set status = 'bekliyor' where id = NEW.invoice_id;
  end if;

  -- reviewed_at'i set et
  NEW.reviewed_at = now();

  return NEW;
end;
$$;

