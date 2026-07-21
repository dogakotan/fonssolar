
alter table public.daily_report_material_usage
  add column bom_item_id uuid references public.procurement_items(id);

