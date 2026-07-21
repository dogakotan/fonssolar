
DROP POLICY IF EXISTS storage_insert_ticket ON storage.objects;
DROP POLICY IF EXISTS storage_delete_ticket ON storage.objects;

CREATE POLICY storage_insert_ticket ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'ticket-ekleri'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM tickets t
    WHERE t.id = ((storage.foldername(name))[1])::uuid
      AND has_project_access(t.project_id)
  )
);

CREATE POLICY storage_delete_ticket ON storage.objects
FOR DELETE USING (
  bucket_id = 'ticket-ekleri'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM tickets t
    WHERE t.id = ((storage.foldername(name))[1])::uuid
      AND has_project_access(t.project_id)
  )
);

