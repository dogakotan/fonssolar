-- Migration'dan (20260909073655) ONCE, Osman Karadogan tarafindan acilmis ve
-- hala 'bekliyor' durumunda olan 19 malzeme degisikligi talebi approver_role
-- varsayilaniyla ('admin') kaldi - bu talepler de proje yoneticisine onaya
-- dussun diye (kullanici istegi, 09.09.2026) geriye donuk duzeltiliyor.
update public.procurement_item_change_requests
set approver_role = 'proje_yoneticisi'
where status = 'bekliyor'
  and requested_by in ('c87088e5-40b2-4d04-9403-1b22babbc31e', '30431df3-a9ae-4f06-9031-335488f8f656');

-- Yukaridaki talepler olusturulduklarinda yalnizca admin'e bildirim gitmisti
-- (o zaman approver_role henuz yoktu) - proje yoneticisi artik gercek
-- onaylayici oldugundan kendisine de bildirim gonderiliyor.
do $$
declare
  r record;
begin
  for r in
    select pcr.id, pcr.project_id, pcr.requested_by, pcr.old_planned_qty, pcr.new_planned_qty,
           coalesce(pi.equipment, pcr.new_equipment) as equipment, coalesce(pi.unit, pcr.new_unit) as unit,
           (pcr.procurement_item_id is null) as is_new
    from public.procurement_item_change_requests pcr
    left join public.procurement_items pi on pi.id = pcr.procurement_item_id
    where pcr.status = 'bekliyor'
      and pcr.approver_role = 'proje_yoneticisi'
      and pcr.requested_by in ('c87088e5-40b2-4d04-9403-1b22babbc31e', '30431df3-a9ae-4f06-9031-335488f8f656')
  loop
    if r.is_new then
      perform public.notify_role(
        'proje_yoneticisi', r.requested_by, r.project_id, 'procurement_item_change_request', r.id, 'pending',
        'Yeni malzeme ekleme talebi onay bekliyor',
        format('%s (%s %s) malzeme listesine eklenmek isteniyor.', r.equipment, r.new_planned_qty::text, coalesce(r.unit, ''))
      );
    else
      perform public.notify_role(
        'proje_yoneticisi', r.requested_by, r.project_id, 'procurement_item_change_request', r.id, 'pending',
        'Malzeme miktarı değişikliği onay bekliyor',
        format('Planlanan miktar %s → %s olarak değiştirilmek isteniyor.', coalesce(r.old_planned_qty::text, '—'), r.new_planned_qty::text)
      );
    end if;
  end loop;
end $$;
