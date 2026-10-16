-- 1) invoices.status: taslak, duzeltme_bekliyor, odeme_bekliyor ekle; eski 'bekliyor' kalksın (kullanılmıyor)
ALTER TABLE public.invoices DROP CONSTRAINT invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check
  CHECK (status = ANY (ARRAY[
    'taslak'::text,
    'yönetici_onayında'::text,
    'duzeltme_bekliyor'::text,
    'onaylandı'::text,
    'odeme_bekliyor'::text,
    'ödendi'::text,
    'reddedildi'::text
  ]));

-- 2) invoice_approvals.status: duzeltme_istendi ekle
ALTER TABLE public.invoice_approvals DROP CONSTRAINT invoice_approvals_status_check;
ALTER TABLE public.invoice_approvals ADD CONSTRAINT invoice_approvals_status_check
  CHECK (status = ANY (ARRAY[
    'bekliyor'::text,
    'onaylandı'::text,
    'reddedildi'::text,
    'duzeltme_istendi'::text
  ]));

-- 3) invoices: ödeme takibi opsiyonel kolonları
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS requires_payment_tracking boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_date date,
  ADD COLUMN IF NOT EXISTS payment_note text;

COMMENT ON COLUMN public.invoices.requires_payment_tracking IS
  'true ise yönetici onayından sonra fatura "odeme_bekliyor" durumuna geçer ve Ödeme Gir ile kapanır. false ise onay = kapanış (onaylandı terminal durum).';

-- 4) Eski 2 adımlı (muhasebe->yönetici) cascade fonksiyonunu tek adımlı + düzeltme + ödeme-takibi mantığına göre değiştir
CREATE OR REPLACE FUNCTION public.fn_invoice_approval_cascade()
RETURNS trigger
LANGUAGE plpgsql
AS $$
declare
  v_requires_payment boolean;
begin
  -- Yönetici onayladı
  if OLD.status = 'bekliyor' and NEW.status = 'onaylandı' then
    select requires_payment_tracking into v_requires_payment
      from public.invoices where id = NEW.invoice_id;

    if coalesce(v_requires_payment, true) then
      update public.invoices set status = 'odeme_bekliyor', updated_at = now() where id = NEW.invoice_id;
    else
      update public.invoices set status = 'onaylandı', updated_at = now() where id = NEW.invoice_id;
    end if;

  -- Yönetici reddetti
  elsif OLD.status = 'bekliyor' and NEW.status = 'reddedildi' then
    update public.invoices set status = 'reddedildi', updated_at = now() where id = NEW.invoice_id;

  -- Yönetici düzeltme istedi
  elsif OLD.status = 'bekliyor' and NEW.status = 'duzeltme_istendi' then
    update public.invoices set status = 'duzeltme_bekliyor', updated_at = now() where id = NEW.invoice_id;

  -- Muhasebe düzeltip tekrar gönderdi (approval satırı 'duzeltme_istendi' -> 'bekliyor' güncellenir)
  elsif OLD.status = 'duzeltme_istendi' and NEW.status = 'bekliyor' then
    update public.invoices set status = 'yönetici_onayında', updated_at = now() where id = NEW.invoice_id;

  end if;

  NEW.reviewed_at = now();
  return NEW;
end;
$$;

-- 5) Fatura ilk kez onaya gönderildiğinde (taslak -> gönder) invoice_approvals satırı eklenince
--    invoices.status'u otomatik 'yönetici_onayında' yap
CREATE OR REPLACE FUNCTION public.fn_invoice_approval_submitted()
RETURNS trigger
LANGUAGE plpgsql
AS $$
begin
  if NEW.step = 1 and NEW.step_label = 'Yönetici Onayı' then
    update public.invoices set status = 'yönetici_onayında', updated_at = now() where id = NEW.invoice_id;
  end if;
  return NEW;
end;
$$;

DROP TRIGGER IF EXISTS trg_invoice_approval_submitted ON public.invoice_approvals;
CREATE TRIGGER trg_invoice_approval_submitted
  AFTER INSERT ON public.invoice_approvals
  FOR EACH ROW EXECUTE FUNCTION public.fn_invoice_approval_submitted();
