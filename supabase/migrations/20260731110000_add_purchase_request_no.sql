-- Kök neden: "SAT-YYYY-XXX" talep kodu DB'de hiç yoktu — 4 farklı frontend
-- dosyası (TabSatinAlmaTalepListesi/TalepDetayModal/MuhasebeSatinAlma/
-- FaturaOlusturModal) bunu bağımsız olarak talebin UUID'sinin son 3-4 hex
-- karakterinden türetiyordu (yalnızca 4096 olası kombinasyon) — bu yüzden
-- farklı taleplerde aynı kod (ör. "SAT-2026-002") tekrar ediyordu. Çözüm:
-- gerçek, UNIQUE, sunucu tarafında atomik üretilen bir request_no kolonu.

create table if not exists public.purchase_request_no_counters (
  year int primary key,
  last_value int not null default 0
);

revoke all on table public.purchase_request_no_counters from public, anon, authenticated;

create or replace function public.fn_next_purchase_request_no(p_year int)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_next int;
begin
  insert into public.purchase_request_no_counters (year, last_value)
  values (p_year, 1)
  on conflict (year) do update set last_value = purchase_request_no_counters.last_value + 1
  returning last_value into v_next;
  return 'SAT-' || p_year || '-' || lpad(v_next::text, 3, '0');
end;
$$;

revoke all on function public.fn_next_purchase_request_no(int) from public, anon, authenticated;

alter table public.purchase_requests add column if not exists request_no text;

-- Mevcut kayıtları oluşturulma sırasına göre geriye dönük doldur.
do $$
declare r record;
begin
  for r in (select id, created_at from public.purchase_requests where request_no is null order by created_at) loop
    update public.purchase_requests
    set request_no = public.fn_next_purchase_request_no(extract(year from r.created_at)::int)
    where id = r.id;
  end loop;
end $$;

alter table public.purchase_requests alter column request_no set not null;
create unique index if not exists purchase_requests_request_no_key on public.purchase_requests (request_no);

-- create_purchase_request_with_items: yeni talepte request_no da üretilsin
-- (imza değişmedi, overload riski yok).
create or replace function public.create_purchase_request_with_items(p_project_id text, p_title text, p_request_note text, p_requested_by uuid, p_items jsonb, p_category text DEFAULT NULL::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
    'talep_olusturuldu', p_requested_by, coalesce(p_category, 'diger'),
    public.fn_next_purchase_request_no(extract(year from now())::int)
  )
  returning id into v_id;

  insert into public.purchase_request_items (
    request_id, name, quantity, unit, unit_price, bom_item_id
  )
  values (
    v_id,
    btrim(p_items->0->>'name'),
    coalesce(nullif(p_items->0->>'quantity', '')::numeric, 1),
    coalesce(p_items->0->>'unit', 'Adet'),
    nullif(p_items->0->>'unit_price', '')::numeric,
    nullif(p_items->0->>'bom_item_id', '')::uuid
  );

  return v_id;
end;
$function$;

