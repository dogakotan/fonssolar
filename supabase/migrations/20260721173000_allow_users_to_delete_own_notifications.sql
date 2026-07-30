CREATE POLICY "notifications_delete_own"
ON public.notifications
FOR DELETE
TO authenticated
USING (recipient_id = (SELECT auth.uid()));
