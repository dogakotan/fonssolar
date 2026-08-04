-- get_project_gantt: çıktısındaki is_critical alanı kaldırıldı.
-- fn_recompute_auto_risks: gorev_gecikmesi şiddet hesabı artık yalnızca gecikme
-- gün sayısına göre (8+ kritik, 4-7 yüksek, altı orta) — is_critical bayrağının
-- şiddeti bir kademe yükseltmesi kaldırıldı.
-- trg_tasks_recompute_risks: is_critical sütunu artık yok, UPDATE OF listesinden
-- çıkarıldı (yalnızca planned_end, status değişiminde tetiklenir).

create or replace function public.get_project_gantt(p_project_id text, p_filter_date date default current_date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_scope record;
begin
  select * into v_scope from public.get_project_scope(p_project_id);
  if not v_scope.authorized then
    return jsonb_build_object('authorized', false);
  end if;

  return jsonb_build_object(
    'authorized', true,
    'project', (
      select jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'capacity_kwp', p.capacity_kwp,
        'location', p.location,
        'start_date', p.start_date,
        'target_date', p.target_date
      )
      from public.projects p
      where p.id = p_project_id
    ),
    'tasks', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', pt.id,
          'task_code', pt.task_code,
          'task_name', pt.task_name,
          'group_label', pt.group_label,
          'category', pt.category,
          'planned_start', pt.planned_start,
          'planned_end', pt.planned_end,
          'progress_pct', pt.progress_pct,
          'status', pt.status,
          'responsible_role', pt.responsible_role,
          'equipment_notes', pt.equipment_notes,
          'notes', pt.notes,
          'target_qty', pt.target_qty,
          'unit', pt.unit,
          'total_progress', pt.total_progress,
          'risk_severity', (
            select r.severity
            from public.project_risks r
            where r.project_id = pt.project_id
              and r.rule_code = 'gorev_gecikmesi'
              and r.subject_ref = pt.task_code
              and r.status <> 'kapatıldı'
            order by case r.severity
              when 'kritik' then 4
              when 'yüksek' then 3
              when 'orta' then 2
              when 'düşük' then 1
              else 0
            end desc
            limit 1
          )
        )
        order by pt.planned_start asc nulls last
      ), '[]'::jsonb)
      from public.project_tasks pt
      where pt.project_id = p_project_id
    ),
    'task_progress', (
      select coalesce(
        jsonb_object_agg(task_id::text, round(avg_pct::numeric, 4)),
        '{}'::jsonb
      )
      from (
        select
          pt.id as task_id,
          avg(
            least(
              100.0,
              coalesce(sums.total_qty, 0.0)
              / nullif(pt.target_qty::numeric, 0)
              * 100.0
            )
          ) as avg_pct
        from public.project_tasks pt
        left join lateral (
          select coalesce(sum(pd.qty_added), 0) as total_qty
          from public.progress_daily pd
          join public.daily_reports dr on dr.id = pd.report_id
          where pd.task_id = pt.id
            and dr.report_date <= p_filter_date
        ) sums on true
        where pt.project_id = p_project_id
          and pt.target_qty > 0
        group by pt.id
      ) tp
    ),
    'context', jsonb_build_object(
      'latest_report', (
        select jsonb_build_object('report_date', dr.report_date, 'notes', dr.notes)
        from public.daily_reports dr
        where dr.project_id = p_project_id
        order by dr.report_date desc
        limit 1
      ),
      'latest_purchase', (
        select jsonb_build_object(
          'id', pr.id,
          'title', pr.title,
          'status', pr.status,
          'created_at', pr.created_at
        )
        from public.purchase_requests pr
        where pr.project_id = p_project_id
        order by pr.created_at desc
        limit 1
      ),
      'top_risk', (
        select to_jsonb(r)
        from public.project_risks r
        where r.project_id = p_project_id
          and r.status <> 'kapatıldı'
        limit 1
      )
    )
  );
end;
$function$;

create or replace function public.fn_recompute_auto_risks(p_project_id text, p_close_material_risks boolean default false)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  t record;
  m record;
  v_gecikme int;
  v_sev text;
begin
  for t in
    select id, task_code, task_name, planned_end
    from project_tasks
    where project_id = p_project_id
      and status not in ('tamamlandi','iptal')
      and planned_end is not null
      and planned_end < current_date
  loop
    v_gecikme := current_date - t.planned_end;
    v_sev := case
      when v_gecikme >= 8 then 'kritik'
      when v_gecikme >= 4 then 'yüksek'
      else 'orta'
    end;

    insert into project_risks (project_id, title, description, severity, status, mitigation, source, rule_code, subject_ref, category)
    values (
      p_project_id,
      'Görev gecikti: ' || t.task_name || ' (' || t.task_code || ')',
      'Plan bitiş tarihi ' || to_char(t.planned_end, 'DD.MM.YYYY') || ' idi, ' || v_gecikme || ' gündür tamamlanmadı.',
      v_sev, 'açık', null, 'otomatik', 'gorev_gecikmesi', t.task_code, 'is_kalemi'
    )
    on conflict (project_id, rule_code, subject_ref) where source = 'otomatik'
    do update set
      description = excluded.description,
      severity = excluded.severity,
      status = 'açık',
      updated_at = now();
  end loop;

  update project_risks r
  set status = 'kapatıldı', updated_at = now()
  where r.project_id = p_project_id
    and r.source = 'otomatik'
    and r.rule_code = 'gorev_gecikmesi'
    and r.status <> 'kapatıldı'
    and exists (
      select 1 from project_tasks pt
      where pt.project_id = p_project_id
        and pt.task_code = r.subject_ref
        and (coalesce(pt.progress_pct, 0) >= 100 or pt.status in ('tamamlandi','iptal'))
    );

  for m in
    select
      pi.id, pi.equipment, pi.planned_qty,
      coalesce(sum(pri.quantity) filter (where pr.id is not null), 0) as requested_qty
    from procurement_items pi
    left join purchase_request_items pri on pri.bom_item_id = pi.id
    left join purchase_requests pr on pr.id = pri.request_id and pr.status not in ('reddedildi','iptal')
    where pi.project_id = p_project_id
      and pi.planned_qty is not null and pi.planned_qty > 0
    group by pi.id, pi.equipment, pi.planned_qty
  loop
    if m.requested_qty > m.planned_qty then
      insert into project_risks (project_id, title, description, severity, status, mitigation, source, rule_code, subject_ref, category)
      values (
        p_project_id,
        'Malzeme fazla talep edildi: ' || m.equipment,
        'Malzeme Listesi''nde planlanan miktar ' || m.planned_qty || ' iken, satın alma taleplerinde toplam ' || m.requested_qty || ' talep edildi.',
        'yüksek', 'açık', null, 'otomatik', 'malzeme_fazla_talep', m.id::text, 'satin_alma'
      )
      on conflict (project_id, rule_code, subject_ref) where source = 'otomatik'
      do update set
        description = excluded.description,
        status = 'açık',
        updated_at = now();
    elsif p_close_material_risks then
      update project_risks
      set status = 'kapatıldı', updated_at = now()
      where project_id = p_project_id and source = 'otomatik'
        and rule_code = 'malzeme_fazla_talep' and subject_ref = m.id::text
        and status <> 'kapatıldı';
    end if;
  end loop;
end;
$function$;

drop trigger if exists trg_tasks_recompute_risks on public.project_tasks;
create trigger trg_tasks_recompute_risks
  after insert or delete or update of planned_end, status on public.project_tasks
  for each row execute function public.trg_recompute_risks_from_task();
