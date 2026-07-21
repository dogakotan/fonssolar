CREATE OR REPLACE FUNCTION public.fn_create_ticket_from_daily_report_issue()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ticket_id uuid;
  v_created_by uuid;
  v_assigned_to uuid;
  v_description text;
BEGIN
  -- Reporter of the daily report becomes the ticket creator
  SELECT created_by INTO v_created_by FROM daily_reports WHERE id = NEW.report_id;

  -- Best-effort match of the free-text assignee name to a profile
  IF NEW.assigned_to IS NOT NULL THEN
    SELECT id INTO v_assigned_to FROM profiles
     WHERE lower(full_name) = lower(NEW.assigned_to)
     LIMIT 1;
  END IF;

  -- daily_report_issues.description bazen frontend'in __ISSUE_META__{json} paketlemesini
  -- içerir (category/closed_at/notes için bu tabloda ayrı kolon yok) — ticket'a yalnızca
  -- temiz açıklama metni kopyalanmalı, ham JSON değil.
  v_description := NEW.description;
  IF v_description LIKE '__ISSUE_META__%' THEN
    BEGIN
      v_description := COALESCE(
        (substring(v_description FROM length('__ISSUE_META__') + 1))::jsonb ->> 'description',
        ''
      );
    EXCEPTION WHEN OTHERS THEN
      v_description := NEW.description;
    END;
  END IF;

  INSERT INTO tickets (project_id, created_by, assigned_to, title, description, category, severity, status)
  VALUES (
    NEW.project_id,
    v_created_by,
    v_assigned_to,
    NEW.topic,
    v_description,
    'genel',
    NEW.priority,   -- düşük/orta/yüksek/kritik now match on both sides
    CASE NEW.resolution_status
      WHEN 'devam ediyor' THEN 'işlemde'
      WHEN 'çözüldü' THEN 'kapatıldı'
      ELSE 'gönderildi'
    END
  )
  RETURNING id INTO v_ticket_id;

  NEW.ticket_id := v_ticket_id;
  RETURN NEW;
END;
$function$