-- get_satin_alma_overview / get_satin_alma_overview_all_internal: jsonb
-- çıktısına request_no eklendi (get_purchase_requests_list/get_purchase_request_detail
-- zaten to_jsonb(pr) kullandığından otomatik geliyor, değişiklik gerekmedi).
create or replace function public.get_satin_alma_overview(p_project_id text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
      SELECT jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'request_no', pr.request_no,
        'title', pr.title,
        'status', pr.status,
        'urgency', pr.urgency,
        'category', pr.category,
        'created_at', pr.created_at,
        'updated_at', pr.updated_at,
        'items', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('name', pri.name, 'quantity', pri.quantity, 'unit', pri.unit))
          FROM purchase_request_items pri WHERE pri.request_id = pr.id
        ), '[]'::jsonb)
      ) ORDER BY pr.created_at DESC)
      FROM purchase_requests pr WHERE pr.project_id = p_project_id
    ), '[]'::jsonb),
    'procurement_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pi.id,
        'item_no', pi.item_no,
        'equipment', pi.equipment,
        'category', pi.category,
        'quantity', pi.quantity,
        'unit', pi.unit,
        'status', pi.status,
        'planned_qty', pi.planned_qty,
        'added_qty', COALESCE((
          SELECT SUM(a.delta_qty) FROM procurement_item_adjustments a
          WHERE a.procurement_item_id = pi.id AND a.reversed_at IS NULL
        ), 0),
        'added_via_count', COALESCE((
          SELECT COUNT(DISTINCT a.purchase_request_id) FROM procurement_item_adjustments a
          WHERE a.procurement_item_id = pi.id AND a.reversed_at IS NULL
        ), 0),
        'has_history', (
          EXISTS (SELECT 1 FROM procurement_item_change_requests pcr WHERE pcr.procurement_item_id = pi.id AND pcr.status = 'onaylandi')
          OR EXISTS (SELECT 1 FROM procurement_item_adjustments a WHERE a.procurement_item_id = pi.id AND a.reversed_at IS NULL)
          OR EXISTS (
            SELECT 1 FROM procurement_item_change_requests pcr2
            WHERE pcr2.procurement_item_id IS NULL AND pcr2.status = 'onaylandi'
              AND pcr2.project_id = pi.project_id
              AND lower(trim(pcr2.new_equipment)) = lower(trim(pi.equipment))
          )
        )
      ) ORDER BY pi.item_no NULLS LAST)
      FROM procurement_items pi WHERE pi.project_id = p_project_id
    ), '[]'::jsonb),
    'pending_changes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pcr.id,
        'procurement_item_id', pcr.procurement_item_id,
        'old_planned_qty', pcr.old_planned_qty,
        'new_planned_qty', pcr.new_planned_qty,
        'note', pcr.note,
        'requested_by', pcr.requested_by,
        'requester_name', prf.full_name,
        'requested_at', pcr.requested_at,
        'status', pcr.status,
        'equipment', COALESCE(pi2.equipment, pcr.new_equipment),
        'unit', COALESCE(pi2.unit, pcr.new_unit),
        'is_new', (pcr.procurement_item_id IS NULL)
      ) ORDER BY pcr.requested_at ASC)
      FROM procurement_item_change_requests pcr
      LEFT JOIN profiles prf ON prf.id = pcr.requested_by
      LEFT JOIN procurement_items pi2 ON pi2.id = pcr.procurement_item_id
      WHERE pcr.project_id = p_project_id AND pcr.status = 'bekliyor'
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$function$;

create or replace function public.get_satin_alma_overview_all_internal()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  result jsonb;
  v_scope record;
BEGIN
  SELECT * INTO v_scope FROM get_project_scope(NULL);

  SELECT jsonb_build_object(
    'requests', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'request_no', pr.request_no,
        'title', pr.title,
        'status', pr.status,
        'urgency', pr.urgency,
        'category', pr.category,
        'created_at', pr.created_at,
        'updated_at', pr.updated_at,
        'approved_at', pr.approved_at,
        'project_id', pr.project_id,
        'project_name', p.name,
        'supplier_id', pr.supplier_id,
        'supplier_name', sup.name,
        'estimated_amount_incl_vat', pr.estimated_amount_incl_vat,
        'requester_name', requester.full_name,
        'description', pr.request_note,
        'items', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'name', pri.name, 'quantity', pri.quantity, 'unit', pri.unit,
            'unit_price', pri.unit_price, 'total_price', pri.total_price
          ))
          FROM purchase_request_items pri WHERE pri.request_id = pr.id
        ), '[]'::jsonb)
      ) ORDER BY pr.created_at DESC)
      FROM purchase_requests pr
      LEFT JOIN projects p ON p.id = pr.project_id
      LEFT JOIN suppliers sup ON sup.id = pr.supplier_id
      LEFT JOIN profiles requester ON requester.id = pr.requested_by
      WHERE (v_scope.scope_all OR pr.project_id = ANY(v_scope.project_ids))
    ), '[]'::jsonb),
    'procurement_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pi.id,
        'item_no', pi.item_no,
        'equipment', pi.equipment,
        'category', pi.category,
        'quantity', pi.quantity,
        'unit', pi.unit,
        'status', pi.status,
        'project_id', pi.project_id,
        'project_name', p.name,
        'planned_qty', pi.planned_qty,
        'added_qty', COALESCE((
          SELECT SUM(a.delta_qty) FROM procurement_item_adjustments a
          WHERE a.procurement_item_id = pi.id AND a.reversed_at IS NULL
        ), 0),
        'added_via_count', COALESCE((
          SELECT COUNT(DISTINCT a.purchase_request_id) FROM procurement_item_adjustments a
          WHERE a.procurement_item_id = pi.id AND a.reversed_at IS NULL
        ), 0)
      ) ORDER BY p.name NULLS LAST, pi.item_no NULLS LAST)
      FROM procurement_items pi
      LEFT JOIN projects p ON p.id = pi.project_id
      WHERE (v_scope.scope_all OR pi.project_id = ANY(v_scope.project_ids))
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$function$;
