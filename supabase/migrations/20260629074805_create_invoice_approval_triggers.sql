
-- ── 1. Yeni fatura → step 1 otomatik aç ─────────────────────────
create or replace function fn_invoice_approval_init()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into invoice_approvals(invoice_id, step, step_label, status)
  values (NEW.id, 1, 'Yönetici Onayı', 'bekliyor');

  -- fatura statusunu güncelle
  update invoices set status = 'yönetici_onayında' where id = NEW.id;

  return NEW;
end;
$$;

drop trigger if exists trg_invoice_approval_init on invoices;

create trigger trg_invoice_approval_init
after insert on invoices
for each row
execute function fn_invoice_approval_init();


-- ── 2. Step onaylandı → sonraki step aç, fatura statusunu güncelle ──
create or replace function fn_invoice_approval_cascade()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Sadece bekliyor → onaylandı geçişlerinde tetiklen
  if OLD.status = 'bekliyor' and NEW.status = 'onaylandı' then

    if NEW.step = 1 then
      -- Step 2 aç
      insert into invoice_approvals(invoice_id, step, step_label, status)
      values (NEW.invoice_id, 2, 'Muhasebe Onayı', 'bekliyor');

      update invoices set status = 'muhasebe_onayında' where id = NEW.invoice_id;

    elsif NEW.step = 2 then
      -- Tüm adımlar bitti → ödendi
      update invoices set status = 'ödendi' where id = NEW.invoice_id;
    end if;

  elsif OLD.status = 'bekliyor' and NEW.status = 'reddedildi' then
    -- Herhangi bir step reddedilirse fatura bekliyor'a döner
    update invoices set status = 'bekliyor' where id = NEW.invoice_id;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_invoice_approval_cascade on invoice_approvals;

create trigger trg_invoice_approval_cascade
after update on invoice_approvals
for each row
execute function fn_invoice_approval_cascade();

