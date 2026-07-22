alter table public.tickets
  add column workflow_stage text
  generated always as (
    case
      when status = 'işlemde' then 'islemde'
      when status = any (array['kapatıldı', 'iptal_edildi', 'çözüldü']) then 'tamamlandi'
      else 'bekliyor'
    end
  ) stored;

alter table public.tickets
  add constraint tickets_workflow_stage_check
  check (workflow_stage = any (array['bekliyor', 'islemde', 'tamamlandi']));

create index tickets_workflow_stage_idx
  on public.tickets (workflow_stage);

comment on column public.tickets.workflow_stage is
  'Ticket arayüzünün üç aşamalı akışı: bekliyor, islemde, tamamlandi. Kapatılan ve iptal edilen ticketlar tamamlandi aşamasında gruplanır.';
