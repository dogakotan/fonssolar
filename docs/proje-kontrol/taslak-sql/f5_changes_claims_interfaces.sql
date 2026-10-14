-- ============================================================================
-- TASLAK — UYGULANMADI. Change, Claim, Interface register tabloları (minimal).
-- Tarih: 14.10.2026. Durum: uygulama kararı kullanıcıda ("uygula").
-- Test (14.10.2026, canlıda ROLLBACK, MCP, Adım 2 yöntemi): BÖLÜM A + f5_dogrulama.sql tek işlemde →
--   "DOGRULAMA SONUCU: OK | F5 | 6 kontrol grubu". Oturum 0 aktif bağlantı 0; Oturum 5 parmak izi Oturum 0 ile
--   birebir (katalog md5'leri, sayaçlar boş, durum geçmişi 0, yeni tablo yok).
-- Geri alma testi (14.10.2026, canlıda ROLLBACK): BÖLÜM A → veri ekleme → koruma onaysız geri almayı durdurdu →
--   BÖLÜM B (onaylı) → 16 anahtarlı parmak izi (tablo, tip, fonksiyon, kısıt, trigger, indeks, yetki, RLS, yorum,
--   sayaç, durum geçmişi, risk, register satırları) uygulama öncesiyle birebir.
-- Yedek: Karar 84 ile yedeksiz uygulanabilir (yalnızca yeni tablolar). Uygulama mesai dışında, apply_migration ile.
--
-- Çelişkiler (register-veri-giris-rehberi.md §0 R5):
--   * Karar 13/66: bu üç register Faz 5'te. Karar 63: PM'in tüm projelere erişimi Faz 5 Claim/Change öncesinde
--     yeniden açılır. Karar 10: change/claim dört göz; bu taslakta onay akışı YOK (RPC'ler Faz 5).
--   * Önekler öneri: CHG, CLM, ITF (CONVENTIONS §3: yeni register'ın öneki migration'ında tanımlanır).
--     ITF seçildi: IFC revizyon durumu ("issued for construction") ile karışmasın.
--
-- Kapsam:
--   * Yalnızca yeni tablo + bu tablolara ait trigger, index, RLS. Mevcut hiçbir tablonun şeması değişmez.
--   * Mevcut nesneler yalnızca kullanılır: projects/profiles/project_wbs/project_areas/project_tasks (FK hedefi;
--     FK eklenirken hedef tabloda kısa SHARE ROW EXCLUSIVE kilit alınır), fn_assign_register_no, next_register_no,
--     fn_log_register_status, update_updated_at_column (trigger fonksiyonu olarak).
--   * Çalışma anında trigger'lar mevcut iki tabloya SATIR yazar: project_register_counters (register_code CHG/CLM/ITF)
--     ve register_status_history (register_code change/claim/interface). İki tabloda register_code kısıtı yok
--     (14.10 salt okunur kontrol).
--   * project_register_settings'e claim_notice_days EKLENMEDİ (mevcut tabloya dokunmamak için); ihbar son tarihi
--     claims.notice_deadline'a elle yazılır.
--
-- Yetki (Karar 6, b1_register_permissions.sql A2):
--   change    : görüntüleme admin, proje_yoneticisi, muhasebe; şantiye şefi göremez
--   claim     : görüntüleme admin, proje_yoneticisi, muhasebe; şantiye şefi göremez
--   interface : görüntüleme admin, proje_yoneticisi, santiye_sefi; muhasebe göremez
--   Yazma: uygulamadan hiç kimse (G-01 deseni; RPC'ler Faz 5). Panel (postgres) RLS'i atlar.
--   B1 henüz canlıda değil; register_can() yerine rol listesi get_my_role() ile. B1 uygulandıktan sonra (Faz 5)
--   policy'ler CONVENTIONS §4 şablonuna (register_can(<tür>,'view')) çevrilir.
--
-- Ortak kolonlar CONVENTIONS §2: record_state/source/approved_*/rejected_reason baştan eklendi (B3 bu tablolara
-- ADD COLUMN yapmaz). B3'ün A0 boşluk kontrolü bu tabloları saymaz; B3 RPC eşlemesine Faz 5'te eklenir.
-- task_id kolonu var ama Karar 69 gereği 6b'ye kadar boş kalır.
-- ============================================================================

-- ############################################################################
-- BÖLÜM A — UYGULA
-- ############################################################################
begin;
set local lock_timeout = '3s';

-- ── A1 · changes ──
create table public.changes (
  id               uuid primary key default gen_random_uuid(),
  project_id       text not null references public.projects(id) on delete cascade,
  change_no        text not null,
  title            text not null,
  description      text,
  origin           text not null default 'other',
  status           text not null default 'identified',
  priority         text not null default 'medium',
  cost_estimate    numeric(14,2),
  currency         text not null default 'TRY',
  time_impact_days integer,
  contract_ref     text,
  assigned_to      uuid references public.profiles(id) on delete set null,
  due_date         date,
  wbs_id           uuid,
  area_id          uuid,
  task_id          uuid,
  record_state     text not null default 'draft',
  source           text not null default 'manual',
  created_by       uuid default auth.uid() references public.profiles(id) on delete set null,
  approved_by      uuid references public.profiles(id) on delete set null,
  approved_at      timestamptz,
  rejected_reason  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint changes_project_id_id_key unique (project_id, id),
  constraint changes_project_id_change_no_key unique (project_id, change_no),
  constraint changes_origin_check check (origin in ('owner_request','design_change','site_condition','other')),
  constraint changes_status_check check (status in ('identified','submitted','approved','rejected','implemented')),
  constraint changes_priority_check check (priority in ('low','medium','high','critical')),
  constraint changes_currency_check check (currency in ('TRY','USD','EUR')),
  constraint changes_record_state_check check (record_state in ('draft','pending_approval','approved','rejected')),
  constraint changes_source_check check (source in ('manual','ai','import')),
  constraint changes_wbs_fk foreign key (project_id, wbs_id) references public.project_wbs(project_id, id),
  constraint changes_area_fk foreign key (project_id, area_id) references public.project_areas(project_id, id),
  constraint changes_task_fk foreign key (project_id, task_id) references public.project_tasks(project_id, id)
);
comment on table public.changes is
  'Change / Variation register (Faz 5). Numara trigger ile (CHG). Yazma uygulamadan yok; RPC Faz 5.';

-- ── A2 · claims ──
create table public.claims (
  id                uuid primary key default gen_random_uuid(),
  project_id        text not null references public.projects(id) on delete cascade,
  claim_no          text not null,
  change_id         uuid,
  title             text not null,
  description       text,
  notice_type       text not null,
  event_date        date not null,
  notice_deadline   date,
  notice_sent_at    timestamptz,
  amount_claimed    numeric(14,2),
  currency          text not null default 'TRY',
  time_claimed_days integer,
  contract_ref      text,
  status            text not null default 'notice_due',
  assigned_to       uuid references public.profiles(id) on delete set null,
  wbs_id            uuid,
  area_id           uuid,
  task_id           uuid,
  record_state      text not null default 'draft',
  source            text not null default 'manual',
  created_by        uuid default auth.uid() references public.profiles(id) on delete set null,
  approved_by       uuid references public.profiles(id) on delete set null,
  approved_at       timestamptz,
  rejected_reason   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint claims_project_id_id_key unique (project_id, id),
  constraint claims_project_id_claim_no_key unique (project_id, claim_no),
  constraint claims_notice_type_check check (notice_type in ('time','cost','both')),
  constraint claims_status_check check (status in ('notice_due','notice_sent','submitted','negotiating','settled','rejected')),
  constraint claims_currency_check check (currency in ('TRY','USD','EUR')),
  constraint claims_deadline_after_event check (notice_deadline is null or notice_deadline >= event_date),
  constraint claims_time_nonneg check (time_claimed_days is null or time_claimed_days >= 0),
  constraint claims_record_state_check check (record_state in ('draft','pending_approval','approved','rejected')),
  constraint claims_source_check check (source in ('manual','ai','import')),
  constraint claims_change_fk foreign key (project_id, change_id) references public.changes(project_id, id),
  constraint claims_wbs_fk foreign key (project_id, wbs_id) references public.project_wbs(project_id, id),
  constraint claims_area_fk foreign key (project_id, area_id) references public.project_areas(project_id, id),
  constraint claims_task_fk foreign key (project_id, task_id) references public.project_tasks(project_id, id)
);
comment on table public.claims is
  'Claim & Notice register (Faz 5). İhbar son tarihi notice_deadline (proje ayarı yok). Numara trigger ile (CLM).';

-- ── A3 · interfaces ──
create table public.interfaces (
  id              uuid primary key default gen_random_uuid(),
  project_id      text not null references public.projects(id) on delete cascade,
  interface_no    text not null,
  title           text not null,
  description     text,
  interface_type  text,
  party_a         text not null,
  party_b         text not null,
  status          text not null default 'open',
  priority        text not null default 'medium',
  assigned_to     uuid references public.profiles(id) on delete set null,
  due_date        date,
  wbs_id          uuid,
  area_id         uuid,
  task_id         uuid,
  record_state    text not null default 'draft',
  source          text not null default 'manual',
  created_by      uuid default auth.uid() references public.profiles(id) on delete set null,
  approved_by     uuid references public.profiles(id) on delete set null,
  approved_at     timestamptz,
  rejected_reason text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint interfaces_project_id_id_key unique (project_id, id),
  constraint interfaces_project_id_interface_no_key unique (project_id, interface_no),
  constraint interfaces_status_check check (status in ('open','agreed','closed')),
  constraint interfaces_priority_check check (priority in ('low','medium','high','critical')),
  constraint interfaces_parties_distinct check (party_a <> party_b),
  constraint interfaces_record_state_check check (record_state in ('draft','pending_approval','approved','rejected')),
  constraint interfaces_source_check check (source in ('manual','ai','import')),
  constraint interfaces_wbs_fk foreign key (project_id, wbs_id) references public.project_wbs(project_id, id),
  constraint interfaces_area_fk foreign key (project_id, area_id) references public.project_areas(project_id, id),
  constraint interfaces_task_fk foreign key (project_id, task_id) references public.project_tasks(project_id, id)
);
comment on table public.interfaces is
  'Interface register (Faz 5). Taraflar serbest metin. Numara trigger ile (ITF).';

-- ── A4 · Trigger'lar (mevcut fonksiyonlar; numara, durum geçmişi, updated_at) ──
create trigger trg_changes_assign_no before insert on public.changes
  for each row execute function public.fn_assign_register_no('change_no', 'CHG');
create trigger trg_changes_status_history after insert or update of status on public.changes
  for each row execute function public.fn_log_register_status('change');
create trigger trg_changes_updated_at before update on public.changes
  for each row execute function public.update_updated_at_column();

create trigger trg_claims_assign_no before insert on public.claims
  for each row execute function public.fn_assign_register_no('claim_no', 'CLM');
create trigger trg_claims_status_history after insert or update of status on public.claims
  for each row execute function public.fn_log_register_status('claim');
create trigger trg_claims_updated_at before update on public.claims
  for each row execute function public.update_updated_at_column();

create trigger trg_interfaces_assign_no before insert on public.interfaces
  for each row execute function public.fn_assign_register_no('interface_no', 'ITF');
create trigger trg_interfaces_status_history after insert or update of status on public.interfaces
  for each row execute function public.fn_log_register_status('interface');
create trigger trg_interfaces_updated_at before update on public.interfaces
  for each row execute function public.update_updated_at_column();

-- ── A5 · FK indeksleri (B2 dersi: indekssiz FK bırakılmaz; project_id unique anahtarların başında) ──
create index idx_changes_wbs on public.changes (wbs_id) where wbs_id is not null;
create index idx_changes_area on public.changes (area_id) where area_id is not null;
create index idx_changes_task on public.changes (task_id) where task_id is not null;
create index idx_changes_assigned_to on public.changes (assigned_to) where assigned_to is not null;
create index idx_changes_created_by on public.changes (created_by) where created_by is not null;
create index idx_changes_approved_by on public.changes (approved_by) where approved_by is not null;

create index idx_claims_change on public.claims (change_id) where change_id is not null;
create index idx_claims_wbs on public.claims (wbs_id) where wbs_id is not null;
create index idx_claims_area on public.claims (area_id) where area_id is not null;
create index idx_claims_task on public.claims (task_id) where task_id is not null;
create index idx_claims_assigned_to on public.claims (assigned_to) where assigned_to is not null;
create index idx_claims_created_by on public.claims (created_by) where created_by is not null;
create index idx_claims_approved_by on public.claims (approved_by) where approved_by is not null;
create index idx_claims_notice_due on public.claims (project_id, notice_deadline) where status = 'notice_due';

create index idx_interfaces_wbs on public.interfaces (wbs_id) where wbs_id is not null;
create index idx_interfaces_area on public.interfaces (area_id) where area_id is not null;
create index idx_interfaces_task on public.interfaces (task_id) where task_id is not null;
create index idx_interfaces_assigned_to on public.interfaces (assigned_to) where assigned_to is not null;
create index idx_interfaces_created_by on public.interfaces (created_by) where created_by is not null;
create index idx_interfaces_approved_by on public.interfaces (approved_by) where approved_by is not null;

-- ── A6 · RLS ve yetkiler (yalnızca SELECT; yazma policy'si yok) ──
alter table public.changes enable row level security;
alter table public.claims enable row level security;
alter table public.interfaces enable row level security;

create policy changes_select on public.changes for select to authenticated
  using (public.has_project_access(project_id)
         and (select public.get_my_role()) in ('admin','proje_yoneticisi','muhasebe'));
create policy claims_select on public.claims for select to authenticated
  using (public.has_project_access(project_id)
         and (select public.get_my_role()) in ('admin','proje_yoneticisi','muhasebe'));
create policy interfaces_select on public.interfaces for select to authenticated
  using (public.has_project_access(project_id)
         and (select public.get_my_role()) in ('admin','proje_yoneticisi','santiye_sefi'));

-- pg_default_acl yeni tablolarda anon/authenticated'a tüm yetkileri veriyor; açıkça geri alınır.
revoke all on public.changes, public.claims, public.interfaces from anon, authenticated;
grant select on public.changes, public.claims, public.interfaces to authenticated;

commit;

-- ############################################################################
-- BÖLÜM B — GERİ AL (14.10.2026; canlıda ROLLBACK ile test edildi: uygula → geri al → parmak izi uygulama öncesiyle aynı)
-- ############################################################################
-- Kapsam: yalnızca F5'in oluşturdukları.
--   * 3 tablo. DROP TABLE tablonun trigger'larını, indekslerini, RLS kurallarını, kısıtlarını, yorumlarını ve satır
--     tipini birlikte düşürür.
--   * Fonksiyon: F5 fonksiyon OLUŞTURMAZ. Kullandığı fn_assign_register_no, fn_log_register_status,
--     update_updated_at_column ortak fonksiyonlardır; düşürülmez.
--   * Mevcut iki tabloda yalnızca bu üç tipe ait satırlar silinir: sayaç (CHG/CLM/ITF), durum geçmişi
--     (change/claim/interface).
--   * Başka hiçbir nesneye dokunulmaz (FK hedefi tablolarda F5 bir şey oluşturmaz; kısıtlar F5 tablolarında durur).
-- Veri koruması: tablolarda kayıt varsa, geri alma yalnızca açık onayla çalışır
--   (aynı işlemde önce: select set_config('fons.f5_geri_al_veri_sil', 'evet', true);). Kayıtlar kalıcı olarak silinir;
--   önce CSV ile dışa aktarılmalı.
-- Canlıya apply_migration ile uygulandıysa geri alma da ayrı bir migration olarak (apply_migration) uygulanır.
-- Yorum bloğu içinde: yalnızca gerekirse, ayrı çalıştırılır.
/*
begin;
set local lock_timeout = '3s';
do $$
declare v_rows bigint;
begin
  select (select count(*) from public.changes) + (select count(*) from public.claims)
       + (select count(*) from public.interfaces) into v_rows;
  if v_rows > 0 and coalesce(current_setting('fons.f5_geri_al_veri_sil', true), '') <> 'evet' then
    raise exception 'F5 geri alma durdu: change/claim/interface tablolarında % kayıt var. Önce CSV ile dışa aktarın, sonra aynı işlemde fons.f5_geri_al_veri_sil = evet ayarlayın', v_rows;
  end if;
end $$;
drop table public.claims;        -- changes'e FK verdiği için önce
drop table public.changes;
drop table public.interfaces;
delete from public.project_register_counters where register_code in ('CHG','CLM','ITF');
delete from public.register_status_history where register_code in ('change','claim','interface');
commit;
*/
