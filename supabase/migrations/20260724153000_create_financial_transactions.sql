create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_no text not null unique,
  transaction_type text not null check (transaction_type in ('masraf','avans','hakedis','vergi_harc','personel','diger')),
  project_id text references public.projects(id) on update cascade on delete restrict,
  supplier_id uuid references public.suppliers(id) on update cascade on delete restrict,
  beneficiary_name text,
  transaction_date date not null default current_date,
  due_date date,
  amount numeric(16,2) not null check (amount > 0),
  currency text not null default 'TRY' check (currency in ('TRY','USD','EUR')),
  description text not null,
  document_type text not null default 'belgesiz' check (document_type in ('fis','makbuz','sozlesme','bordro','dekont','belgesiz','diger')),
  document_url text,
  invoice_expected boolean not null default false,
  invoice_id uuid unique references public.invoices(id) on update cascade on delete set null,
  status text not null default 'odeme_bekliyor' check (status in ('taslak','odeme_bekliyor','kismen_odendi','odendi','iptal')),
  paid_amount numeric(16,2) not null default 0 check (paid_amount >= 0),
  remaining_amount numeric(16,2) not null default 0 check (remaining_amount >= 0),
  created_by uuid references public.profiles(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (supplier_id is not null or nullif(btrim(beneficiary_name),'') is not null)
);

create table if not exists public.financial_transaction_payments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.financial_transactions(id) on update cascade on delete restrict,
  payment_date date not null default current_date,
  amount numeric(16,2) not null check (amount > 0),
  currency text not null default 'TRY' check (currency in ('TRY','USD','EUR')),
  payment_method text not null check (payment_method in ('havale','eft','kredi_karti','nakit','cek','diger')),
  bank_account text, reference_no text, note text,
  created_by uuid references public.profiles(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  is_cancelled boolean not null default false,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on update cascade on delete set null,
  cancel_reason text,
  check (not is_cancelled or (cancelled_at is not null and nullif(btrim(cancel_reason),'') is not null))
);

create or replace function public.fn_financial_transaction_recalc() returns trigger language plpgsql security invoker set search_path=public as $$
declare v_id uuid:=coalesce(new.transaction_id,old.transaction_id); v_total numeric; v_paid numeric;
begin
  select amount into v_total from public.financial_transactions where id=v_id for update;
  select coalesce(sum(amount),0) into v_paid from public.financial_transaction_payments where transaction_id=v_id and not is_cancelled;
  if v_paid>v_total then raise exception 'Ödeme tutarı kalan işlem tutarını aşamaz.'; end if;
  update public.financial_transactions set paid_amount=v_paid,remaining_amount=greatest(v_total-v_paid,0),
    status=case when status in ('taslak','iptal') then status when v_paid<=0 then 'odeme_bekliyor' when v_paid<v_total then 'kismen_odendi' else 'odendi' end,
    updated_at=now() where id=v_id;
  return coalesce(new,old);
end $$;

create or replace function public.fn_financial_transaction_defaults() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  new.remaining_amount:=greatest(new.amount-coalesce(new.paid_amount,0),0);
  new.updated_at:=now();
  return new;
end $$;

drop trigger if exists trg_financial_transaction_defaults on public.financial_transactions;
create trigger trg_financial_transaction_defaults before insert or update of amount on public.financial_transactions for each row execute function public.fn_financial_transaction_defaults();
drop trigger if exists trg_financial_transaction_payment_recalc on public.financial_transaction_payments;
create trigger trg_financial_transaction_payment_recalc after insert or update of amount,is_cancelled or delete on public.financial_transaction_payments for each row execute function public.fn_financial_transaction_recalc();

create index if not exists idx_financial_transactions_project on public.financial_transactions(project_id);
create index if not exists idx_financial_transactions_supplier on public.financial_transactions(supplier_id);
create index if not exists idx_financial_transactions_due on public.financial_transactions(due_date) where status in ('odeme_bekliyor','kismen_odendi');
create index if not exists idx_financial_transaction_payments_transaction on public.financial_transaction_payments(transaction_id,payment_date desc);

alter table public.financial_transactions enable row level security;
alter table public.financial_transaction_payments enable row level security;
create policy financial_transactions_select on public.financial_transactions for select to authenticated using (get_my_role() in ('admin','muhasebe','proje_koordinatoru') or (get_my_role()='proje_yoneticisi' and has_project_access(project_id)));
create policy financial_transactions_insert on public.financial_transactions for insert to authenticated with check (get_my_role() in ('admin','muhasebe'));
create policy financial_transactions_update on public.financial_transactions for update to authenticated using (get_my_role() in ('admin','muhasebe')) with check (get_my_role() in ('admin','muhasebe'));
create policy financial_transaction_payments_select on public.financial_transaction_payments for select to authenticated using (exists(select 1 from public.financial_transactions ft where ft.id=transaction_id and (get_my_role() in ('admin','muhasebe','proje_koordinatoru') or (get_my_role()='proje_yoneticisi' and has_project_access(ft.project_id)))));
create policy financial_transaction_payments_insert on public.financial_transaction_payments for insert to authenticated with check (get_my_role() in ('admin','muhasebe'));
create policy financial_transaction_payments_update on public.financial_transaction_payments for update to authenticated using (get_my_role() in ('admin','muhasebe')) with check (get_my_role() in ('admin','muhasebe'));
grant select,insert,update on public.financial_transactions,public.financial_transaction_payments to authenticated;
revoke all on public.financial_transactions,public.financial_transaction_payments from anon;
revoke execute on function public.fn_financial_transaction_recalc(),public.fn_financial_transaction_defaults() from public,anon;
grant execute on function public.fn_financial_transaction_recalc(),public.fn_financial_transaction_defaults() to authenticated;
