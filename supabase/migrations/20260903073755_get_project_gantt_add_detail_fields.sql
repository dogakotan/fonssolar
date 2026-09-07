-- Detaylı İş Planı görünümü için get_project_gantt'ın 'tasks' çıktısına
-- sub_category/responsible/team_size/actual_start/actual_end/duration_days
-- eklendi — sadece EKLEME, mevcut hiçbir alan/davranış değişmedi.
-- TabIsPlaniDetay.jsx (yeni Detaylı İş Planı tablosu) bu alanları
-- kullanıyor: plan/gerçekleşen tarih karşılaştırması, sorumlu/ekip, alt kategori.

CREATE OR REPLACE FUNCTION public.get_project_gantt(p_project_id text, p_filter_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        'id', p.id, 'name', p.name, 'capacity_kwp', p.capacity_kwp,
        'location', p.location, 'start_date', p.start_date, 'target_date', p.target_date
      )
      from public.projects p where p.id = p_project_id
    ),
    'tasks', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', pt.id, 'task_code', pt.task_code, 'task_name', pt.task_name,
          'group_label', pt.group_label, 'category', pt.category,
          'sub_category', pt.sub_category,
          'planned_start', pt.planned_start, 'planned_end', pt.planned_end,
          'actual_start', pt.actual_start, 'actual_end', pt.actual_end,
          'duration_days', pt.duration_days,
          'progress_pct', pt.progress_pct, 'status', pt.status,
          'responsible', pt.responsible, 'responsible_role', pt.responsible_role,
          'team_size', pt.team_size,
          'equipment_notes', pt.equipment_notes, 'notes', pt.notes,
          'target_qty', pt.target_qty, 'unit', pt.unit, 'total_progress', pt.total_progress,
          'risk_severity', (
            select r.severity from public.project_risks r
            where r.project_id = pt.project_id and r.rule_code = 'gorev_gecikmesi'
              and r.subject_ref = pt.task_code and r.status <> 'kapatıldı'
            order by case r.severity when 'kritik' then 4 when 'yüksek' then 3 when 'orta' then 2 when 'düşük' then 1 else 0 end desc
            limit 1
          )
        )
        order by pt.planned_start asc nulls last
      ), '[]'::jsonb)
      from public.project_tasks pt where pt.project_id = p_project_id
    ),
    'task_progress', (
      select coalesce(jsonb_object_agg(task_id::text, round(avg_pct::numeric, 4)), '{}'::jsonb)
      from (
        select pt.id as task_id,
          avg(least(100.0, coalesce(sums.total_qty, 0.0) / nullif(pt.target_qty::numeric, 0) * 100.0)) as avg_pct
        from public.project_tasks pt
        left join lateral (
          select coalesce(sum(pd.qty_added), 0) as total_qty
          from public.progress_daily pd join public.daily_reports dr on dr.id = pd.report_id
          where pd.task_id = pt.id and dr.report_date <= p_filter_date
        ) sums on true
        where pt.project_id = p_project_id and pt.target_qty > 0
        group by pt.id
      ) tp
    ),
    'context', jsonb_build_object(
      'latest_report', (select jsonb_build_object('report_date', dr.report_date, 'notes', dr.notes) from public.daily_reports dr where dr.project_id = p_project_id order by dr.report_date desc limit 1),
      'latest_purchase', (select jsonb_build_object('id', pr.id, 'title', pr.title, 'status', pr.status, 'created_at', pr.created_at) from public.purchase_requests pr where pr.project_id = p_project_id order by pr.created_at desc limit 1),
      'top_risk', (select to_jsonb(r) from public.project_risks r where r.project_id = p_project_id and r.status <> 'kapatıldı' limit 1)
    )
  );
end;
$function$;
