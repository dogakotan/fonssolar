
CREATE TABLE public.tickets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    text NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title         text NOT NULL,
  description   text,
  category      text NOT NULL DEFAULT 'genel'
                CHECK (category IN ('teknik','isg','kalite','lojistik','elektrik','mekanik','genel')),
  severity      text NOT NULL DEFAULT 'orta'
                CHECK (severity IN ('düşük','orta','yüksek','kritik')),
  status        text NOT NULL DEFAULT 'açık'
                CHECK (status IN ('açık','işlemde','çözüldü','kapatıldı')),
  resolved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ticket_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ticket_attachments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  file_name   text NOT NULL,
  file_url    text NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ticket_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  changed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  field       text NOT NULL,
  old_value   text,
  new_value   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ticket okuma" ON public.tickets
  FOR SELECT USING (public.get_my_role() IN ('admin','santiye_sefi','muhendis','koordinator','satin_alma_uzmani'));
CREATE POLICY "Ticket ekleme" ON public.tickets
  FOR INSERT WITH CHECK (public.get_my_role() IN ('admin','santiye_sefi','muhendis','koordinator','satin_alma_uzmani'));
CREATE POLICY "Ticket güncelleme" ON public.tickets
  FOR UPDATE USING (public.get_my_role() IN ('admin','santiye_sefi','muhendis','koordinator'));

CREATE POLICY "Yorum okuma" ON public.ticket_comments
  FOR SELECT USING (public.get_my_role() IN ('admin','santiye_sefi','muhendis','koordinator','satin_alma_uzmani'));
CREATE POLICY "Yorum ekleme" ON public.ticket_comments
  FOR INSERT WITH CHECK (public.get_my_role() IN ('admin','santiye_sefi','muhendis','koordinator','satin_alma_uzmani'));

CREATE POLICY "Attachment okuma" ON public.ticket_attachments
  FOR SELECT USING (public.get_my_role() IN ('admin','santiye_sefi','muhendis','koordinator','satin_alma_uzmani'));
CREATE POLICY "Attachment ekleme" ON public.ticket_attachments
  FOR INSERT WITH CHECK (public.get_my_role() IN ('admin','santiye_sefi','muhendis','koordinator','satin_alma_uzmani'));

CREATE POLICY "History okuma" ON public.ticket_history
  FOR SELECT USING (public.get_my_role() IN ('admin','santiye_sefi','muhendis','koordinator'));

CREATE TRIGGER tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Ticket güncellenince history'e otomatik kayıt
CREATE OR REPLACE FUNCTION log_ticket_changes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
$$;

CREATE TRIGGER ticket_history_trigger
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION log_ticket_changes();

-- Örnek seed verisi
INSERT INTO public.tickets (project_id, title, description, category, severity, status) VALUES
  ('kaptan-usak-ges', 'DC kablo polarite hatası — İnverter 7', 'Saha mühendisi DC bağlantıda ters polarite tespit etti. İnverter devreye alınamıyor.', 'elektrik', 'kritik', 'açık'),
  ('kaptan-usak-ges', 'Panel montaj açısı sapması — Sıra 12', 'Sıra 12 panel montaj açısı 30° yerine 28° olarak ölçüldü. Yeniden ayar gerekiyor.', 'mekanik', 'orta', 'işlemde'),
  ('kaptan-usak-ges', 'Baret kullanımı eksikliği — Kuzey saha', 'Kuzey sahada 3 işçi baret takmadan çalışıyor tespit edildi.', 'isg', 'yüksek', 'açık'),
  ('kaptan-usak-ges', 'Topraklama hattı ölçüm sapması', 'Ana topraklama hattı direnç değeri standart dışı çıktı, yeniden ölçüm yapılacak.', 'kalite', 'orta', 'çözüldü');

