-- Kök neden 1: purchase_requests_select RLS'i muhasebeyi yalnızca
-- satin_alindi/fatura_bekliyor durumundaki taleplerle sınırlıyordu. Ama bir
-- fatura oluşturulduğu anda (sync_purchase_request_from_invoice, INSERT
-- tetikleyicisi) talebin durumu otomatik fatura_onay_bekliyor'a atlıyor — bu
-- değer muhasebenin görebildiği kümede yoktu. Sonuç: muhasebe kendi
-- oluşturduğu faturanın bağlı olduğu talebi bir dakika sonra bile RLS
-- yüzünden göremiyordu, FaturaDetayModal.jsx'in "Bağlı Talep" kartı "—"
-- gösteriyordu (invoices.purchase_request_id DB'de doğru yazılmıştı, sorun
-- yalnızca görüntüleme RLS'indeydi). Fatura akışının doğal sonraki iki durumu
-- (fatura_onay_bekliyor, faturasi_kesildi) eklendi; talep hâlâ
-- talep_olusturuldu/fiyat_girildi/onay_bekliyor/onaylandi aşamasındaysa
-- muhasebe izolasyonu değişmedi.
drop policy "purchase_requests_select" on public.purchase_requests;
create policy "purchase_requests_select" on public.purchase_requests
for select using (
  ((get_my_role() = 'muhasebe') and (status = any(array['satin_alindi','fatura_bekliyor','fatura_onay_bekliyor','faturasi_kesildi'])))
  or ((get_my_role() <> 'muhasebe') and (has_project_access(project_id) or ((select auth.uid()) = requested_by)))
);

-- Kök neden 2: "Vade tarihi boş = peşin, onaylandığında kapanır" vaadi
-- tutmuyordu. requires_payment_tracking=false dalında invoices.status
-- 'onaylandı'ya çekiliyordu ama paid_amount hiç yazılmıyordu —
-- remaining_amount sonsuza kadar tam tutarda kalıp Tedarikçi bakiyesinde/
-- v_invoice_payment_overview'da kalıcı "açık borç" gibi görünüyordu, hiçbir
-- ödeme ekranında da hiç çıkmıyordu (fiilen askıda kalıyordu). Peşin dalında
-- paid_amount = total_amount da yazılıyor artık; trg_sync_invoice_remaining_amount
-- bunu remaining_amount=0'a indirir.
create or replace function public.fn_invoice_approval_cascade()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_requires_payment boolean;
  v_invoice public.invoices%rowtype;
begin
  if OLD.status = 'bekliyor' and NEW.status = 'onaylandı' then
    select requires_payment_tracking into v_requires_payment
      from public.invoices where id = NEW.invoice_id;

    if coalesce(v_requires_payment, true) then
      update public.invoices set status = 'odeme_bekliyor', updated_at = now() where id = NEW.invoice_id;
    else
      update public.invoices set status = 'onaylandı', paid_amount = total_amount, updated_at = now() where id = NEW.invoice_id;
    end if;

  elsif OLD.status = 'bekliyor' and NEW.status = 'reddedildi' then
    update public.invoices set status = 'reddedildi', updated_at = now() where id = NEW.invoice_id;

  elsif OLD.status = 'bekliyor' and NEW.status = 'duzeltme_istendi' then
    update public.invoices set status = 'duzeltme_bekliyor', updated_at = now()
      where id = NEW.invoice_id
      returning * into v_invoice;

    if v_invoice.id is not null then
      perform public.notify_role('muhasebe', auth.uid(), v_invoice.project_id,
        'invoice', v_invoice.id, 'status_changed',
        'Faturanızda düzeltme istendi: ' || coalesce(v_invoice.invoice_no, ''),
        coalesce(NEW.note, 'Düzeltme gerekçesi belirtilmedi.'));
    end if;

  elsif OLD.status = 'duzeltme_istendi' and NEW.status = 'bekliyor' then
    update public.invoices set status = 'yönetici_onayında', updated_at = now() where id = NEW.invoice_id;

  end if;

  NEW.reviewed_at = now();
  return NEW;
end;
$function$;

-- Mevcut kayıtlardan bu durumda kalmış olan (SAT-2026-033/FTR-2026-QATEST01
-- dahil) tek satırı geriye dönük düzelt.
update public.invoices
set paid_amount = total_amount
where status = 'onaylandı' and coalesce(requires_payment_tracking, false) = false and paid_amount = 0;
