
ALTER TABLE public.agent_reports
  ADD CONSTRAINT agent_reports_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id);

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_purchase_request_id_fkey
  FOREIGN KEY (purchase_request_id) REFERENCES public.purchase_requests(id);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id);

