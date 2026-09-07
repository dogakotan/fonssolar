-- 1) invoice_payments: ödeme anındaki kur + TRY karşılığı
alter table public.invoice_payments
  add column if not exists exchange_rate numeric not null default 1;

alter table public.invoice_payments
  add column if not exists amount_try numeric generated always as (amount * exchange_rate) stored;

-- 2) invoices: TRY'ye çevrilmiş ödenen/kalan tutarlar
alter table public.invoices
  add column if not exists paid_amount_try numeric not null default 0;

alter table public.invoices
  add column if not exists remaining_amount_try numeric not null default 0;

-- backfill
update public.invoices
  set paid_amount_try = paid_amount * exchange_rate,
      remaining_amount_try = total_amount_try - (paid_amount * exchange_rate);

-- 3) recalc trigger: artık TRY karşılıklarını da hesaplayıp yazıyor
create or replace function public.fn_invoice_payment_recalc()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_invoice_id uuid;
  v_paid numeric;
  v_paid_try numeric;
  v_total numeric;
  v_total_try numeric;
  v_current_status text;
begin
  v_invoice_id := coalesce(NEW.invoice_id, OLD.invoice_id);

  select coalesce(sum(amount), 0), coalesce(sum(amount_try), 0) into v_paid, v_paid_try
    from public.invoice_payments
    where invoice_id = v_invoice_id and is_cancelled = false;

  select total_amount, total_amount_try, status into v_total, v_total_try, v_current_status
    from public.invoices where id = v_invoice_id;

  update public.invoices
    set paid_amount = v_paid,
        remaining_amount = v_total - v_paid,
        paid_amount_try = v_paid_try,
        remaining_amount_try = v_total_try - v_paid_try,
        updated_at = now()
    where id = v_invoice_id;

  if v_current_status in ('odeme_bekliyor', 'kismen_odendi', 'ödendi') then
    if v_paid <= 0 then
      update public.invoices set status = 'odeme_bekliyor' where id = v_invoice_id;
    elsif v_paid < v_total then
      update public.invoices set status = 'kismen_odendi' where id = v_invoice_id;
    else
      update public.invoices set status = 'ödendi' where id = v_invoice_id;
    end if;
  end if;

  return null;
end;
$function$;

-- 4) before_insert: para birimi uyuşmazlığına karşı DB katmanında da savunma
create or replace function public.fn_invoice_payment_before_insert()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_status text;
  v_remaining numeric;
  v_currency text;
begin
  select status, remaining_amount, currency into v_status, v_remaining, v_currency
    from public.invoices where id = NEW.invoice_id;

  if v_status not in ('odeme_bekliyor', 'kismen_odendi', 'ödendi') then
    raise exception 'Bu fatura ödeme takibi aşamasında değil (durum: %). Sadece onaylanmış ve ödeme bekleyen faturalara ödeme eklenebilir.', v_status;
  end if;

  if NEW.currency is distinct from v_currency then
    raise exception 'Ödeme para birimi (%) faturanın para birimiyle (%) eşleşmiyor.', NEW.currency, v_currency;
  end if;

  if NEW.amount > v_remaining then
    raise exception 'Ödeme tutarı (%) kalan fatura tutarını (%) aşamaz.', NEW.amount, v_remaining;
  end if;

  return NEW;
end;
$function$;

-- 5) view: yeni TRY alanlarını da döndür
create or replace view public.v_invoice_payment_overview
with (security_invoker = on) as
 select id, invoice_no, project_id, supplier_id, status, currency,
    total_amount, paid_amount, remaining_amount, due_date,
    case
      when status = any (array['odeme_bekliyor','kismen_odendi']) and due_date < current_date then 'vadesi_gecti'
      when status = any (array['odeme_bekliyor','kismen_odendi']) and due_date <= (current_date + interval '7 days') then 'vadesi_yaklasiyor'
      else null
    end as vade_durumu,
    total_amount_try, paid_amount_try, remaining_amount_try
   from invoices i;
