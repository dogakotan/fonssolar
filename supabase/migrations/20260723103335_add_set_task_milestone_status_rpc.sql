-- İş Planı'nda "+ İlerleme Gir" yalnızca target_qty (ölçülebilir hedef)
-- tanımlı iş kalemlerinde çıkıyordu; ölçülemeyen kilometre taşı işler
-- (ör. Trafo Enerjilendirme, SCADA İşlemleri) için hiçbir aksiyon yoktu.
-- Bu RPC yalnızca target_qty'si olmayan kalemlerde doğrudan durum
-- güncellemesi sağlar — target_qty'li kalemlerde durum zaten
-- sync_task_progress_from_daily trigger'ıyla otomatik hesaplandığından
-- oralarda çalışmayı reddeder (çakışmasın diye).
CREATE OR REPLACE FUNCTION public.set_task_milestone_status(p_task_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_task project_tasks%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Oturum açmanız gerekiyor.';
  END IF;

  v_role := get_my_role();
  IF v_role NOT IN ('santiye_sefi', 'proje_yoneticisi') THEN
    RAISE EXCEPTION 'Durum güncellemesi yalnızca şantiye şefi ve proje yöneticisi tarafından yapılabilir.';
  END IF;

  IF p_status NOT IN ('beklemede', 'devam_ediyor', 'tamamlandi', 'askida', 'iptal') THEN
    RAISE EXCEPTION 'Geçersiz durum değeri.';
  END IF;

  SELECT * INTO v_task FROM project_tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'İş kalemi bulunamadı.';
  END IF;

  IF NOT public.has_project_access(v_task.project_id) THEN
    RAISE EXCEPTION 'Bu projeye erişim yetkiniz yok.';
  END IF;

  IF COALESCE(v_task.target_qty, 0) > 0 THEN
    RAISE EXCEPTION 'Bu iş kalemi ölçülebilir bir hedefe sahip, durumu ilerleme girişiyle otomatik güncellenir.';
  END IF;

  UPDATE project_tasks
  SET status = p_status::task_status,
      progress_pct = CASE
        WHEN p_status = 'tamamlandi' THEN 100
        WHEN p_status IN ('beklemede', 'iptal') THEN 0
        ELSE progress_pct
      END,
      actual_start = CASE
        WHEN p_status IN ('devam_ediyor', 'tamamlandi') AND actual_start IS NULL THEN CURRENT_DATE
        ELSE actual_start
      END,
      actual_end = CASE
        WHEN p_status = 'tamamlandi' AND actual_end IS NULL THEN CURRENT_DATE
        ELSE actual_end
      END,
      updated_at = now()
  WHERE id = p_task_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_task_milestone_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_task_milestone_status(uuid, text) TO authenticated;
