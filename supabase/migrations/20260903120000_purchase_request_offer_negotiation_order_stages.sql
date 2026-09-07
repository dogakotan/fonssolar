-- Satın alma sürecine 3 aşamalı akış eklenir: Teklif Toplama -> Pazarlık Onayı
-- (admin) -> Pazarlık -> Sipariş -> satin_alindi (mevcut fatura akışına AYNEN
-- bağlanır, hiç değişmedi). Eski akış (talep_olusturuldu/fiyat_girildi/
-- onay_bekliyor/onaylandi ve bunları yöneten RPC'ler) DOKUNULMADAN kalır —
-- yalnızca create_purchase_request_with_items artık yeni talepleri doğrudan
-- 'teklif_toplama' ile açıyor. bkz. C:\Users\fonss\.claude\plans\modular-nibbling-fox.md

-- ============================================================
-- 1) Yeni tablo: purchase_offers (teklifler)
-- ============================================================
create table public.purchase_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.purchase_requests(id) on delete cascade,
  supplier_id uuid references public.suppliers(id),
  supplier_name_freetext text,
  amount numeric not null check (amount >= 0),
  currency text not null default 'TRY' check (currency in ('TRY','USD','EUR')),
  valid_until date,
  notes text,
  storage_path text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint purchase_offers_supplier_or_freetext check (
    supplier_id is not null or coalesce(btrim(supplier_name_freetext), '') <> ''
  )
);

alter table public.purchase_offers enable row level security;

-- Yazma yok: insert/delete yalnızca aşağıdaki SECURITY DEFINER RPC'ler üzerinden
-- (RLS'i bypass ederler) — hiçbir client doğrudan tabloya yazamaz.
create policy purchase_offers_select on public.purchase_offers
for select
using (
  exists (
    select 1 from public.purchase_requests pr
    where pr.id = purchase_offers.request_id
      and public.has_project_access(pr.project_id)
  )
);

-- ============================================================
-- 2) purchase_requests: yeni kolonlar + genişletilmiş status CHECK
-- ============================================================
alter table public.purchase_requests
  add column selected_offer_id uuid references public.purchase_offers(id),
  add column negotiated_amount numeric,
  add column negotiated_currency text default 'TRY',
  add column negotiation_notes text,
  add column negotiated_by uuid references auth.users(id),
  add column negotiated_at timestamptz,
  add column order_date date,
  add column stage_rejection_note text,
  add column stage_approved_by uuid references auth.users(id),
  add column stage_approved_at timestamptz;

alter table public.purchase_requests
  add constraint purchase_requests_negotiated_currency_allowlist
  check (negotiated_currency in ('TRY','USD','EUR'));

alter table public.purchase_requests
  add constraint purchase_requests_negotiated_amount_nonneg
  check (negotiated_amount is null or negotiated_amount >= 0);

alter table public.purchase_requests
  drop constraint purchase_requests_status_check;

alter table public.purchase_requests
  add constraint purchase_requests_status_check
  check (status = any (array[
    -- eski akış (geriye dönük uyumluluk, artık yeni satır ÜRETMİYOR ama eski satırlar geçerli kalır)
    'talep_olusturuldu','fiyat_girildi','onay_bekliyor','onaylandi',
    'reddedildi','satin_alindi','fatura_bekliyor','fatura_onay_bekliyor',
    'faturasi_kesildi','iptal',
    -- yeni 3 aşamalı akış
    'teklif_toplama','pazarlik_onay_bekliyor','pazarlik','siparis'
  ]));

-- ============================================================
-- 3) Storage bucket: teklif-ekleri (ticket-ekleri ile birebir aynı desen)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('teklif-ekleri', 'teklif-ekleri', false)
on conflict (id) do nothing;

create policy storage_insert_teklif on storage.objects
for insert
with check (
  bucket_id = 'teklif-ekleri'
  and auth.uid() is not null
  and exists (
    select 1 from public.purchase_requests pr
    where pr.id = (storage.foldername(objects.name))[1]::uuid
      and public.has_project_access(pr.project_id)
  )
);

create policy storage_select_teklif on storage.objects
for select
using (
  bucket_id = 'teklif-ekleri'
  and exists (
    select 1
    from public.purchase_offers po
    join public.purchase_requests pr on pr.id = po.request_id
    where po.storage_path = objects.name
      and public.has_project_access(pr.project_id)
  )
);

