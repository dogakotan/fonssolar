-- Changes: admin / proje_yoneticisi write, delete (muhasebe can read only)
create policy changes_insert on public.changes for insert to authenticated with check (can_manage_project_control(project_id));
create policy changes_update on public.changes for update to authenticated using (can_manage_project_control(project_id)) with check (can_manage_project_control(project_id));
create policy changes_delete on public.changes for delete to authenticated using (can_manage_project_control(project_id));

-- Claims: same restriction (sensitive contractual records)
create policy claims_insert on public.claims for insert to authenticated with check (can_manage_project_control(project_id));
create policy claims_update on public.claims for update to authenticated using (can_manage_project_control(project_id)) with check (can_manage_project_control(project_id));
create policy claims_delete on public.claims for delete to authenticated using (can_manage_project_control(project_id));

-- Interfaces: site manager may also write (matches who can read)
create policy interfaces_insert on public.interfaces for insert to authenticated with check (can_write_project_control(project_id));
create policy interfaces_update on public.interfaces for update to authenticated using (can_write_project_control(project_id)) with check (can_write_project_control(project_id));
create policy interfaces_delete on public.interfaces for delete to authenticated using (can_manage_project_control(project_id));

-- Document revisions: required for the Document/Drawing register to work
create policy document_revisions_insert on public.document_revisions for insert to authenticated with check (can_write_project_control(project_id));
create policy document_revisions_update on public.document_revisions for update to authenticated using (can_write_project_control(project_id)) with check (can_write_project_control(project_id));
create policy document_revisions_delete on public.document_revisions for delete to authenticated using (can_manage_project_control(project_id));