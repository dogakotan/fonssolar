CREATE OR REPLACE FUNCTION public.log_ticket_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF OLD.status <> NEW.status THEN
    INSERT INTO public.ticket_history (ticket_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'status', OLD.status, NEW.status);
  END IF;
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO public.ticket_history (ticket_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'assigned_to', OLD.assigned_to::text, NEW.assigned_to::text);
  END IF;
  IF OLD.severity <> NEW.severity THEN
    INSERT INTO public.ticket_history (ticket_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'severity', OLD.severity, NEW.severity);
  END IF;
  IF NEW.status = 'çözüldü' AND OLD.status <> 'çözüldü' THEN
    NEW.resolved_at = now();
  END IF;
  RETURN NEW;
END;
$function$;