create policy storage_delete_teklif on storage.objects
for delete
using (
  bucket_id = 'teklif-ekleri'
  and auth.uid() is not null
  and exists (
    select 1 from public.purchase_requests pr
    where pr.id = (storage.foldername(objects.name))[1]::uuid
      and public.has_project_access(pr.project_id)
  )
);

-- ============================================================
-- 4) Yeni RPC'ler (proje yöneticisi yürütür, admin pazarlık kapısını onaylar)
-- ============================================================

create or replace function public.add_purchase_offer(
  p_request_id uuid,
  p_supplier_id uuid default null,
  p_supplier_name_freetext text default null,
  p_amount numeric default null,
  p_currency text default 'TRY',
  p_valid_until date default null,
  p_notes text default null,
  p_storage_path text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_request public.purchase_requests%rowtype;
  v_offer_id uuid;
begin
  if v_actor is null then
    raise exception 'Oturum açmanız gerekiyor.';
  end if;

  if public.get_my_role() not in ('proje_yoneticisi', 'admin') then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;

  select * into v_request from public.purchase_requests where id = p_request_id for update;
  if not found then
    raise exception 'Satın alma talebi bulunamadı.';
  end if;

  if not public.has_project_access(v_request.project_id) then
    raise exception 'Bu projeye erişim yetkiniz yok.';
  end if;

  if v_request.status <> 'teklif_toplama' then
    raise exception 'Teklif yalnızca teklif toplama aşamasında eklenebilir.';
  end if;

  if p_amount is null or p_amount < 0 then
    raise exception 'Teklif tutarı sıfır veya daha büyük olmalıdır.';
  end if;

  if p_currency not in ('TRY','USD','EUR') then
    raise exception 'Geçersiz para birimi.';
  end if;

  if p_supplier_id is null and coalesce(btrim(p_supplier_name_freetext), '') = '' then
    raise exception 'Tedarikçi seçin veya tedarikçi adı girin.';
  end if;

  if p_supplier_id is not null and not exists (select 1 from public.suppliers where id = p_supplier_id) then
    raise exception 'Seçilen tedarikçi bulunamadı.';
  end if;

  insert into public.purchase_offers (
    request_id, supplier_id, supplier_name_freetext, amount, currency,
    valid_until, notes, storage_path, created_by
  ) values (
    p_request_id, p_supplier_id, nullif(btrim(p_supplier_name_freetext), ''), p_amount, p_currency,
    p_valid_until, p_notes, p_storage_path, v_actor
  )
  returning id into v_offer_id;

  return v_offer_id;
end;
$function$;

grant execute on function public.add_purchase_offer(uuid, uuid, text, numeric, text, date, text, text) to authenticated;
revoke execute on function public.add_purchase_offer(uuid, uuid, text, numeric, text, date, text, text) from public, anon;


create or replace function public.delete_purchase_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_offer public.purchase_offers%rowtype;
  v_request public.purchase_requests%rowtype;
begin
  if v_actor is null then
    raise exception 'Oturum açmanız gerekiyor.';
  end if;

  if public.get_my_role() not in ('proje_yoneticisi', 'admin') then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;

  select * into v_offer from public.purchase_offers where id = p_offer_id;
  if not found then
    raise exception 'Teklif bulunamadı.';
  end if;

  select * into v_request from public.purchase_requests where id = v_offer.request_id for update;

  if not public.has_project_access(v_request.project_id) then
    raise exception 'Bu projeye erişim yetkiniz yok.';
  end if;

  if v_request.status <> 'teklif_toplama' then
    raise exception 'Teklif yalnızca teklif toplama aşamasında silinebilir.';
  end if;

  delete from public.purchase_offers where id = p_offer_id;
end;
$function$;

grant execute on function public.delete_purchase_offer(uuid) to authenticated;
revoke execute on function public.delete_purchase_offer(uuid) from public, anon;


create or replace function public.submit_purchase_request_for_negotiation(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_request public.purchase_requests%rowtype;
begin
  if v_actor is null then
    raise exception 'Oturum açmanız gerekiyor.';
  end if;

  if public.get_my_role() <> 'proje_yoneticisi' then
    raise exception 'Bu işlemi yalnızca proje yöneticisi yapabilir.';
  end if;

  select * into v_request from public.purchase_requests where id = p_request_id for update;
  if not found then
    raise exception 'Satın alma talebi bulunamadı.';
  end if;

  if not public.has_project_access(v_request.project_id) then
    raise exception 'Bu projeye erişim yetkiniz yok.';
  end if;

  if v_request.status <> 'teklif_toplama' then
    raise exception 'Yalnızca teklif toplama aşamasındaki talepler pazarlık onayına gönderilebilir.';
  end if;

  update public.purchase_requests
  set status = 'pazarlik_onay_bekliyor',
      stage_rejection_note = null,
      updated_at = now()
  where id = p_request_id;

  return jsonb_build_object('request_id', p_request_id, 'status', 'pazarlik_onay_bekliyor');
end;
$function$;

grant execute on function public.submit_purchase_request_for_negotiation(uuid) to authenticated;
revoke execute on function public.submit_purchase_request_for_negotiation(uuid) from public, anon;


create or replace function public.review_purchase_request_negotiation_gate(
  p_request_id uuid,
  p_approve boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_request public.purchase_requests%rowtype;
  v_next_status text;
begin
  if v_actor is null then
    raise exception 'Oturum açmanız gerekiyor.';
  end if;

  if public.get_my_role() <> 'admin' then
    raise exception 'Bu işlemi yalnızca yönetici yapabilir.';
  end if;

  select * into v_request from public.purchase_requests where id = p_request_id for update;
  if not found then
    raise exception 'Satın alma talebi bulunamadı.';
  end if;

  if v_request.status <> 'pazarlik_onay_bekliyor' then
    raise exception 'Bu talep şu anda pazarlık onayı beklemiyor.';
  end if;

  if not p_approve and coalesce(btrim(p_note), '') = '' then
    raise exception 'Red için açıklama girmelisiniz.';
  end if;

  v_next_status := case when p_approve then 'pazarlik' else 'teklif_toplama' end;

  update public.purchase_requests
  set status = v_next_status,
      stage_approved_by = case when p_approve then v_actor else stage_approved_by end,
      stage_approved_at = case when p_approve then now() else stage_approved_at end,
      stage_rejection_note = case when p_approve then null else p_note end,
      updated_at = now()
  where id = p_request_id;

  return jsonb_build_object('request_id', p_request_id, 'status', v_next_status);
end;
$function$;

grant execute on function public.review_purchase_request_negotiation_gate(uuid, boolean, text) to authenticated;
revoke execute on function public.review_purchase_request_negotiation_gate(uuid, boolean, text) from public, anon;


create or replace function public.save_purchase_request_negotiation(
  p_request_id uuid,
  p_selected_offer_id uuid,
  p_negotiated_amount numeric,
  p_negotiated_currency text default 'TRY',
  p_negotiation_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_request public.purchase_requests%rowtype;
begin
  if v_actor is null then
    raise exception 'Oturum açmanız gerekiyor.';
  end if;

  if public.get_my_role() <> 'proje_yoneticisi' then
    raise exception 'Bu işlemi yalnızca proje yöneticisi yapabilir.';
  end if;

  select * into v_request from public.purchase_requests where id = p_request_id for update;
  if not found then
    raise exception 'Satın alma talebi bulunamadı.';
  end if;

  if not public.has_project_access(v_request.project_id) then
    raise exception 'Bu projeye erişim yetkiniz yok.';
  end if;

  if v_request.status <> 'pazarlik' then
    raise exception 'Yalnızca pazarlık aşamasındaki talepler için pazarlık bilgisi kaydedilebilir.';
  end if;

  if p_selected_offer_id is not null and not exists (
    select 1 from public.purchase_offers where id = p_selected_offer_id and request_id = p_request_id
  ) then
    raise exception 'Seçilen teklif bu talebe ait değil.';
  end if;

  if p_negotiated_currency not in ('TRY','USD','EUR') then
    raise exception 'Geçersiz para birimi.';
  end if;

  update public.purchase_requests
  set selected_offer_id = p_selected_offer_id,
      negotiated_amount = p_negotiated_amount,
      negotiated_currency = coalesce(p_negotiated_currency, 'TRY'),
      negotiation_notes = p_negotiation_notes,
      negotiated_by = v_actor,
      negotiated_at = now(),
      updated_at = now()
  where id = p_request_id;

  return jsonb_build_object('request_id', p_request_id);
end;
$function$;

grant execute on function public.save_purchase_request_negotiation(uuid, uuid, numeric, text, text) to authenticated;
revoke execute on function public.save_purchase_request_negotiation(uuid, uuid, numeric, text, text) from public, anon;


create or replace function public.advance_purchase_request_to_order(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_request public.purchase_requests%rowtype;
begin
  if v_actor is null then
    raise exception 'Oturum açmanız gerekiyor.';
  end if;

  if public.get_my_role() <> 'proje_yoneticisi' then
    raise exception 'Bu işlemi yalnızca proje yöneticisi yapabilir.';
  end if;

  select * into v_request from public.purchase_requests where id = p_request_id for update;
  if not found then
    raise exception 'Satın alma talebi bulunamadı.';
  end if;

  if not public.has_project_access(v_request.project_id) then
    raise exception 'Bu projeye erişim yetkiniz yok.';
  end if;

  if v_request.status <> 'pazarlik' then
    raise exception 'Yalnızca pazarlık aşamasındaki talepler siparişe geçirilebilir.';
  end if;

  if v_request.selected_offer_id is null then
    raise exception 'Siparişe geçmeden önce kazanan teklifi seçmelisiniz.';
  end if;

  update public.purchase_requests
  set status = 'siparis',
      updated_at = now()
  where id = p_request_id;

  return jsonb_build_object('request_id', p_request_id, 'status', 'siparis');
end;
$function$;

grant execute on function public.advance_purchase_request_to_order(uuid) to authenticated;
revoke execute on function public.advance_purchase_request_to_order(uuid) from public, anon;


create or replace function public.save_purchase_request_order(
  p_request_id uuid,
  p_quantity numeric,
  p_unit_price numeric,
  p_order_date date default null,
  p_supplier_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_request public.purchase_requests%rowtype;
begin
  if v_actor is null then
    raise exception 'Oturum açmanız gerekiyor.';
  end if;

  if public.get_my_role() <> 'proje_yoneticisi' then
    raise exception 'Bu işlemi yalnızca proje yöneticisi yapabilir.';
  end if;

  select * into v_request from public.purchase_requests where id = p_request_id for update;
  if not found then
    raise exception 'Satın alma talebi bulunamadı.';
  end if;

  if not public.has_project_access(v_request.project_id) then
    raise exception 'Bu projeye erişim yetkiniz yok.';
  end if;

  if v_request.status <> 'siparis' then
    raise exception 'Yalnızca sipariş aşamasındaki talepler için sipariş bilgisi kaydedilebilir.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Miktar sıfırdan büyük olmalıdır.';
  end if;

  if p_unit_price is null or p_unit_price < 0 then
    raise exception 'Birim fiyat sıfır veya daha büyük olmalıdır.';
  end if;

  if p_supplier_id is not null and not exists (select 1 from public.suppliers where id = p_supplier_id) then
    raise exception 'Seçilen tedarikçi bulunamadı.';
  end if;

  update public.purchase_request_items
  set quantity = p_quantity,
      unit_price = p_unit_price,
      total_price = p_quantity * p_unit_price
  where request_id = p_request_id;

  update public.purchase_requests
  set order_date = coalesce(p_order_date, order_date, current_date),
      supplier_id = coalesce(p_supplier_id, supplier_id),
      updated_at = now()
  where id = p_request_id;

  return jsonb_build_object('request_id', p_request_id);
end;
$function$;

grant execute on function public.save_purchase_request_order(uuid, numeric, numeric, date, uuid) to authenticated;
revoke execute on function public.save_purchase_request_order(uuid, numeric, numeric, date, uuid) from public, anon;


create or replace function public.complete_purchase_request_delivery(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_request public.purchase_requests%rowtype;
begin
  if v_actor is null then
    raise exception 'Oturum açmanız gerekiyor.';
  end if;

  if public.get_my_role() <> 'proje_yoneticisi' then
    raise exception 'Bu işlemi yalnızca proje yöneticisi yapabilir.';
  end if;

  select * into v_request from public.purchase_requests where id = p_request_id for update;
  if not found then
    raise exception 'Satın alma talebi bulunamadı.';
  end if;

  if not public.has_project_access(v_request.project_id) then
    raise exception 'Bu projeye erişim yetkiniz yok.';
  end if;

  if v_request.status <> 'siparis' then
    raise exception 'Yalnızca sipariş aşamasındaki talepler teslim alınarak tamamlanabilir.';
  end if;

  if not exists (
    select 1 from public.purchase_request_items
    where request_id = p_request_id and coalesce(unit_price, 0) > 0
  ) then
    raise exception 'Tamamlamadan önce sipariş adet/fiyat bilgisini kaydetmelisiniz.';
  end if;

  update public.purchase_requests
  set status = 'satin_alindi',
      purchase_date = coalesce(purchase_date, current_date),
      purchased_by = v_actor,
      updated_at = now()
  where id = p_request_id;

  return jsonb_build_object('request_id', p_request_id, 'project_id', v_request.project_id, 'status', 'satin_alindi');
end;
$function$;

grant execute on function public.complete_purchase_request_delivery(uuid) to authenticated;
revoke execute on function public.complete_purchase_request_delivery(uuid) from public, anon;

-- ============================================================
-- 5) create_purchase_request_with_items: yeni talepler artık doğrudan
--    'teklif_toplama' ile açılır (tek satır değişikliği, imza AYNI)
-- ============================================================
create or replace function public.create_purchase_request_with_items(p_project_id text, p_title text, p_request_note text, p_requested_by uuid, p_items jsonb, p_category text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if p_requested_by is distinct from auth.uid() then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;

  if p_project_id is null or btrim(p_project_id) = '' then
    raise exception 'Proje seçimi zorunludur.';
  end if;

  if not exists (
    select 1 from public.projects where id = p_project_id
  ) then
    raise exception 'Seçilen proje bulunamadı.';
  end if;

  if not public.has_project_access(p_project_id) then
    raise exception 'Bu projeye erişim yetkiniz yok.';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) <> 1 then
    raise exception 'Her satın alma talebi tam olarak bir kalem içermelidir.';
  end if;

  if coalesce(btrim(p_items->0->>'name'), '') = '' then
    raise exception 'Talep kalemi adı zorunludur.';
  end if;

  if coalesce(nullif(p_items->0->>'quantity', '')::numeric, 0) <= 0 then
    raise exception 'Talep miktarı sıfırdan büyük olmalıdır.';
  end if;

  insert into public.purchase_requests (
    project_id, title, request_note, status, requested_by, category, request_no
  )
  values (
    p_project_id, p_title, p_request_note,
    'teklif_toplama', p_requested_by, coalesce(p_category, 'diger'),
    public.fn_next_purchase_request_no(extract(year from now())::int)
  )
  returning id into v_id;

  insert into public.purchase_request_items (
    request_id, name, quantity, unit, unit_price, bom_item_id, category
  )
  values (
    v_id,
    btrim(p_items->0->>'name'),
    coalesce(nullif(p_items->0->>'quantity', '')::numeric, 1),
    coalesce(p_items->0->>'unit', 'Adet'),
    nullif(p_items->0->>'unit_price', '')::numeric,
    nullif(p_items->0->>'bom_item_id', '')::uuid,
    nullif(btrim(p_items->0->>'material_category'), '')
  );

  return v_id;
end;
$function$;

-- ============================================================
-- 6) Bildirim trigger'ları: yeni aşamalar için genişletme
-- ============================================================
create or replace function public.trg_notify_purchase_request_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'teklif_toplama' then
    perform public.notify_role('proje_yoneticisi',new.requested_by,new.project_id,'purchase_request',new.id,'created',
      'Yeni satın alma talebi: '||new.title,'Teklif toplama aşamasında.');
  else
    perform public.notify_role('admin',new.requested_by,new.project_id,'purchase_request',new.id,'created',
      'Yeni satın alma talebi: '||new.title,'Talep yönetici onayı bekliyor.');
  end if;
  return new;
end;
$function$;

create or replace function public.trg_notify_purchase_request_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    elsif new.status = 'pazarlik_onay_bekliyor' then
      perform public.notify_role(
        'admin', auth.uid(), new.project_id,
        'purchase_request', new.id, 'status_changed',
        'Pazarlık onayı bekleyen talep: ' || new.title,
        'Teklifler yüklendi, pazarlık aşamasına geçiş onayınızı bekliyor.'
      );
    elsif new.status = 'pazarlik' and old.status = 'pazarlik_onay_bekliyor' then
      perform public.notify_role(
        'proje_yoneticisi', auth.uid(), new.project_id,
        'purchase_request', new.id, 'status_changed',
        'Pazarlık onaylandı: ' || new.title,
        'Yönetici onayladı, pazarlık aşamasına geçebilirsiniz.'
      );
    elsif new.status = 'teklif_toplama' and old.status = 'pazarlik_onay_bekliyor' then
      perform public.notify_role(
        'proje_yoneticisi', auth.uid(), new.project_id,
        'purchase_request', new.id, 'status_changed',
        'Pazarlık onayı reddedildi: ' || new.title,
        coalesce(new.stage_rejection_note, 'Yönetici talebi teklif toplama aşamasına geri gönderdi.')
      );
    end if;
  end if;
  return new;
end;
$function$;

-- ============================================================
-- 7) Liste/detay RPC'lerine teklif verisi eklenmesi (additive)
-- ============================================================
create or replace function public.get_purchase_request_detail_internal(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_project_id text;
  v_scope record;
BEGIN
  SELECT project_id INTO v_project_id FROM purchase_requests WHERE id = p_id;
  IF v_project_id IS NULL THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  SELECT * INTO v_scope FROM get_project_scope(v_project_id);
  IF NOT v_scope.authorized THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  SELECT jsonb_build_object(
    'authorized', true,
    'request', to_jsonb(pr) || jsonb_build_object(
      'items', COALESCE((
        SELECT jsonb_agg(to_jsonb(pri) ORDER BY pri.id)
        FROM purchase_request_items pri WHERE pri.request_id = pr.id
      ), '[]'::jsonb),
      'offers', COALESCE((
        SELECT jsonb_agg(to_jsonb(po) ORDER BY po.created_at)
        FROM purchase_offers po WHERE po.request_id = pr.id
      ), '[]'::jsonb),
      'requester_name', prf.full_name,
      'suppliers', jsonb_build_object('name', sup.name)
    )
  ) INTO result
  FROM purchase_requests pr
  LEFT JOIN profiles prf ON prf.id = pr.requested_by
  LEFT JOIN suppliers sup ON sup.id = pr.supplier_id
  WHERE pr.id = p_id;

  RETURN result;
END;
$function$;

create or replace function public.get_purchase_requests_list_internal(p_project_id text DEFAULT NULL::text, p_filter_date date DEFAULT NULL::date, p_only_pending boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_scope record;
BEGIN
  SELECT * INTO v_scope FROM get_project_scope(p_project_id);
  IF NOT v_scope.authorized THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  SELECT jsonb_build_object(
    'authorized', true,
    'requests', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(pr) || jsonb_build_object(
          'items', COALESCE((
            SELECT jsonb_agg(to_jsonb(pri) ORDER BY pri.id)
            FROM purchase_request_items pri WHERE pri.request_id = pr.id
          ), '[]'::jsonb),
          'offer_count', (SELECT count(*) FROM purchase_offers po WHERE po.request_id = pr.id),
          'requester_name', prf.full_name,
          'project_name', proj.name
        )
        ORDER BY pr.created_at DESC
      )
      FROM purchase_requests pr
      LEFT JOIN profiles prf ON prf.id = pr.requested_by
      LEFT JOIN projects proj ON proj.id = pr.project_id
      WHERE
        CASE
          WHEN p_project_id IS NOT NULL THEN
            pr.project_id = p_project_id
            AND pr.created_at <= (COALESCE(p_filter_date, CURRENT_DATE) + 1)::timestamptz - interval '1 second'
          ELSE
            (v_scope.scope_all OR pr.project_id = ANY(v_scope.project_ids))
        END
        AND (NOT p_only_pending OR pr.status IN ('bekliyor', 'beklemede', 'talep_olusturuldu', 'talep_oluşturuldu', 'pazarlik_onay_bekliyor'))
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$function$;
