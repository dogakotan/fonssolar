CREATE POLICY "purchase_requests_delete"
ON public.purchase_requests
FOR DELETE
TO public
USING (get_my_role() = 'admin'::text);

