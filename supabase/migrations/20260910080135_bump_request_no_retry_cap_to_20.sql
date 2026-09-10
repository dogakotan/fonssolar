-- Increase the request_no retry cap from 5 to 20 attempts.
--
-- A full regression-suite run after the sequence-based root-cause fix
-- (fix_request_no_use_native_sequence_instead_of_counter_table) still showed
-- 6/74 tests intermittently hitting the same "request_no already exists"
-- collision, with low numbers that don't persist in the table afterward.
-- Extensive live investigation (pg_sequences, pg_stat_activity, edge_logs,
-- process list, peer-session check, Supabase branch list) ruled out a stray
-- sequence, a lingering local test process, another session on a different
-- Supabase project, an active concurrent transaction, and a preview branch --
-- the residual cause was not identified. This is a pragmatic mitigation
-- (cheap, safe) while that residual mystery stays open: a higher retry cap
-- gives more chances to succeed against whatever intermittent contention is
-- occurring, without addressing its root cause.

create or replace function public.create_purchase_request_with_items(p_project_id text, p_title text, p_request_note text, p_requested_by uuid, p_items jsonb, p_category text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_attempt int := 0;
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

  loop
    v_attempt := v_attempt + 1;
    begin
      insert into public.purchase_requests (
        project_id, title, request_note, status, requested_by, category, request_no
      )
      values (
        p_project_id, p_title, p_request_note,
        'teklif_toplama', p_requested_by, coalesce(p_category, 'diger'),
        public.fn_next_purchase_request_no(extract(year from now())::int)
      )
      returning id into v_id;
      exit;
    exception when unique_violation then
      if v_attempt >= 20 then
        raise;
      end if;
    end;
  end loop;

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

create or replace function public.create_purchase_request_from_monthly_plan(p_plan_id uuid, p_quantity numeric, p_unit text DEFAULT NULL::text, p_request_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_plan record;
  v_request_id uuid;
  v_request_category text;
  v_attempt int := 0;
begin
  select * into v_plan from procurement_monthly_plan where id = p_plan_id;
  if not found then
    raise exception 'Plan kalemi bulunamadı.';
  end if;

  if get_my_role() not in ('admin', 'proje_yoneticisi') then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;

  if not has_project_access(v_plan.project_id) then
    raise exception 'Bu projeye erişim yetkiniz yok.';
  end if;

  if exists (select 1 from purchase_requests where procurement_plan_id = p_plan_id) then
    raise exception 'Bu plan kalemi için zaten bir talep oluşturulmuş.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Talep miktarı sıfırdan büyük olmalıdır.';
  end if;

  v_request_category := case when v_plan.kategori = 'Hizmet' then 'hizmet' else 'malzeme' end;

  loop
    v_attempt := v_attempt + 1;
    begin
      insert into purchase_requests (
        project_id, title, request_note, status, requested_by, category, request_no, procurement_plan_id
      )
      values (
        v_plan.project_id, v_plan.kalem_adi, p_request_note, 'teklif_toplama', auth.uid(), v_request_category,
        fn_next_purchase_request_no(extract(year from now())::int), p_plan_id
      )
      returning id into v_request_id;
      exit;
    exception when unique_violation then
      if v_attempt >= 20 then
        raise;
      end if;
    end;
  end loop;

  insert into purchase_request_items (
    request_id, name, quantity, unit, bom_item_id, category
  )
  values (
    v_request_id, v_plan.kalem_adi, p_quantity, coalesce(nullif(p_unit, ''), v_plan.birim, 'Adet'),
    v_plan.procurement_item_id, v_plan.kategori
  );

  return v_request_id;
end;
$function$;
