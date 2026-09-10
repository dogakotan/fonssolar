-- 03-08.09.2026'daki 3 asamali Teklif/Pazarlik/Siparis suerecinde eklenen
-- purchase_offers tablosu + purchase_requests'in yeni pazarlik alanlari
-- (negotiated_by, selected_offer_id, stage_approved_by) FK kolonlarinda
-- covering index yoktu (Supabase performance advisor, unindexed_foreign_keys).
create index if not exists idx_purchase_offers_request_id on public.purchase_offers(request_id);
create index if not exists idx_purchase_offers_supplier_id on public.purchase_offers(supplier_id);
create index if not exists idx_purchase_offers_created_by on public.purchase_offers(created_by);
create index if not exists idx_purchase_requests_selected_offer_id on public.purchase_requests(selected_offer_id);
create index if not exists idx_purchase_requests_negotiated_by on public.purchase_requests(negotiated_by);
create index if not exists idx_purchase_requests_stage_approved_by on public.purchase_requests(stage_approved_by);
