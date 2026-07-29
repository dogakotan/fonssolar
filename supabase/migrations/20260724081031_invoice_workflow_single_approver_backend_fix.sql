-- ============================================================================
-- Fatura akışı: tek onaylayıcı (proje yöneticisi/"Yönetici") modeline geçişten
-- kalan davranışsal boşlukları kapatır. Şema (kolonlar/constraint/2 yeni
-- trigger) zaten canlıda mevcuttu (20260724072957); bu migration onun üstüne
-- gelen düzeltme katmanı — bkz. plan dosyası "Part 1".
-- ============================================================================

-- A) Ölü/çakışan trigger: her INSERT'te faturayı zorla yönetici_onayında'ya
-- iten eski tek-adımlı zincir başlatıcı. taslak akışını imkânsız kılıyordu.
drop trigger if exists invoice_approval_chain_trigger on public.invoices;
drop function if exists public.create_invoice_approval_chain();

-- B) Erken/yanlış-rollü bildirim: her INSERT'te (taslaklar dahil) admin'e
-- gidiyordu. Gönderim bildirimi artık fn_invoice_approval_submitted'a taşındı
-- (aşağıda), hedef rol proje_yoneticisi oldu.
drop trigger if exists trg_invoices_notify_insert on public.invoices;
drop function if exists public.trg_notify_invoice_insert();

-- C) fn_invoice_approval_submitted: SECURITY DEFINER'a alınıyor (proje
-- yöneticisi/muhasebe invoker olarak invoices_update RLS'ine takılmasın diye)
-- + gönderim anında proje_yoneticisi'ne bildirim.
create or replace function public.fn_invoice_approval_submitted()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_invoice public.invoices%rowtype;
begin
  if NEW.step = 1 and NEW.step_label = 'Yönetici Onayı' then
    update public.invoices set status = 'yönetici_onayında', updated_at = now()
      where id = NEW.invoice_id
      returning * into v_invoice;

    if v_invoice.id is not null then
      perform public.notify_role('proje_yoneticisi', auth.uid(), v_invoice.project_id,
        'invoice', v_invoice.id, 'created',
        'Yeni fatura onayınızı bekliyor: ' || v_invoice.invoice_no,
        'Tutar: ' || v_invoice.total_amount::text);
    end if;
  end if;
  return NEW;
end;
$function$;

-- C) fn_invoice_approval_cascade: aynı sebeple SECURITY DEFINER. Mantık aynı,
-- yalnızca güvenlik bağlamı değişiyor.
create or replace function public.fn_invoice_approval_cascade()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_requires_payment boolean;
begin
  -- Yönetici onayladı
  if OLD.status = 'bekliyor' and NEW.status = 'onaylandı' then
    select requires_payment_tracking into v_requires_payment
      from public.invoices where id = NEW.invoice_id;

    if coalesce(v_requires_payment, true) then
      update public.invoices set status = 'odeme_bekliyor', updated_at = now() where id = NEW.invoice_id;
    else
      update public.invoices set status = 'onaylandı', updated_at = now() where id = NEW.invoice_id;
    end if;

  -- Yönetici reddetti
  elsif OLD.status = 'bekliyor' and NEW.status = 'reddedildi' then
    update public.invoices set status = 'reddedildi', updated_at = now() where id = NEW.invoice_id;

  -- Yönetici düzeltme istedi
  elsif OLD.status = 'bekliyor' and NEW.status = 'duzeltme_istendi' then
    update public.invoices set status = 'duzeltme_bekliyor', updated_at = now() where id = NEW.invoice_id;

  -- Muhasebe düzeltip tekrar gönderdi (approval satırı 'duzeltme_istendi' -> 'bekliyor' güncellenir)
  elsif OLD.status = 'duzeltme_istendi' and NEW.status = 'bekliyor' then
    update public.invoices set status = 'yönetici_onayında', updated_at = now() where id = NEW.invoice_id;

  end if;

  NEW.reviewed_at = now();
  return NEW;
end;
$function$;

