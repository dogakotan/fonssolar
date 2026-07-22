drop index if exists public.tickets_workflow_stage_idx;

alter table public.tickets
  drop constraint if exists tickets_workflow_stage_check;

alter table public.tickets
  drop column if exists workflow_stage;

alter table public.tickets
  add column workflow_stage text
  generated always as (
    case
      when status = 'işlemde' then 'islemde'
      when status = any (array['kapatıldı', 'iptal_edildi', 'çözüldü']) then 'sonuclandi'
      else 'acik'
    end
  ) stored;

alter table public.tickets
  add constraint tickets_workflow_stage_check
  check (workflow_stage = any (array['acik', 'islemde', 'sonuclandi']));

create index tickets_workflow_stage_idx
  on public.tickets (workflow_stage);

comment on column public.tickets.workflow_stage is
  'Klasik ticket akışı: acik, islemde, sonuclandi. Kapatılan ve iptal edilen ticketlar sonuclandi aşamasında gruplanır.';
