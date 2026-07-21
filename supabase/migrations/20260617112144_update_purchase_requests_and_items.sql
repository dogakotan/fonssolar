
-- Eksik kolonları ekle
ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS approval_note text,
  ADD COLUMN IF NOT EXISTS note text;

-- Status constraint güncelle (fatura_kesildi ekle)
ALTER TABLE public.purchase_requests
  DROP CONSTRAINT IF EXISTS purchase_requests_status_check;
ALTER TABLE public.purchase_requests
  ADD CONSTRAINT purchase_requests_status_check
  CHECK (status IN ('bekliyor','onaylandı','reddedildi','fatura_kesildi'));

-- Urgency constraint
ALTER TABLE public.purchase_requests
  DROP CONSTRAINT IF EXISTS purchase_requests_urgency_check;
ALTER TABLE public.purchase_requests
  ADD CONSTRAINT purchase_requests_urgency_check
  CHECK (urgency IN ('normal','acil','çok_acil'));

-- Talep kalemleri tablosu (yoksa oluştur)
CREATE TABLE IF NOT EXISTS public.purchase_request_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES public.purchase_requests(id) ON DELETE CASCADE,
  name        text NOT NULL,
  quantity    numeric NOT NULL DEFAULT 1,
  unit        text NOT NULL DEFAULT 'Adet',
  unit_price  numeric,
  total_price numeric GENERATED ALWAYS AS (quantity * COALESCE(unit_price, 0)) STORED,
  note        text
);

ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_request_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "PR okuma" ON public.purchase_requests;
DROP POLICY IF EXISTS "PR ekleme" ON public.purchase_requests;
DROP POLICY IF EXISTS "PR güncelleme" ON public.purchase_requests;

CREATE POLICY "PR okuma" ON public.purchase_requests
  FOR SELECT USING (public.get_my_role() IN ('admin','muhasebe','santiye_sefi','muhendis','koordinator'));
CREATE POLICY "PR ekleme" ON public.purchase_requests
  FOR INSERT WITH CHECK (public.get_my_role() IN ('admin','santiye_sefi','muhendis','koordinator'));
CREATE POLICY "PR güncelleme" ON public.purchase_requests
  FOR UPDATE USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "PR item okuma" ON public.purchase_request_items;
DROP POLICY IF EXISTS "PR item ekleme" ON public.purchase_request_items;
DROP POLICY IF EXISTS "PR item silme" ON public.purchase_request_items;

CREATE POLICY "PR item okuma" ON public.purchase_request_items
  FOR SELECT USING (public.get_my_role() IN ('admin','muhasebe','santiye_sefi','muhendis','koordinator'));
CREATE POLICY "PR item ekleme" ON public.purchase_request_items
  FOR INSERT WITH CHECK (public.get_my_role() IN ('admin','santiye_sefi','muhendis','koordinator'));
CREATE POLICY "PR item silme" ON public.purchase_request_items
  FOR DELETE USING (public.get_my_role() IN ('admin','santiye_sefi','muhendis','koordinator'));

-- Updated_at trigger
DROP TRIGGER IF EXISTS purchase_requests_updated_at ON public.purchase_requests;
CREATE TRIGGER purchase_requests_updated_at
  BEFORE UPDATE ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Onay trigger
CREATE OR REPLACE FUNCTION handle_purchase_request_approval()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'onaylandı' AND OLD.status = 'bekliyor' THEN
    NEW.approved_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchase_request_approval_trigger ON public.purchase_requests;
CREATE TRIGGER purchase_request_approval_trigger
  BEFORE UPDATE ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION handle_purchase_request_approval();

-- Örnek seed verisi
INSERT INTO public.purchase_requests (project_id, title, urgency, status, note)
VALUES
  ('kaptan-usak-ges', 'DC Kablo 4mm² - 500 Metre', 'acil', 'bekliyor', 'Kablo kanal döşeme için acil ihtiyaç'),
  ('kaptan-usak-ges', 'M10 Cıvata Seti - 1000 Adet', 'normal', 'bekliyor', 'Panel montajı için'),
  ('kaptan-usak-ges', 'Koruyucu İş Eldiveni - 20 Çift', 'normal', 'onaylandı', 'İSG gereksinimi'),
  ('kaptan-usak-ges', 'Topraklama Kablosu 16mm² - 200m', 'çok_acil', 'onaylandı', 'Topraklama hattı tamamlama');