-- D) Transition guard: 7 durumlu akışın gerçek geçişlerini + doğru rolü
-- (proje_yoneticisi, admin değil) tanır.
create or replace function public.fn_validate_invoice_status_transition()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_role text := public.get_my_role();
begin
  if old.status is distinct from new.status then
    if not (
      (old.status = 'taslak' and new.status = 'yönetici_onayında' and v_role in ('admin', 'muhasebe'))
      or (old.status = 'bekliyor' and new.status = 'yönetici_onayında' and v_role in ('admin', 'muhasebe'))
      or (old.status = 'yönetici_onayında' and new.status = 'odeme_bekliyor' and v_role in ('admin', 'proje_yoneticisi'))
      or (old.status = 'yönetici_onayında' and new.status = 'onaylandı' and v_role in ('admin', 'proje_yoneticisi'))
      or (old.status = 'yönetici_onayında' and new.status = 'duzeltme_bekliyor' and v_role in ('admin', 'proje_yoneticisi'))
      or (old.status = 'yönetici_onayında' and new.status = 'reddedildi' and v_role in ('admin', 'proje_yoneticisi'))
      or (old.status = 'duzeltme_bekliyor' and new.status = 'yönetici_onayında' and v_role in ('admin', 'muhasebe'))
      or (old.status = 'odeme_bekliyor' and new.status = 'ödendi' and v_role in ('admin', 'muhasebe'))
      or (old.status = 'onaylandı' and new.status = 'ödendi' and v_role in ('admin', 'muhasebe'))
      or (old.status = 'onaylandı' and new.status = 'reddedildi' and v_role = 'admin')
      or (old.status = 'odeme_bekliyor' and new.status = 'reddedildi' and v_role = 'admin')
    ) then
      raise exception 'Bu rol için geçersiz fatura durum geçişi: % -> %', old.status, new.status;
    end if;
  end if;
  return new;
end;
$function$;

-- E) RLS: invoice_approvals UPDATE artık proje_yoneticisi (onaylayıcı) ve
-- muhasebe'yi (düzeltme sonrası yeniden gönderme) de kapsıyor. İnce taneli
-- geçiş kontrolü zaten D maddesindeki trigger'da.
drop policy if exists invoice_approvals_update on public.invoice_approvals;
create policy invoice_approvals_update on public.invoice_approvals
  for update
  using (get_my_role() = any (array['admin', 'proje_yoneticisi', 'muhasebe']))
  with check (get_my_role() = any (array['admin', 'proje_yoneticisi', 'muhasebe']));

-- F) get_invoice_approval_queue: yeni onaylayıcı proje_yoneticisi artık kendi
-- kuyruğunu görebiliyor (öncesinde yalnızca muhasebe/admin'e kapılıydı, yeni
-- onaylayıcıya hiçbir şey dönmüyordu).
create or replace function public.get_invoice_approval_queue(p_project_id text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  result jsonb;
  v_scope record;
  v_role text;
  v_can_approve boolean;
begin
  select * into v_scope from get_project_scope(p_project_id);
  if not v_scope.authorized then
    return jsonb_build_object('authorized', false);
  end if;

  v_role := get_my_role();
  v_can_approve := v_role in ('proje_yoneticisi', 'admin');

  select jsonb_build_object(
    'authorized', true,
    'yonetici_kuyrugu', case when v_can_approve then coalesce((
      select jsonb_agg(
        to_jsonb(inv) || jsonb_build_object('suppliers', jsonb_build_object('name', sup.name), 'projects', jsonb_build_object('name', proj.name))
        order by inv.invoice_date asc
      )
      from invoices inv
      left join suppliers sup on sup.id = inv.supplier_id
      left join projects proj on proj.id = inv.project_id
      where inv.status = 'yönetici_onayında'
        and (p_project_id is null or inv.project_id = p_project_id)
        and (p_project_id is not null or v_scope.scope_all or inv.project_id = any(v_scope.project_ids))
    ), '[]'::jsonb) else '[]'::jsonb end
  ) into result;
  return result;
end;
$function$;

-- G) "Gerçekleşen maliyet" kanonik tanımı: onaylanmış-ama-ödeme-bekleyen
-- faturalar artık status='odeme_bekliyor' oluyor (eskiden doğrudan
-- 'onaylandı'). Bu filtre güncellenmezse bu faturalar hem "gerçekleşen" hem
-- "bekleyen" bütçeden kaybolur.

create or replace function public.sync_cost_allocation_from_invoice()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if NEW.status in ('onaylandı','odeme_bekliyor','ödendi') then
    insert into cost_allocations (invoice_id, project_id, amount, category, note, allocated_at)
    values (NEW.id, NEW.project_id, NEW.total_amount, NEW.category, 'Fatura onayından otomatik', now())
    on conflict (invoice_id) do update
      set amount = excluded.amount, category = excluded.category, project_id = excluded.project_id;
  else
    delete from cost_allocations where invoice_id = NEW.id;
  end if;
  return NEW;
end;
$function$;

