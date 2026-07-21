
-- budget_lines
DROP POLICY IF EXISTS "budget_lines_select" ON budget_lines;
DROP POLICY IF EXISTS "budget_lines_insert" ON budget_lines;
DROP POLICY IF EXISTS "budget_lines_update" ON budget_lines;
DROP POLICY IF EXISTS "budget_lines_delete" ON budget_lines;

CREATE POLICY "budget_lines_select" ON budget_lines
  FOR SELECT USING (get_my_role() = ANY (ARRAY['admin','muhasebe','proje_koordinatoru']));
CREATE POLICY "budget_lines_insert" ON budget_lines
  FOR INSERT WITH CHECK (get_my_role() = ANY (ARRAY['admin','muhasebe']));
CREATE POLICY "budget_lines_update" ON budget_lines
  FOR UPDATE USING (get_my_role() = ANY (ARRAY['admin','muhasebe']));
CREATE POLICY "budget_lines_delete" ON budget_lines
  FOR DELETE USING (get_my_role() = 'admin');

-- cost_allocations
DROP POLICY IF EXISTS "cost_allocations_select" ON cost_allocations;
DROP POLICY IF EXISTS "cost_allocations_insert" ON cost_allocations;
DROP POLICY IF EXISTS "cost_allocations_update" ON cost_allocations;
DROP POLICY IF EXISTS "cost_allocations_delete" ON cost_allocations;

CREATE POLICY "cost_allocations_select" ON cost_allocations
  FOR SELECT USING (get_my_role() = ANY (ARRAY['admin','muhasebe']));
CREATE POLICY "cost_allocations_insert" ON cost_allocations
  FOR INSERT WITH CHECK (get_my_role() = ANY (ARRAY['admin','muhasebe']));
CREATE POLICY "cost_allocations_update" ON cost_allocations
  FOR UPDATE USING (get_my_role() = ANY (ARRAY['admin','muhasebe']));
CREATE POLICY "cost_allocations_delete" ON cost_allocations
  FOR DELETE USING (get_my_role() = 'admin');

-- invoices
DROP POLICY IF EXISTS "invoices_select" ON invoices;
DROP POLICY IF EXISTS "invoices_insert" ON invoices;
DROP POLICY IF EXISTS "invoices_update" ON invoices;
DROP POLICY IF EXISTS "invoices_delete" ON invoices;

CREATE POLICY "invoices_select" ON invoices
  FOR SELECT USING (get_my_role() = ANY (ARRAY['admin','muhasebe','satin_alma_uzmani','proje_koordinatoru']));
CREATE POLICY "invoices_insert" ON invoices
  FOR INSERT WITH CHECK (get_my_role() = ANY (ARRAY['admin','muhasebe','satin_alma_uzmani']));
CREATE POLICY "invoices_update" ON invoices
  FOR UPDATE USING (get_my_role() = ANY (ARRAY['admin','muhasebe']));
CREATE POLICY "invoices_delete" ON invoices
  FOR DELETE USING (get_my_role() = 'admin');

-- invoice_approvals
DROP POLICY IF EXISTS "invoice_approvals_select" ON invoice_approvals;
DROP POLICY IF EXISTS "invoice_approvals_insert" ON invoice_approvals;
DROP POLICY IF EXISTS "invoice_approvals_update" ON invoice_approvals;

CREATE POLICY "invoice_approvals_select" ON invoice_approvals
  FOR SELECT USING (get_my_role() = ANY (ARRAY['admin','muhasebe','satin_alma_uzmani']));
CREATE POLICY "invoice_approvals_insert" ON invoice_approvals
  FOR INSERT WITH CHECK (get_my_role() = ANY (ARRAY['admin','muhasebe']));
CREATE POLICY "invoice_approvals_update" ON invoice_approvals
  FOR UPDATE USING (get_my_role() = ANY (ARRAY['admin','muhasebe']));

