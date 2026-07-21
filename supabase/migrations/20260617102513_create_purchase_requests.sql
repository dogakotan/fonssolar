
-- 1. Satın alma talepleri ana tablo
CREATE TABLE public.purchase_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    text REFERENCES public.projects(id) ON DELETE SET NULL,
  requested_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title         text NOT NULL,
  urgency       text NOT NULL DEFAULT 'normal' CHECK (urgency IN ('normal','acil','çok_acil')),
  status        text NOT NULL DEFAULT 'bekliyor' CHECK (status IN ('bekliyor','onaylandı','reddedildi','iptal')),
  approved_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at   timestamptz,
  reject_note   text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 2. Talep kalemleri (her talepte birden fazla ürün olabilir)
CREATE TABLE public.pr_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES public.purchase_requests(id) ON DELETE CASCADE,
  name        text NOT NULL,
  quantity    numeric NOT NULL DEFAULT 1,
  unit        text NOT NULL DEFAULT 'Adet',
  unit_price  numeric,
  total_price numeric GENERATED ALWAYS AS (quantity * COALESCE(unit_price, 0)) STORED,
  notes       text,
  order_index int4 NOT NULL DEFAULT 0
);

-- 3. RLS
ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pr_items ENABLE ROW LEVEL SECURITY;

-- Herkes okuyabilir (authenticated)
CREATE POLICY "PR okuma" ON public.purchase_requests
  FOR SELECT USING (public.get_my_role() IN ('admin','muhasebe','santiye_sefi','muhendis','koordinator'));

-- Talep oluşturma: tüm roller (satış uzmanı da dahil — role_key'e 'satis_uzmani' ekleyeceğiz)
CREATE POLICY "PR ekleme" ON public.purchase_requests
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Güncelleme: sadece admin (onay/red) veya kendi talebi (iptal)
CREATE POLICY "PR güncelleme" ON public.purchase_requests
  FOR UPDATE USING (
    public.get_my_role() = 'admin' OR auth.uid() = requested_by
  );

-- PR items
CREATE POLICY "PR items okuma" ON public.pr_items
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "PR items ekleme" ON public.pr_items
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "PR items güncelleme" ON public.pr_items
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "PR items silme" ON public.pr_items
  FOR DELETE USING (auth.role() = 'authenticated');

-- 4. updated_at trigger
CREATE TRIGGER purchase_requests_updated_at
  BEFORE UPDATE ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. role_key constraint'e satis_uzmani ekle
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_key_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_key_check
  CHECK (role_key IN ('admin','muhasebe','santiye_sefi','muhendis','koordinator','satis_uzmani'));

-- 6. invoices tablosuna purchase_request_id bağlantısı ekle
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS purchase_request_id uuid REFERENCES public.purchase_requests(id) ON DELETE SET NULL;

-- 7. Fatura eklenince onaylı PR'ı maliyet tablosuna yansıtan trigger
CREATE OR REPLACE FUNCTION sync_pr_to_cost()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_pr public.purchase_requests%ROWTYPE;
  v_total numeric;
BEGIN
  -- Faturada purchase_request_id varsa ve fatura onaylandıysa
  IF NEW.purchase_request_id IS NOT NULL AND NEW.status = 'onaylandı' THEN
    SELECT * INTO v_pr FROM public.purchase_requests WHERE id = NEW.purchase_request_id;
    SELECT SUM(total_price) INTO v_total FROM public.pr_items WHERE request_id = NEW.purchase_request_id;

    -- cost_allocations'a ekle (yoksa)
    INSERT INTO public.cost_allocations (invoice_id, project_id, amount, category, note)
    VALUES (
      NEW.id,
      COALESCE(NEW.project_id, v_pr.project_id),
      COALESCE(NEW.amount, v_total, 0),
      COALESCE(NEW.category, 'malzeme'),
      'Satın alma talebi: ' || v_pr.title
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_pr_cost_sync
  AFTER INSERT OR UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION sync_pr_to_cost();

