-- Keep direct projects table reads aligned with the canonical project-scope helper.
-- This gives manager/cross-project roles all projects while preserving assigned-project
-- and user_project_access isolation for project-scoped roles.
alter policy projects_select on public.projects
to authenticated
using (public.has_project_access(id));
