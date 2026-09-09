-- Fatura/harcama ekleme sihirbazına şirket seçici eklenmesi için (09.09.2026,
-- kullanıcı isteği): Fons Solar (proje bağlı) vs PV Solution (projesiz genel
-- harcama). Mevcut tüm satırlar geriye dönük uyumlu şekilde 'fons_solar'
-- varsayılanını alır. project_id zaten nullable olduğundan ve
-- sync_cost_allocation_from_invoice/sync_cost_allocation_from_financial_transaction
-- trigger'ları zaten "project_id is not null" şartıyla çalıştığından (bkz.
-- 20260902130156_fix_invoice_cost_allocation_null_project_id), projesiz
-- PV Solution kayıtları maliyet tablosuna hiç yazmadan güvenle desteklenir.
alter table public.invoices
  add column company text not null default 'fons_solar';

alter table public.invoices
  add constraint invoices_company_check check (company in ('fons_solar', 'pv_solution'));

alter table public.financial_transactions
  add column company text not null default 'fons_solar';

alter table public.financial_transactions
  add constraint financial_transactions_company_check check (company in ('fons_solar', 'pv_solution'));
