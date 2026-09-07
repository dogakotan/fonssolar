-- Fatura kısmında yönetici (proje_yoneticisi/admin) "Onayla" butonu, project_id=NULL
-- olan (bağlı proje olmayan "genel harcama") faturalarda sessizce başarısız oluyordu:
-- sync_cost_allocation_from_invoice() cost_allocations'a satır yazmaya çalışıyor,
-- ama o tablonun project_id kolonu NOT NULL — insert 23502 ile patlıyor, invoice_approvals
-- UPDATE'i geri alınıyor (invoices.status hiç değişmiyor), ve frontend (OnayReddetActions.jsx)
-- bu hatayı hiç göstermediği için buton "çalışmıyormuş" gibi görünüyordu.
--
-- Kardeş fonksiyon sync_cost_allocation_from_financial_transaction() (faturasız ödemeler
-- için, 20260726162840_link_financial_transactions_to_cost_allocations) zaten bu korumayı
-- (AND NEW.project_id IS NOT NULL) alıyordu — fatura tarafı "genel harcama" özelliği
-- (FaturaOlusturModal.jsx, 2026-07-28) eklenirken bu korumayı hiç almamıştı.

CREATE OR REPLACE FUNCTION public.sync_cost_allocation_from_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if NEW.status in ('onaylandı','odeme_bekliyor','kismen_odendi','ödendi') and NEW.project_id is not null then
    insert into cost_allocations (invoice_id, project_id, amount, category, note, allocated_at)
    values (NEW.id, NEW.project_id, NEW.total_amount_try, NEW.category, 'Fatura onayından otomatik', now())
    on conflict (invoice_id) do update
      set amount = excluded.amount, category = excluded.category, project_id = excluded.project_id;
  else
    delete from cost_allocations where invoice_id = NEW.id;
  end if;
  return NEW;
end;
$function$;
