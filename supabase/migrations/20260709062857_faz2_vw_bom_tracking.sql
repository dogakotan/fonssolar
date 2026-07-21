
create view public.vw_bom_tracking as
select
  pi.id as procurement_item_id,
  pi.project_id,
  pi.equipment,
  pi.category,
  pi.unit,
  coalesce(pi.planned_qty, 0) as planned_qty,
  coalesce(sum(pri.quantity) filter (
    where pr.status not in ('reddedildi', 'iptal')
  ), 0) as requested_qty,
  coalesce(sum(pri.quantity) filter (
    where pr.status in ('onaylandi', 'satin_alindi', 'fatura_bekliyor', 'fatura_onay_bekliyor', 'faturasi_kesildi')
  ), 0) as approved_qty,
  coalesce(sum(pri.quantity) filter (
    where pr.status = 'faturasi_kesildi'
  ), 0) as invoiced_qty,
  coalesce(pi.planned_qty, 0) - coalesce(sum(pri.quantity) filter (
    where pr.status not in ('reddedildi', 'iptal')
  ), 0) as remaining_qty,
  (coalesce(sum(pri.quantity) filter (
    where pr.status not in ('reddedildi', 'iptal')
  ), 0) > coalesce(pi.planned_qty, 0)) as over_requested
from public.procurement_items pi
left join public.purchase_request_items pri on pri.bom_item_id = pi.id
left join public.purchase_requests pr on pr.id = pri.request_id
where public.has_project_access(pi.project_id)
group by pi.id, pi.project_id, pi.equipment, pi.category, pi.unit, pi.planned_qty;

