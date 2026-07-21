
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_supplier_invoice_no_unique UNIQUE (supplier_id, invoice_no);

ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_tax_no_unique UNIQUE (tax_no);

ALTER TABLE public.procurement_items
  ADD CONSTRAINT procurement_items_project_item_no_unique UNIQUE (project_id, item_no);

ALTER TABLE public.schedule_activities
  ADD CONSTRAINT schedule_activities_project_activity_no_unique UNIQUE (project_id, activity_no);

ALTER TABLE public.budget_lines
  ADD CONSTRAINT budget_lines_project_category_name_unique UNIQUE (project_id, category, name);

