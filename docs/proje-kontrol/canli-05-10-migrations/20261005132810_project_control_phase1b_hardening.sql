-- Phase 1B hardening: yalnızca yetki (GRANT/REVOKE) değişikliği. Şema, veri, RLS policy ve fonksiyon gövdeleri değişmez.

-- RLS policy'lerinin kullandığı yardımcılar: authenticated + service_role kalır
revoke all on function public.can_write_project_control(text)  from public, anon;
revoke all on function public.can_manage_project_control(text) from public, anon;
grant execute on function public.can_write_project_control(text)  to authenticated, service_role;
grant execute on function public.can_manage_project_control(text) to authenticated, service_role;

-- Trigger fonksiyonları: doğrudan RPC ile çağrılamaz (trigger çalışırken EXECUTE kontrolü yapılmaz)
revoke all on function public.fn_assign_register_no() from public, anon, authenticated;
revoke all on function public.fn_log_register_status() from public, anon, authenticated;

-- Yeni register tabloları: RLS'i atlatabilen/gereksiz yetkiler kaldırılır
revoke truncate, trigger, references on
  public.documents, public.drawings, public.decisions, public.rfis, public.actions,
  public.technical_submittals, public.material_approvals, public.register_status_history
  from authenticated;

-- Sayaç tablosu: yalnızca SECURITY DEFINER next_register_no() erişir
revoke all on public.project_register_counters from authenticated;

comment on table public.project_register_counters is
  'Numaralandırma sayaçları. RLS açık ve bilerek policy YOK; authenticated erişimi yok. Yalnızca SECURITY DEFINER next_register_no() yazar.';
