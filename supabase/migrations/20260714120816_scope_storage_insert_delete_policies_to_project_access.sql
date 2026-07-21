
DROP POLICY IF EXISTS storage_insert ON storage.objects;
DROP POLICY IF EXISTS storage_delete ON storage.objects;
DROP POLICY IF EXISTS storage_insert_ticket ON storage.objects;
DROP POLICY IF EXISTS storage_delete_ticket ON storage.objects;

CREATE POLICY storage_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'saha-fotolari'
    AND auth.uid() IS NOT NULL
    AND has_project_access((storage.foldername(name))[1])
  );

CREATE POLICY storage_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'saha-fotolari'
    AND auth.uid() IS NOT NULL
    AND has_project_access((storage.foldername(name))[1])
  );

CREATE POLICY storage_insert_ticket ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'ticket-ekleri'
    AND auth.uid() IS NOT NULL
    AND has_project_access((storage.foldername(name))[1])
  );

CREATE POLICY storage_delete_ticket ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'ticket-ekleri'
    AND auth.uid() IS NOT NULL
    AND has_project_access((storage.foldername(name))[1])
  );

