-- 1) approver_role kolonu: bu talebin gercekte hangi role onaya dustugunu tutar.
--    Varsayilan 'admin' (mevcut davranis, geriye donuk uyumlu) - yalnizca Osman
--    Karadogan/Cem Aslan admin hesaplarindan acilan taleplerde 'proje_yoneticisi'
--    olarak set edilir (bkz. asagidaki create_* fonksiyonlari).
alter table public.procurement_item_change_requests
  add column approver_role text not null default 'admin'
  check (approver_role in ('admin', 'proje_yoneticisi'));

-- 2) create_procurement_item_change_request: approver_role hesapla, insert'e ekle,
--    notify_role'u hardcoded 'admin' yerine hesaplanan role'e gonder.
create or replace function public.create_procurement_item_change_request(p_procurement_item_id uuid, p_new_planned_qty numeric, p_note text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_project_id text;
  v_old_qty numeric;
  v_id uuid;
  v_approver_role text;
begin
  if p_new_planned_qty is null or p_new_planned_qty <= 0 then
    raise exception 'Planlanan miktar sıfırdan büyük olmalıdır.';
  end if;

  select project_id, planned_qty into v_project_id, v_old_qty
  from public.procurement_items
  where id = p_procurement_item_id;

  if v_project_id is null then
    raise exception 'Malzeme kalemi bulunamadı';
  end if;

  if not public.has_project_access(v_project_id)
     or public.get_my_role() not in ('admin', 'proje_yoneticisi') then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;

  if exists (
    select 1
    from public.procurement_item_change_requests
    where procurement_item_id = p_procurement_item_id
      and status = 'bekliyor'
  ) then
    raise exception 'Bu malzeme için zaten onay bekleyen bir değişiklik talebi var.';
  end if;

  -- Osman Karadoğan / Cem Aslan admin hesaplarından açılan talepler kendi
  -- rolleri (admin) yerine proje yöneticisine onaya düşer (kullanıcı isteği,
  -- 09.09.2026) - bu iki hesap fiilen saha/proje yönetimi işlevi görüyor,
  -- kendi taleplerinin yine admin rolünce onaylanması gerçek bir ikinci göz
  -- sağlamıyordu.
  v_approver_role := case
    when auth.uid() in ('c87088e5-40b2-4d04-9403-1b22babbc31e', '30431df3-a9ae-4f06-9031-335488f8f656')
    then 'proje_yoneticisi'
    else 'admin'
  end;

  insert into public.procurement_item_change_requests (
    procurement_item_id, project_id, old_planned_qty,
    new_planned_qty, note, requested_by, approver_role
  ) values (
    p_procurement_item_id, v_project_id, v_old_qty,
    p_new_planned_qty, p_note, auth.uid(), v_approver_role
  )
  returning id into v_id;

  perform public.notify_role(
    v_approver_role, auth.uid(), v_project_id, 'procurement_item_change_request', v_id, 'pending',
    'Malzeme miktarı değişikliği onay bekliyor',
    format(
      'Planlanan miktar %s → %s olarak değiştirilmek isteniyor.',
      coalesce(v_old_qty::text, '—'),
      p_new_planned_qty::text
    )
  );

  return v_id;
end;
$function$;

-- 3) create_procurement_item_add_request: ayni approver_role mantigi.
create or replace function public.create_procurement_item_add_request(p_project_id text, p_equipment text, p_unit text, p_category text, p_planned_qty numeric, p_note text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_equipment text;
  v_id uuid;
  v_approver_role text;
begin
  if not public.has_project_access(p_project_id)
     or public.get_my_role() not in ('admin', 'proje_yoneticisi') then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;

  v_equipment := trim(p_equipment);
  if coalesce(v_equipment, '') = '' then
    raise exception 'Malzeme adı zorunludur.';
  end if;

  if p_planned_qty is null or p_planned_qty <= 0 then
    raise exception 'Planlanan miktar sıfırdan büyük olmalıdır.';
  end if;

  if exists (
    select 1
    from public.procurement_items
    where project_id = p_project_id
      and lower(btrim(equipment)) = lower(btrim(v_equipment))
  ) then
    raise exception 'Bu projede aynı isimde bir malzeme zaten bulunuyor.';
  end if;

  if exists (
    select 1
    from public.procurement_item_change_requests
    where project_id = p_project_id
      and procurement_item_id is null
      and status = 'bekliyor'
      and lower(btrim(new_equipment)) = lower(btrim(v_equipment))
  ) then
    raise exception 'Bu malzeme için zaten onay bekleyen bir ekleme talebi var.';
  end if;

  -- bkz. create_procurement_item_change_request'teki aynı yorum.
  v_approver_role := case
    when auth.uid() in ('c87088e5-40b2-4d04-9403-1b22babbc31e', '30431df3-a9ae-4f06-9031-335488f8f656')
    then 'proje_yoneticisi'
    else 'admin'
  end;

  insert into public.procurement_item_change_requests (
    procurement_item_id, project_id, old_planned_qty,
    new_planned_qty, note, requested_by,
    new_equipment, new_unit, new_category, approver_role
  ) values (
    null, p_project_id, null,
    p_planned_qty, p_note, auth.uid(),
    v_equipment, nullif(trim(p_unit), ''), nullif(trim(p_category), ''), v_approver_role
  )
  returning id into v_id;

  perform public.notify_role(
    v_approver_role, auth.uid(), p_project_id, 'procurement_item_change_request', v_id, 'pending',
    'Yeni malzeme ekleme talebi onay bekliyor',
    format(
      '%s (%s %s) malzeme listesine eklenmek isteniyor.',
      v_equipment,
      p_planned_qty::text,
      coalesce(nullif(trim(p_unit), ''), '')
    )
  );

  return v_id;
end;
$function$;

-- 4) review_procurement_item_change_request: rol kontrolu artik sabit 'admin'
--    degil, talebin approver_role'une gore (admin her zaman gozetim amaciyla
--    onaylayabilir, ek olarak approver_role'e esit role sahip kullanici da).
create or replace function public.review_procurement_item_change_request(p_id uuid, p_approve boolean, p_review_note text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_row procurement_item_change_requests%rowtype;
  v_new_item_id uuid;
  v_current_qty numeric;
begin
  select * into v_row from procurement_item_change_requests where id = p_id for update;
  if v_row.id is null then
    raise exception 'Talep bulunamadı';
  end if;

  if get_my_role() not in ('admin', v_row.approver_role) then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;

  if v_row.status <> 'bekliyor' then
    raise exception 'Bu talep zaten sonuçlandırılmış.';
  end if;

  if p_approve and v_row.procurement_item_id is not null then
    select planned_qty into v_current_qty
    from procurement_items where id = v_row.procurement_item_id for update;

    if v_current_qty is distinct from v_row.old_planned_qty then
      raise exception 'Bu malzemenin planlanan miktarı talep oluşturulduktan sonra değişti (talep anında: %, şu an: %). Talebi reddedip güncel miktarla yeniden oluşturun.',
        coalesce(v_row.old_planned_qty::text, '—'), coalesce(v_current_qty::text, '—');
    end if;
  end if;

  update procurement_item_change_requests
  set status = case when p_approve then 'onaylandi' else 'reddedildi' end,
      reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_review_note
  where id = p_id;

  if p_approve then
    if v_row.procurement_item_id is not null then
      update procurement_items
      set planned_qty = v_row.new_planned_qty, quantity = v_row.new_planned_qty::text, updated_at = now()
      where id = v_row.procurement_item_id;
    else
      insert into procurement_items (project_id, equipment, unit, category, planned_qty, quantity)
      values (v_row.project_id, v_row.new_equipment, v_row.new_unit, v_row.new_category, v_row.new_planned_qty, v_row.new_planned_qty::text)
      returning id into v_new_item_id;
    end if;

    perform fn_recompute_auto_risks(v_row.project_id, true);
  end if;

  perform notify_user(
    v_row.requested_by, auth.uid(), v_row.project_id, 'procurement_item_change_request', p_id,
    case when p_approve then 'approved' else 'rejected' end,
    case when p_approve then
      (case when v_row.procurement_item_id is null then 'Yeni malzeme ekleme onaylandı' else 'Malzeme miktarı değişikliği onaylandı' end)
    else
      (case when v_row.procurement_item_id is null then 'Yeni malzeme ekleme reddedildi' else 'Malzeme miktarı değişikliği reddedildi' end)
    end,
    coalesce(p_review_note, '')
  );
end;
$function$;

-- 5) get_satin_alma_overview: pending_changes ciktisina approver_role eklenir
--    (frontend hangi rolun bu talebi onaylayabilecegini bilsin diye).
create or replace function public.get_satin_alma_overview(p_project_id text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  result jsonb;
  v_scope record;
begin
  select * into v_scope from get_project_scope(p_project_id);
  if not v_scope.authorized then
    return jsonb_build_object('authorized', false);
  end if;

  select jsonb_build_object(
    'authorized', true,
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'request_no', pr.request_no,
        'title', pr.title,
        'status', pr.status,
        'urgency', pr.urgency,
        'category', pr.category,
        'created_at', pr.created_at,
        'updated_at', pr.updated_at,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object('id', pri.id, 'name', pri.name, 'quantity', pri.quantity, 'unit', pri.unit, 'bom_item_id', pri.bom_item_id))
          from purchase_request_items pri where pri.request_id = pr.id
        ), '[]'::jsonb)
      ) order by pr.created_at desc)
      from purchase_requests pr where pr.project_id = p_project_id
    ), '[]'::jsonb),
    'procurement_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pi.id,
        'item_no', pi.item_no,
        'equipment', pi.equipment,
        'category', pi.category,
        'quantity', pi.quantity,
        'unit', pi.unit,
        'planned_qty', pi.planned_qty,
        'added_qty', coalesce((
          select sum(a.delta_qty) from procurement_item_adjustments a
          where a.procurement_item_id = pi.id and a.reversed_at is null
        ), 0),
        'added_via_count', coalesce((
          select count(distinct a.purchase_request_id) from procurement_item_adjustments a
          where a.procurement_item_id = pi.id and a.reversed_at is null
        ), 0),
        'has_history', (
          exists (select 1 from procurement_item_change_requests pcr where pcr.procurement_item_id = pi.id and pcr.status = 'onaylandi')
          or exists (select 1 from procurement_item_adjustments a where a.procurement_item_id = pi.id and a.reversed_at is null)
          or exists (
            select 1 from procurement_item_change_requests pcr2
            where pcr2.procurement_item_id is null and pcr2.status = 'onaylandi'
              and pcr2.project_id = pi.project_id
              and lower(trim(pcr2.new_equipment)) = lower(trim(pi.equipment))
          )
        )
      ) order by pi.item_no nulls last)
      from procurement_items pi where pi.project_id = p_project_id
    ), '[]'::jsonb),
    'pending_changes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pcr.id,
        'procurement_item_id', pcr.procurement_item_id,
        'old_planned_qty', pcr.old_planned_qty,
        'new_planned_qty', pcr.new_planned_qty,
        'note', pcr.note,
        'requested_by', pcr.requested_by,
        'requester_name', prf.full_name,
        'requested_at', pcr.requested_at,
        'status', pcr.status,
        'equipment', coalesce(pi2.equipment, pcr.new_equipment),
        'unit', coalesce(pi2.unit, pcr.new_unit),
        'is_new', (pcr.procurement_item_id is null),
        'approver_role', pcr.approver_role
      ) order by pcr.requested_at asc)
      from procurement_item_change_requests pcr
      left join profiles prf on prf.id = pcr.requested_by
      left join procurement_items pi2 on pi2.id = pcr.procurement_item_id
      where pcr.project_id = p_project_id and pcr.status = 'bekliyor'
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$function$;
