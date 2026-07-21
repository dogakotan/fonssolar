
-- 1. Tedarikçiler
CREATE TABLE public.suppliers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  tax_no       text,
  contact      text,
  email        text,
  phone        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated okuyabilir" ON public.suppliers FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated ekleyebilir" ON public.suppliers FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated güncelleyebilir" ON public.suppliers FOR UPDATE USING (auth.role() = 'authenticated');

-- 2. Faturalar
CREATE TABLE public.invoices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       text REFERENCES public.projects(id) ON DELETE SET NULL,
  supplier_id      uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  external_ref     text,                          -- Hesap fatura no
  invoice_no       text NOT NULL,
  invoice_date     date NOT NULL,
  due_date         date,
  amount           numeric(15,2) NOT NULL DEFAULT 0,
  vat_rate         numeric(5,2) NOT NULL DEFAULT 20,
  vat_amount       numeric(15,2) GENERATED ALWAYS AS (amount * vat_rate / 100) STORED,
  total_amount     numeric(15,2) GENERATED ALWAYS AS (amount + amount * vat_rate / 100) STORED,
  category         text,                          -- malzeme | hizmet | nakliye | ekipman | diğer
  description      text,
  status           text NOT NULL DEFAULT 'bekliyor'
                   CHECK (status IN ('bekliyor','muhasebe_onayında','yönetici_onayında','onaylandı','reddedildi')),
  source           text NOT NULL DEFAULT 'manuel'
                   CHECK (source IN ('manuel','csv','hesap_api')),
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated okuyabilir" ON public.invoices FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated ekleyebilir" ON public.invoices FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated güncelleyebilir" ON public.invoices FOR UPDATE USING (auth.role() = 'authenticated');

CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. Onay adımları (muhasebe → yönetici zinciri)
CREATE TABLE public.invoice_approvals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  step         int4 NOT NULL,                     -- 1: muhasebe, 2: yönetici
  step_label   text NOT NULL,                     -- 'Muhasebe Onayı' | 'Yönetici Onayı'
  status       text NOT NULL DEFAULT 'bekliyor'
               CHECK (status IN ('bekliyor','onaylandı','reddedildi')),
  reviewer_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at  timestamptz,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_approvals_invoice_step_unique UNIQUE (invoice_id, step)
);

ALTER TABLE public.invoice_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated okuyabilir" ON public.invoice_approvals FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated ekleyebilir" ON public.invoice_approvals FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated güncelleyebilir" ON public.invoice_approvals FOR UPDATE USING (auth.role() = 'authenticated');

-- 4. Proje maliyet tahsisi (onaylanan fatura hangi projeye ne kadar)
CREATE TABLE public.cost_allocations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  project_id   text NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  amount       numeric(15,2) NOT NULL DEFAULT 0,  -- bu projeye düşen tutar
  category     text,                              -- malzeme | hizmet | nakliye | ekipman
  note         text,
  allocated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  allocated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cost_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated okuyabilir" ON public.cost_allocations FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated ekleyebilir" ON public.cost_allocations FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated güncelleyebilir" ON public.cost_allocations FOR UPDATE USING (auth.role() = 'authenticated');

-- 5. Bütçe kalemleri (proje bazlı planlanan bütçe)
CREATE TABLE public.budget_lines (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   text NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category     text NOT NULL,
  name         text NOT NULL,
  planned_amount numeric(15,2) NOT NULL DEFAULT 0,
  order_index  int4 NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.budget_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated okuyabilir" ON public.budget_lines FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated ekleyebilir" ON public.budget_lines FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated güncelleyebilir" ON public.budget_lines FOR UPDATE USING (auth.role() = 'authenticated');

-- 6. Maliyet özeti view (dashboard için)
CREATE OR REPLACE VIEW public.project_cost_summary AS
SELECT
  p.id AS project_id,
  p.name AS project_name,
  COALESCE(bl.planned_total, 0) AS planned_total,
  COALESCE(ca.actual_total, 0) AS actual_total,
  COALESCE(ca.actual_total, 0) - COALESCE(bl.planned_total, 0) AS variance,
  CASE
    WHEN COALESCE(bl.planned_total, 0) = 0 THEN 0
    ELSE ROUND((COALESCE(ca.actual_total, 0) / bl.planned_total * 100)::numeric, 1)
  END AS spend_pct
FROM public.projects p
LEFT JOIN (
  SELECT project_id, SUM(planned_amount) AS planned_total
  FROM public.budget_lines GROUP BY project_id
) bl ON bl.project_id = p.id
LEFT JOIN (
  SELECT project_id, SUM(amount) AS actual_total
  FROM public.cost_allocations GROUP BY project_id
) ca ON ca.project_id = p.id;

-- 7. Onay zinciri otomatik başlatma trigger'ı
CREATE OR REPLACE FUNCTION create_invoice_approval_chain()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.invoice_approvals (invoice_id, step, step_label, status) VALUES
    (NEW.id, 1, 'Muhasebe Onayı', 'bekliyor'),
    (NEW.id, 2, 'Yönetici Onayı', 'bekliyor');
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_approval_chain_trigger
  AFTER INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION create_invoice_approval_chain();

-- 8. Muhasebe onaylandığında yönetici adımını aktif et,
--    yönetici onayladığında faturayı 'onaylandı' yap
CREATE OR REPLACE FUNCTION handle_approval_step()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'onaylandı' AND NEW.step = 1 THEN
    -- Muhasebe onayladı → fatura durumunu yönetici onayına al
    UPDATE public.invoices SET status = 'yönetici_onayında' WHERE id = NEW.invoice_id;
    NEW.reviewed_at = now();
  ELSIF NEW.status = 'onaylandı' AND NEW.step = 2 THEN
    -- Yönetici onayladı → fatura onaylandı
    UPDATE public.invoices SET status = 'onaylandı' WHERE id = NEW.invoice_id;
    NEW.reviewed_at = now();
  ELSIF NEW.status = 'reddedildi' THEN
    -- Herhangi bir adımda red → fatura reddedildi
    UPDATE public.invoices SET status = 'reddedildi' WHERE id = NEW.invoice_id;
    NEW.reviewed_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_approval_step_trigger
  BEFORE UPDATE ON public.invoice_approvals
  FOR EACH ROW EXECUTE FUNCTION handle_approval_step();

