
DROP TABLE IF EXISTS public.pr_items CASCADE;
DROP TABLE IF EXISTS public.pr_approvals CASCADE;
DROP TABLE IF EXISTS public.purchase_requests CASCADE;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role_key IN ('admin','muhasebe','santiye_sefi','muhendis','koordinator','satis_uzmani'));

CREATE TABLE public.purchase_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    text REFERENCES public.projects(id) ON DELETE SET NULL,
  requested_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title         text NOT NULL,
  urgency       text NOT NULL DEFAULT 'normal' CHECK (urgency IN ('normal','acil','çok_acil')),
  status        text NOT NULL DEFAULT 'bekliyor'
                CHECK (status IN ('bekliyor','onaylandı','reddedildi')),
  notes         text,
  approved_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at   timestamptz,
  reject_note   text,
  invoice_id    uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.pr_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES public.purchase_requests(id) ON DELETE CASCADE,
  name        text NOT NULL,
  quantity    numeric NOT NULL DEFAULT 1,
  unit        text NOT NULL DEFAULT 'Adet',
  unit_price  numeric,
  total_price numeric GENERATED ALWAYS AS (quantity * COALESCE(unit_price, 0)) STORED,
  notes       text
);

ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pr_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Talep okuma" ON public.purchase_requests
  FOR SELECT USING (
    public.get_my_role() IN ('admin','muhasebe')
    OR auth.uid() = requested_by
  );

CREATE POLICY "Talep oluşturma" ON public.purchase_requests
  FOR INSERT WITH CHECK (
    public.get_my_role() IN ('admin','satis_uzmani','santiye_sefi','muhendis','koordinator')
  );

CREATE POLICY "Admin talep güncelleme" ON public.purchase_requests
  FOR UPDATE USING (public.get_my_role() = 'admin');

CREATE POLICY "Kalem okuma" ON public.pr_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.purchase_requests pr
      WHERE pr.id = pr_items.request_id
      AND (public.get_my_role() IN ('admin','muhasebe') OR pr.requested_by = auth.uid())
    )
  );

CREATE POLICY "Kalem oluşturma" ON public.pr_items
  FOR INSERT WITH CHECK (
    public.get_my_role() IN ('admin','satis_uzmani','santiye_sefi','muhendis','koordinator')
  );

CREATE POLICY "Admin kalem güncelleme" ON public.pr_items
  FOR UPDATE USING (public.get_my_role() = 'admin');

CREATE TRIGGER purchase_requests_updated_at
  BEFORE UPDATE ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION handle_purchase_request_approval()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total numeric;
  v_invoice_id uuid;
BEGIN
  IF OLD.status != 'bekliyor' OR NEW.status != 'onaylandı' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(total_price), 0)
  INTO v_total
  FROM public.pr_items
  WHERE request_id = NEW.id;

  INSERT INTO public.invoices (
    project_id, invoice_no, invoice_date,
    amount, vat_rate, category, description, status, source
  ) VALUES (
    NEW.project_id,
    'SAT-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(FLOOR(RANDOM()*9000+1000)::text, 4, '0'),
    CURRENT_DATE,
    v_total, 20, 'malzeme',
    'Satın alma talebi: ' || NEW.title,
    'bekliyor', 'satin_alma'
  )
  RETURNING id INTO v_invoice_id;

  NEW.invoice_id = v_invoice_id;
  NEW.approved_at = NOW();

  RETURN NEW;
END;
$$;

CREATE TRIGGER purchase_request_approval_trigger
  BEFORE UPDATE ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION handle_purchase_request_approval();