create or replace function public.get_dashboard_summary(p_project_id text default null::text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_scope record;
begin
  select * into v_scope from get_project_scope(p_project_id);

  return json_build_object(
    'authorized', v_scope.authorized,
    'open_tickets',
      (select count(*) from tickets
       where status = 'açık' and (v_scope.scope_all or project_id = any(v_scope.project_ids))),
    'critical_tickets',
      (select count(*) from tickets
       where severity in ('kritik','yüksek') and status <> 'kapatıldı'
         and (v_scope.scope_all or project_id = any(v_scope.project_ids))),
    'total_budget',
      (select coalesce(sum(planned_amount), 0) from budget_lines
       where (v_scope.scope_all or project_id = any(v_scope.project_ids))),
    'spent_amount',
      (select coalesce(sum(total_amount), 0) from invoices
       where status in ('onaylandı','odeme_bekliyor','ödendi')
         and (v_scope.scope_all or project_id = any(v_scope.project_ids))),
    'pending_invoices',
      (select count(*) from invoices
       where status in ('yönetici_onayında','duzeltme_bekliyor')
         and (v_scope.scope_all or project_id = any(v_scope.project_ids))),
    'recent_notifications',
      (select coalesce(json_agg(t order by t.created_at desc), '[]'::json)
       from (
         select id, title, severity, status, created_at
         from tickets
         where status <> 'kapatıldı' and (v_scope.scope_all or project_id = any(v_scope.project_ids))
         order by created_at desc
         limit 5
       ) t)
  );
end;
$function$;

create or replace function public.get_finans_overview_internal(p_project_id text, p_as_of_date date default CURRENT_DATE)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_scope record;
  v_project record;
  v_total_planned numeric := 0;
  v_total_actual numeric := 0;
  v_pending_count int := 0;
  v_pending_amount numeric := 0;
  v_this_month_actual numeric := 0;
  v_remaining_budget numeric := 0;
  v_available_budget numeric := 0;
  v_remaining_days int;
  v_curve jsonb := '[]'::jsonb;
  v_dagilim jsonb;
  v_sapma_amount numeric := 0;
  v_sapma_pct numeric := 0;
  v_planned_to_date numeric := 0;
  v_ev numeric := 0;
  v_cpi numeric;
  v_buckets jsonb := '[]'::jsonb;
  v_bucket_total_planned numeric := 0;
  v_bucket_total_actual numeric := 0;
  v_bucket_total_sapma numeric := 0;
  v_bucket_total_pct numeric := 0;
  v_over_budget_count int := 0;
  v_recent jsonb;
  v_ai_yonetici_count int := 0;
  v_ai_yonetici_amount numeric := 0;
  result jsonb;
begin
  select * into v_scope from get_project_scope(p_project_id);
  if not v_scope.authorized then
    return jsonb_build_object('authorized', false);
  end if;

  select * into v_project from projects where id = p_project_id;

  select coalesce(sum(planned_amount), 0) into v_total_planned from budget_lines where project_id = p_project_id;

  select
    coalesce(sum(total_amount) filter (where status in ('onaylandı','odeme_bekliyor','ödendi') and invoice_date <= p_as_of_date), 0),
    count(*) filter (where status in ('yönetici_onayında','duzeltme_bekliyor') and invoice_date <= p_as_of_date),
    coalesce(sum(total_amount) filter (where status in ('yönetici_onayında','duzeltme_bekliyor') and invoice_date <= p_as_of_date), 0),
    coalesce(sum(total_amount) filter (where status in ('onaylandı','odeme_bekliyor','ödendi') and invoice_date >= date_trunc('month', p_as_of_date) and invoice_date <= p_as_of_date), 0)
  into v_total_actual, v_pending_count, v_pending_amount, v_this_month_actual
  from invoices where project_id = p_project_id;

  select
    count(*) filter (where status = 'yönetici_onayında' and invoice_date <= p_as_of_date),
    coalesce(sum(total_amount) filter (where status = 'yönetici_onayında' and invoice_date <= p_as_of_date), 0)
  into v_ai_yonetici_count, v_ai_yonetici_amount
  from invoices where project_id = p_project_id;

  v_remaining_budget := v_total_planned - v_total_actual;
  v_available_budget := v_total_planned - v_total_actual - v_pending_amount;

  if v_project.target_date is not null then
    v_remaining_days := (v_project.target_date - p_as_of_date);
  end if;

  if v_project.start_date is not null and v_project.target_date is not null
     and v_total_planned > 0 and v_project.target_date > v_project.start_date then
    with months as (
      select generate_series(date_trunc('month', v_project.start_date), date_trunc('month', v_project.target_date), interval '1 month')::date as month_start
    ), calc as (
      select
        month_start,
        (month_start + interval '1 month -1 day')::date as month_end,
        least(greatest((month_start + interval '1 month -1 day')::date - v_project.start_date, 0), v_project.target_date - v_project.start_date) as planned_elapsed,
        (v_project.target_date - v_project.start_date) as total_span
      from months
    )
    select jsonb_agg(jsonb_build_object(
      'month', month_start,
      'planned', round(v_total_planned * (planned_elapsed::numeric / nullif(total_span, 0))),
      'actual', case when month_start <= p_as_of_date then (
        select round(coalesce(sum(total_amount), 0)) from invoices
        where project_id = p_project_id and status in ('onaylandı','odeme_bekliyor','ödendi')
          and invoice_date <= least(month_end, p_as_of_date)
      ) else null end,
      'pendingSnapshot', case when date_trunc('month', p_as_of_date) = month_start
        then round(v_total_actual + v_pending_amount)
        else null end
    ) order by month_start) into v_curve
    from calc;

    v_planned_to_date := round(v_total_planned * (
      least(greatest(p_as_of_date - v_project.start_date, 0), v_project.target_date - v_project.start_date)::numeric
      / (v_project.target_date - v_project.start_date)
    ));
    v_sapma_amount := v_total_actual - v_planned_to_date;
    if v_planned_to_date > 0 then
      v_sapma_pct := round((v_sapma_amount / v_planned_to_date) * 1000) / 10;
    end if;
  end if;
  v_curve := coalesce(v_curve, '[]'::jsonb);

  if v_project.progress is not null and v_total_planned > 0 and v_total_actual > 0 then
    v_ev := round((v_project.progress::numeric / 100) * v_total_planned);
    v_cpi := round((v_ev / v_total_actual) * 100) / 100;
  end if;

  with bucket_map as (
    select name, category, planned_amount,
      case
        when category = 'iscilik' then 'iscilik'
        when category in ('panel','inverter','mekanik','elektrik_dc','elektrik_ac','elektrik_og','enh','altyapi') then 'malzeme'
        else 'diger'
      end as bucket
    from budget_lines where project_id = p_project_id
  ), bucket_planned as (
    select bucket, sum(planned_amount) as planned,
      jsonb_agg(jsonb_build_object('name', name, 'category', category, 'planned_amount', planned_amount) order by name) as lines
    from bucket_map group by bucket
  ), invoice_agg as (
    select
      case when category = 'iscilik' then 'iscilik' when category = 'malzeme' then 'malzeme' else 'diger' end as bucket,
      coalesce(sum(total_amount) filter (where status in ('onaylandı','odeme_bekliyor','ödendi')), 0) as actual,
      coalesce(sum(total_amount) filter (where status in ('yönetici_onayında','duzeltme_bekliyor')), 0) as pending
    from invoices where project_id = p_project_id and invoice_date <= p_as_of_date
    group by 1
  ), buckets as (
    select
      k.bucket as key,
      coalesce(bp.planned, 0) as planned,
      coalesce(ia.actual, 0) as actual,
      coalesce(ia.pending, 0) as pending,
      coalesce(bp.lines, '[]'::jsonb) as lines
    from (select unnest(array['malzeme','iscilik','diger']) as bucket) k
    left join bucket_planned bp on bp.bucket = k.bucket
    left join invoice_agg ia on ia.bucket = k.bucket
  )
  select
    jsonb_agg(jsonb_build_object(
      'key', key, 'planned', planned, 'actual', actual, 'pending', pending,
      'remaining', planned - actual - pending,
      'sapma', actual - planned,
      'pct', case when planned > 0 then round(((actual - planned) / planned) * 10000) / 100 else 0 end,
      'lines', lines
    ) order by key),
    coalesce(sum(planned), 0), coalesce(sum(actual), 0),
    coalesce(sum(actual), 0) - coalesce(sum(planned), 0),
    count(*) filter (where actual - planned > 0)
  into v_buckets, v_bucket_total_planned, v_bucket_total_actual, v_bucket_total_sapma, v_over_budget_count
  from buckets;
  v_buckets := coalesce(v_buckets, '[]'::jsonb);

  if v_bucket_total_planned > 0 then
    v_bucket_total_pct := round((v_bucket_total_sapma / v_bucket_total_planned) * 10000) / 100;
  end if;

  select jsonb_object_agg(b->>'key', (b->>'actual')::numeric)
  into v_dagilim
  from jsonb_array_elements(v_buckets) b;

  select jsonb_agg(jsonb_build_object(
    'id', id, 'status', status, 'category', category, 'amount', amount, 'total_amount', total_amount,
    'invoice_date', invoice_date, 'created_at', created_at
  ))
  into v_recent
  from (
    select id, status, category, amount, total_amount, invoice_date, created_at
    from invoices where project_id = p_project_id
    order by created_at desc nulls last, invoice_date desc limit 6
  ) t;

  result := jsonb_build_object(
    'authorized', true,
    'project', jsonb_build_object(
      'id', v_project.id, 'name', v_project.name, 'start_date', v_project.start_date, 'target_date', v_project.target_date,
      'capacity_kwp', v_project.capacity_kwp, 'progress', v_project.progress
    ),
    'kpi', jsonb_build_object(
      'pendingCount', v_pending_count, 'pendingAmount', v_pending_amount,
      'totalPlanned', v_total_planned, 'totalActual', v_total_actual,
      'remainingBudget', v_remaining_budget, 'availableBudget', v_available_budget,
      'thisMonthActual', v_this_month_actual,
      'remainingDays', v_remaining_days
    ),
    'curve', v_curve,
    'dagilim', v_dagilim,
    'sapma', jsonb_build_object('amount', v_sapma_amount, 'pct', v_sapma_pct, 'plannedToDate', v_planned_to_date),
    'cpi', jsonb_build_object('ev', v_ev, 'cpi', v_cpi),
    'costBuckets', jsonb_build_object(
      'buckets', v_buckets, 'totalPlanned', v_bucket_total_planned, 'totalActual', v_bucket_total_actual,
      'totalSapma', v_bucket_total_sapma, 'totalPct', v_bucket_total_pct
    ),
    'quickFacts', jsonb_build_object(
      'pendingCount', v_pending_count, 'pendingAmount', v_pending_amount,
      'overBudgetCount', v_over_budget_count
    ),
    'actionItems', jsonb_build_object(
      'yoneticiOnayi', jsonb_build_object('count', v_ai_yonetici_count, 'amount', v_ai_yonetici_amount)
    ),
    'recentActivity', coalesce(v_recent, '[]'::jsonb)
  );

  return result;
end;
$function$;

create or replace function public.get_finans_overview_all_internal(p_as_of_date date default CURRENT_DATE)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_scope record;
  v_total_planned numeric := 0;
  v_total_actual numeric := 0;
  v_pending_count int := 0;
  v_pending_amount numeric := 0;
  v_this_month_actual numeric := 0;
  v_remaining_budget numeric := 0;
  v_available_budget numeric := 0;
  v_curve jsonb := '[]'::jsonb;
  v_dagilim jsonb;
  v_sapma_amount numeric := 0;
  v_sapma_pct numeric := 0;
  v_planned_to_date numeric := 0;
  v_ev numeric := 0;
  v_cpi numeric;
  v_buckets jsonb := '[]'::jsonb;
  v_bucket_total_planned numeric := 0;
  v_bucket_total_actual numeric := 0;
  v_bucket_total_sapma numeric := 0;
  v_bucket_total_pct numeric := 0;
  v_over_budget_count int := 0;
  v_recent jsonb;
  v_ai_yonetici_count int := 0;
  v_ai_yonetici_amount numeric := 0;
  result jsonb;
BEGIN
  SELECT * INTO v_scope FROM get_project_scope(NULL);

  SELECT COALESCE(SUM(planned_amount), 0) INTO v_total_planned
  FROM budget_lines WHERE (v_scope.scope_all OR project_id = ANY(v_scope.project_ids));

  SELECT
    COALESCE(SUM(total_amount) FILTER (WHERE status IN ('onaylandı','odeme_bekliyor','ödendi') AND invoice_date <= p_as_of_date), 0),
    COUNT(*) FILTER (WHERE status IN ('yönetici_onayında','duzeltme_bekliyor') AND invoice_date <= p_as_of_date),
    COALESCE(SUM(total_amount) FILTER (WHERE status IN ('yönetici_onayında','duzeltme_bekliyor') AND invoice_date <= p_as_of_date), 0),
    COALESCE(SUM(total_amount) FILTER (WHERE status IN ('onaylandı','odeme_bekliyor','ödendi') AND invoice_date >= date_trunc('month', p_as_of_date) AND invoice_date <= p_as_of_date), 0)
  INTO v_total_actual, v_pending_count, v_pending_amount, v_this_month_actual
  FROM invoices WHERE (v_scope.scope_all OR project_id = ANY(v_scope.project_ids));

  SELECT
    COUNT(*) FILTER (WHERE status = 'yönetici_onayında' AND invoice_date <= p_as_of_date),
    COALESCE(SUM(total_amount) FILTER (WHERE status = 'yönetici_onayında' AND invoice_date <= p_as_of_date), 0)
  INTO v_ai_yonetici_count, v_ai_yonetici_amount
  FROM invoices WHERE (v_scope.scope_all OR project_id = ANY(v_scope.project_ids));

  v_remaining_budget := v_total_planned - v_total_actual;
  v_available_budget := v_total_planned - v_total_actual - v_pending_amount;

  WITH proj AS (
    SELECT p.id, p.start_date, p.target_date, p.progress,
      COALESCE((SELECT SUM(b.planned_amount) FROM budget_lines b WHERE b.project_id = p.id), 0) AS planned
    FROM projects p
    WHERE p.start_date IS NOT NULL AND p.target_date IS NOT NULL AND p.target_date > p.start_date
      AND (v_scope.scope_all OR p.id = ANY(v_scope.project_ids))
  ),
  proj_active AS (
    SELECT * FROM proj WHERE planned > 0
  )
  SELECT
    COALESCE(SUM(ROUND(planned * (
      LEAST(GREATEST(p_as_of_date - start_date, 0), target_date - start_date)::numeric
      / (target_date - start_date)
    ))), 0),
    COALESCE(SUM(ROUND((progress::numeric / 100) * planned)) FILTER (WHERE progress IS NOT NULL), 0)
  INTO v_planned_to_date, v_ev
  FROM proj_active;

  v_sapma_amount := v_total_actual - v_planned_to_date;
  IF v_planned_to_date > 0 THEN
    v_sapma_pct := ROUND((v_sapma_amount / v_planned_to_date) * 1000) / 10;
  END IF;
  IF v_ev > 0 AND v_total_actual > 0 THEN
    v_cpi := ROUND((v_ev / v_total_actual) * 100) / 100;
  END IF;

  WITH proj AS (
    SELECT p.id, p.start_date, p.target_date,
      COALESCE((SELECT SUM(b.planned_amount) FROM budget_lines b WHERE b.project_id = p.id), 0) AS planned
    FROM projects p
    WHERE p.start_date IS NOT NULL AND p.target_date IS NOT NULL AND p.target_date > p.start_date
      AND (v_scope.scope_all OR p.id = ANY(v_scope.project_ids))
  ),
  proj_active AS (
    SELECT * FROM proj WHERE planned > 0
  ),
  bounds AS (
    SELECT MIN(start_date) AS min_start, MAX(target_date) AS max_target FROM proj_active
  ),
  months AS (
    SELECT generate_series(date_trunc('month', min_start), date_trunc('month', max_target), interval '1 month')::date AS month_start
    FROM bounds WHERE min_start IS NOT NULL
  ),
  month_calc AS (
    SELECT
      m.month_start,
      (m.month_start + interval '1 month -1 day')::date AS month_end,
      pa.start_date, pa.target_date, pa.planned
    FROM months m
    JOIN proj_active pa
      ON m.month_start <= date_trunc('month', pa.target_date)
     AND (m.month_start + interval '1 month -1 day')::date >= pa.start_date
  ),
  month_planned AS (
    SELECT month_start, month_end,
      SUM(ROUND(planned * (
        LEAST(GREATEST(month_end - start_date, 0), target_date - start_date)::numeric
        / (target_date - start_date)
      ))) AS planned_sum
    FROM month_calc
    GROUP BY month_start, month_end
  )
  SELECT jsonb_agg(jsonb_build_object(
    'month', month_start,
    'planned', planned_sum,
    'actual', CASE WHEN month_start <= p_as_of_date THEN (
      SELECT ROUND(COALESCE(SUM(total_amount), 0)) FROM invoices
      WHERE status IN ('onaylandı','odeme_bekliyor','ödendi') AND invoice_date <= LEAST(month_end, p_as_of_date)
        AND (v_scope.scope_all OR project_id = ANY(v_scope.project_ids))
    ) ELSE NULL END,
    'pendingSnapshot', CASE WHEN date_trunc('month', p_as_of_date) = month_start
      THEN ROUND(v_total_actual + v_pending_amount)
      ELSE NULL END
  ) ORDER BY month_start) INTO v_curve
  FROM month_planned;
  v_curve := COALESCE(v_curve, '[]'::jsonb);

  WITH bucket_map AS (
    SELECT name, category, planned_amount,
      CASE
        WHEN category = 'iscilik' THEN 'iscilik'
        WHEN category IN ('panel','inverter','mekanik','elektrik_dc','elektrik_ac','elektrik_og','enh','altyapi') THEN 'malzeme'
        ELSE 'diger'
      END AS bucket
    FROM budget_lines WHERE (v_scope.scope_all OR project_id = ANY(v_scope.project_ids))
  ), bucket_planned AS (
    SELECT bucket, SUM(planned_amount) AS planned,
      jsonb_agg(jsonb_build_object('name', name, 'category', category, 'planned_amount', planned_amount) ORDER BY name) AS lines
    FROM bucket_map GROUP BY bucket
  ), invoice_agg AS (
    SELECT
      CASE WHEN category = 'iscilik' THEN 'iscilik' WHEN category = 'malzeme' THEN 'malzeme' ELSE 'diger' END AS bucket,
      COALESCE(SUM(total_amount) FILTER (WHERE status IN ('onaylandı','odeme_bekliyor','ödendi')), 0) AS actual,
      COALESCE(SUM(total_amount) FILTER (WHERE status IN ('yönetici_onayında','duzeltme_bekliyor')), 0) AS pending
    FROM invoices
    WHERE invoice_date <= p_as_of_date AND (v_scope.scope_all OR project_id = ANY(v_scope.project_ids))
    GROUP BY 1
  ), buckets AS (
    SELECT
      k.bucket AS key,
      COALESCE(bp.planned, 0) AS planned,
      COALESCE(ia.actual, 0) AS actual,
      COALESCE(ia.pending, 0) AS pending,
      COALESCE(bp.lines, '[]'::jsonb) AS lines
    FROM (SELECT unnest(ARRAY['malzeme','iscilik','diger']) AS bucket) k
    LEFT JOIN bucket_planned bp ON bp.bucket = k.bucket
    LEFT JOIN invoice_agg ia ON ia.bucket = k.bucket
  )
  SELECT
    jsonb_agg(jsonb_build_object(
      'key', key, 'planned', planned, 'actual', actual, 'pending', pending,
      'remaining', planned - actual - pending,
      'sapma', actual - planned,
      'pct', CASE WHEN planned > 0 THEN ROUND(((actual - planned) / planned) * 10000) / 100 ELSE 0 END,
      'lines', lines
    ) ORDER BY key),
    COALESCE(SUM(planned), 0), COALESCE(SUM(actual), 0),
    COALESCE(SUM(actual), 0) - COALESCE(SUM(planned), 0),
    COUNT(*) FILTER (WHERE actual - planned > 0)
  INTO v_buckets, v_bucket_total_planned, v_bucket_total_actual, v_bucket_total_sapma, v_over_budget_count
  FROM buckets;
  v_buckets := COALESCE(v_buckets, '[]'::jsonb);

  IF v_bucket_total_planned > 0 THEN
    v_bucket_total_pct := ROUND((v_bucket_total_sapma / v_bucket_total_planned) * 10000) / 100;
  END IF;

  SELECT jsonb_object_agg(b->>'key', (b->>'actual')::numeric)
  INTO v_dagilim
  FROM jsonb_array_elements(v_buckets) b;

  SELECT jsonb_agg(jsonb_build_object(
    'id', i.id, 'status', i.status, 'category', i.category, 'amount', i.amount, 'total_amount', i.total_amount,
    'invoice_date', i.invoice_date, 'created_at', i.created_at,
    'project_id', i.project_id, 'project_name', p.name
  ))
  INTO v_recent
  FROM (
    SELECT id, status, category, amount, total_amount, invoice_date, created_at, project_id
    FROM invoices
    WHERE (v_scope.scope_all OR project_id = ANY(v_scope.project_ids))
    ORDER BY created_at DESC NULLS LAST, invoice_date DESC LIMIT 6
  ) i
  LEFT JOIN projects p ON p.id = i.project_id;

  result := jsonb_build_object(
    'kpi', jsonb_build_object(
      'pendingCount', v_pending_count, 'pendingAmount', v_pending_amount,
      'totalPlanned', v_total_planned, 'totalActual', v_total_actual,
      'remainingBudget', v_remaining_budget, 'availableBudget', v_available_budget,
      'thisMonthActual', v_this_month_actual,
      'remainingDays', NULL
    ),
    'curve', v_curve,
    'dagilim', v_dagilim,
    'sapma', jsonb_build_object('amount', v_sapma_amount, 'pct', v_sapma_pct, 'plannedToDate', v_planned_to_date),
    'cpi', jsonb_build_object('ev', v_ev, 'cpi', v_cpi),
    'costBuckets', jsonb_build_object(
      'buckets', v_buckets, 'totalPlanned', v_bucket_total_planned, 'totalActual', v_bucket_total_actual,
      'totalSapma', v_bucket_total_sapma, 'totalPct', v_bucket_total_pct
    ),
    'quickFacts', jsonb_build_object(
      'pendingCount', v_pending_count, 'pendingAmount', v_pending_amount,
      'overBudgetCount', v_over_budget_count
    ),
    'actionItems', jsonb_build_object(
      'yoneticiOnayi', jsonb_build_object('count', v_ai_yonetici_count, 'amount', v_ai_yonetici_amount)
    ),
    'recentActivity', COALESCE(v_recent, '[]'::jsonb)
  );

  RETURN result;
END;
$function$;

-- get_invoices_list: liste sayfasının 4 stat kartı için tek round-trip'te
-- hesaplanan 'stats' alanı eklendi (additive, mevcut 'invoices' alanı aynı).
create or replace function public.get_invoices_list(p_project_id text default null::text, p_filter_date date default null::date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  result jsonb;
  v_scope record;
  v_stats jsonb;
BEGIN
  SELECT * INTO v_scope FROM get_project_scope(p_project_id);
  IF NOT v_scope.authorized THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  SELECT jsonb_build_object(
    'onayBekleyen', jsonb_build_object(
      'count', COUNT(*) FILTER (WHERE inv.status = 'yönetici_onayında'),
      'amount', COALESCE(SUM(inv.total_amount) FILTER (WHERE inv.status = 'yönetici_onayında'), 0)
    ),
    'duzeltmeBekleyen', jsonb_build_object(
      'count', COUNT(*) FILTER (WHERE inv.status = 'duzeltme_bekliyor'),
      'amount', COALESCE(SUM(inv.total_amount) FILTER (WHERE inv.status = 'duzeltme_bekliyor'), 0)
    ),
    'odemeBekleyen', jsonb_build_object(
      'count', COUNT(*) FILTER (WHERE inv.status = 'odeme_bekliyor'),
      'amount', COALESCE(SUM(inv.total_amount) FILTER (WHERE inv.status = 'odeme_bekliyor'), 0)
    ),
    'buAyOnaylanan', jsonb_build_object(
      'count', (
        SELECT COUNT(*) FROM invoice_approvals ia
        JOIN invoices i2 ON i2.id = ia.invoice_id
        WHERE ia.step_label = 'Yönetici Onayı' AND ia.status = 'onaylandı'
          AND date_trunc('month', ia.reviewed_at) = date_trunc('month', CURRENT_DATE)
          AND CASE WHEN p_project_id IS NOT NULL THEN i2.project_id = p_project_id
                   ELSE (v_scope.scope_all OR i2.project_id = ANY(v_scope.project_ids)) END
      ),
      'amount', (
        SELECT COALESCE(SUM(i2.total_amount), 0) FROM invoice_approvals ia
        JOIN invoices i2 ON i2.id = ia.invoice_id
        WHERE ia.step_label = 'Yönetici Onayı' AND ia.status = 'onaylandı'
          AND date_trunc('month', ia.reviewed_at) = date_trunc('month', CURRENT_DATE)
          AND CASE WHEN p_project_id IS NOT NULL THEN i2.project_id = p_project_id
                   ELSE (v_scope.scope_all OR i2.project_id = ANY(v_scope.project_ids)) END
      )
    )
  )
  INTO v_stats
  FROM invoices inv
  WHERE CASE WHEN p_project_id IS NOT NULL THEN inv.project_id = p_project_id
             ELSE (v_scope.scope_all OR inv.project_id = ANY(v_scope.project_ids)) END;

  SELECT jsonb_build_object(
    'authorized', true,
    'stats', v_stats,
    'invoices', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(inv) || jsonb_build_object('suppliers', jsonb_build_object('name', sup.name))
        ORDER BY inv.invoice_date DESC
      )
      FROM invoices inv
      LEFT JOIN suppliers sup ON sup.id = inv.supplier_id
      WHERE
        CASE
          WHEN p_project_id IS NOT NULL THEN
            inv.project_id = p_project_id
            AND inv.invoice_date <= COALESCE(p_filter_date, CURRENT_DATE)
          ELSE
            (v_scope.scope_all OR inv.project_id = ANY(v_scope.project_ids))
        END
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$function$;

-- trg_notify_invoice_status: reddedildi artık nihai (kurtarma yok, aşağıda H),
-- ama muhasebe'nin bilmesi gereken iki yeni geçiş var: düzeltme istendi ve
-- ödeme girişi bekleniyor.
create or replace function public.trg_notify_invoice_status()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_pr_owner uuid;
begin
  if NEW.status is distinct from OLD.status and NEW.status in ('onaylandı','reddedildi') then
    perform public.notify_user(NEW.created_by, null, NEW.project_id, 'invoice', NEW.id,
      case when NEW.status='onaylandı' then 'approved' else 'rejected' end,
      'Fatura ' || NEW.invoice_no || ' ' || NEW.status, 'Fatura durumu güncellendi.');
    if NEW.purchase_request_id is not null then
      select requested_by into v_pr_owner from public.purchase_requests where id = NEW.purchase_request_id;
      perform public.notify_user(v_pr_owner, null, NEW.project_id, 'invoice', NEW.id,
        case when NEW.status='onaylandı' then 'approved' else 'rejected' end,
        'Talebinizin faturası ' || NEW.status, 'Fatura no: ' || NEW.invoice_no);
    end if;
  elsif NEW.status is distinct from OLD.status and NEW.status = 'duzeltme_bekliyor' then
    perform public.notify_role('muhasebe', null, NEW.project_id, 'invoice', NEW.id, 'status_changed',
      'Düzeltme istendi: ' || NEW.invoice_no, 'Yönetici bu faturada düzeltme istedi.');
  elsif NEW.status is distinct from OLD.status and NEW.status = 'odeme_bekliyor' then
    perform public.notify_role('muhasebe', null, NEW.project_id, 'invoice', NEW.id, 'status_changed',
      'Ödeme girişi bekleniyor: ' || NEW.invoice_no, 'Fatura onaylandı, ödeme tarihi girilmesi gerekiyor.');
  end if;
  return NEW;
end;
$function$;

-- H) Reddedilen fatura artık nihai — kurtarma akışı yok (kullanıcının 4.
-- cevabı). duzeltme_bekliyor zaten aynı ihtiyacı (muhasebe düzeltip yeniden
-- gönderir) karşılıyor.
drop function if exists public.resubmit_rejected_invoice(uuid);
drop function if exists public.delete_rejected_invoice(uuid);
