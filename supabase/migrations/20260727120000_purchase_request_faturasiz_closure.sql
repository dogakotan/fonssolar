-- Satın alma talebi "Fatura Oluştur" adımına "Faturasız" alternatifi: tedarikçiden
-- resmi fatura gelmeyen (nakit/gayriresmi) alımlarda talebi invoices'a sahte bir kayıt
-- düşmeden, financial_transactions'a (faturasız ödeme) bağlayarak kapatabilmek için.
-- invoices.purchase_request_id + fn_guard_invoice_requires_procurement_done +
-- sync_purchase_request_from_invoice üçlüsünün faturasız eşi.

alter table public.financial_transactions
  add column purchase_request_id uuid references public.purchase_requests(id) on delete set null;

comment on column public.financial_transactions.purchase_request_id is
  'Satın alma talebinden "Faturasız" olarak kapatılan kayıtlarda dolu — invoices.purchase_request_id''in faturasız eşi.';

-- Bir talebin en fazla bir AKTİF (iptal edilmemiş) faturasız kapatma kaydı olabilir —
-- iptal edilirse (status='iptal') talep satin_alindi'ye döner ve yeniden denenebilir.
create unique index financial_transactions_purchase_request_id_key
  on public.financial_transactions (purchase_request_id)
  where purchase_request_id is not null and status <> 'iptal';

CREATE OR REPLACE FUNCTION public.fn_guard_financial_transaction_requires_procurement_done()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status text;
  v_project_id text;
begin
  if new.purchase_request_id is not null then
    select status, project_id
      into v_status, v_project_id
    from public.purchase_requests
    where id = new.purchase_request_id
    for update;

    if not found then
      raise exception 'Satın alma talebi bulunamadı.';
    end if;

    if v_status <> 'satin_alindi' then
      raise exception
        'Bu talep faturasız kapatmaya uygun değil (mevcut durum: %).',
        v_status;
    end if;

    if new.project_id is distinct from v_project_id then
      raise exception
        'İşlem projesi satın alma talebinin projesiyle aynı olmalıdır.';
    end if;
  end if;

  return new;
end;
$function$;

create trigger trg_guard_financial_transaction_requires_procurement_done
  before insert on public.financial_transactions
  for each row execute function fn_guard_financial_transaction_requires_procurement_done();

-- sync_purchase_request_from_invoice'un faturasız eşi. financial_transactions'ta yönetici
-- onay adımı yok (muhasebe direkt girer) — bu yüzden INSERT anında talep doğrudan
-- faturasi_kesildi'ye taşınır (invoices'taki gibi önce fatura_onay_bekliyor'a düşmez).
CREATE OR REPLACE FUNCTION public.sync_purchase_request_from_financial_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.purchase_request_id is null then return new; end if;

  if tg_op = 'INSERT' then
    update public.purchase_requests set status = 'faturasi_kesildi', updated_at = now()
    where id = new.purchase_request_id;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'iptal' then
      update public.purchase_requests set status = 'satin_alindi', updated_at = now()
      where id = new.purchase_request_id;
    elsif old.status = 'iptal' then
      update public.purchase_requests set status = 'faturasi_kesildi', updated_at = now()
      where id = new.purchase_request_id;
    end if;
  end if;

  return new;
end;
$function$;

create trigger trg_financial_transaction_sync_purchase_request
  after insert or update of status on public.financial_transactions
  for each row execute function sync_purchase_request_from_financial_transaction();
