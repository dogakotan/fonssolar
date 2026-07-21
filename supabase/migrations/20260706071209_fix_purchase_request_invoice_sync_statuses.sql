-- purchase_requests_status_check yalnızca şu değerlere izin veriyor:
-- talep_olusturuldu, fiyat_girildi, onay_bekliyor, onaylandi, reddedildi, satin_alindi,
-- fatura_bekliyor, fatura_onay_bekliyor, faturasi_kesildi, iptal.
-- Önceki denemede geçersiz 'faturada'/'ödendi' değerleri kullanılmıştı; gerçek enum'a göre düzeltiliyor.
CREATE OR REPLACE FUNCTION public.sync_purchase_request_from_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.purchase_request_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Muhasebe faturayı oluşturdu -> talep artık faturanın kendi onay zincirinde
    UPDATE public.purchase_requests
    SET invoice_id = NEW.id, status = 'fatura_onay_bekliyor', updated_at = now()
    WHERE id = NEW.purchase_request_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'onaylandı' THEN
      -- Fatura tamamen onaylandı -> talep tamamlandı, maliyet tablosuna yansır (get_finans_overview zaten invoices.status='onaylandı' sayıyor)
      UPDATE public.purchase_requests SET status = 'faturasi_kesildi', updated_at = now() WHERE id = NEW.purchase_request_id;
    ELSIF NEW.status = 'reddedildi' THEN
      -- Fatura reddedildi -> talep tekrar "onaylandi" durumuna döner, link temizlenir, yeniden fatura kesilebilir
      UPDATE public.purchase_requests SET status = 'onaylandi', invoice_id = NULL, updated_at = now() WHERE id = NEW.purchase_request_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

