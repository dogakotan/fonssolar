-- GERİYE DÖNÜK YENİDEN İNŞA (04.08.2026) — bu migration canlıda 2026-07-24'te
-- uygulanmış ama yerel dosyası hiç yoktu (bkz. CLAUDE.md "Migration tracking
-- boşluğu"). İçerik, bugünkü canlı şema durumundan (invoice_payments tablosu,
-- ilgili trigger/fonksiyonlar, invoices.paid_amount/remaining_amount, status
-- check'teki kismen_odendi) yeniden türetildi — orijinal SQL'in birebir aynısı
-- OLMAYABİLİR, ama idempotent olduğundan güvenle tekrar çalıştırılabilir ve
-- aynı nihai duruma ulaştırır. Tarihi doğruluk garantisi yoktur.

alter table public.invoices
  add column if not exists paid_amount numeric not null default 0,
  add column if not exists remaining_amount numeric not null default 0;

alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices add constraint invoices_status_check check (
  status = any (array[
    'taslak','yönetici_onayında','duzeltme_bekliyor','onaylandı',
    'odeme_bekliyor','kismen_odendi','ödendi','reddedildi'
  ])
);

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  payment_date date not null,
  amount numeric not null,
  currency text not null default 'TRY',
  payment_method text not null,
  bank_account text,
  reference_no text,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  is_cancelled boolean not null default false,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  cancel_reason text,
  constraint invoice_payments_amount_check check (amount > 0),
  constraint invoice_payments_currency_check check (currency = any (array['TRY','USD','EUR'])),
  constraint invoice_payments_payment_method_check check (payment_method = any (array['havale','eft','kredi_karti','nakit','cek','diger'])),
  constraint invoice_payments_cancel_reason_required check (is_cancelled = false or cancel_reason is not null)
);

alter table public.invoice_payments enable row level security;

drop policy if exists invoice_payments_select on public.invoice_payments;
create policy invoice_payments_select on public.invoice_payments
  for select using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_payments.invoice_id
        and (
          get_my_role() = any (array['admin','muhasebe','proje_koordinatoru'])
          or (get_my_role() = 'proje_yoneticisi' and has_project_access(i.project_id))
        )
    )
  );

drop policy if exists invoice_payments_insert on public.invoice_payments;
create policy invoice_payments_insert on public.invoice_payments
  for insert with check (get_my_role() = any (array['admin','muhasebe']));

drop policy if exists invoice_payments_update on public.invoice_payments;
create policy invoice_payments_update on public.invoice_payments
  for update using (get_my_role() = any (array['admin','muhasebe']));

grant select, insert, update, delete on public.invoice_payments to authenticated;

-- Ödeme eklenmeden önce: fatura gerçekten ödeme aşamasında mı, tutar kalanı aşıyor mu.
create or replace function public.fn_invoice_payment_before_insert()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_status text;
  v_remaining numeric;
begin
  select status, remaining_amount into v_status, v_remaining
    from public.invoices where id = NEW.invoice_id;

  if v_status not in ('odeme_bekliyor', 'kismen_odendi', 'ödendi') then
    raise exception 'Bu fatura ödeme takibi aşamasında değil (durum: %). Sadece onaylanmış ve ödeme bekleyen faturalara ödeme eklenebilir.', v_status;
  end if;

  if NEW.amount > v_remaining then
    raise exception 'Ödeme tutarı (%) kalan fatura tutarını (%) aşamaz.', NEW.amount, v_remaining;
  end if;

  return NEW;
end;
$function$;

drop trigger if exists trg_invoice_payment_before_insert on public.invoice_payments;
create trigger trg_invoice_payment_before_insert
  before insert on public.invoice_payments
  for each row execute function public.fn_invoice_payment_before_insert();

-- Ödeme eklenince/iptal edilince: paid_amount/remaining_amount yeniden hesaplanır,
-- durum odeme_bekliyor/kismen_odendi/ödendi arasında paid_amount'a göre taşınır.
create or replace function public.fn_invoice_payment_recalc()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_invoice_id uuid;
  v_paid numeric;
  v_total numeric;
  v_current_status text;
begin
  v_invoice_id := coalesce(NEW.invoice_id, OLD.invoice_id);

  select coalesce(sum(amount), 0) into v_paid
    from public.invoice_payments
    where invoice_id = v_invoice_id and is_cancelled = false;

  select total_amount, status into v_total, v_current_status
    from public.invoices where id = v_invoice_id;

  update public.invoices
    set paid_amount = v_paid,
        remaining_amount = v_total - v_paid,
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

drop trigger if exists trg_invoice_payment_recalc on public.invoice_payments;
create trigger trg_invoice_payment_recalc
  after insert or delete or update of is_cancelled on public.invoice_payments
  for each row execute function public.fn_invoice_payment_recalc();
