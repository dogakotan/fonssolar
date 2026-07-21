CREATE OR REPLACE FUNCTION public.get_purchase_requests_list(
  p_project_id text DEFAULT NULL,
  p_filter_date date DEFAULT NULL,
  p_only_pending boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_scope record;
BEGIN
  SELECT * INTO v_scope FROM get_project_scope(p_project_id);
  IF NOT v_scope.authorized THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  SELECT jsonb_build_object(
    'authorized', true,
    'requests', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(pr) || jsonb_build_object(
          'items', COALESCE((
            SELECT jsonb_agg(to_jsonb(pri) ORDER BY pri.id)
            FROM purchase_request_items pri WHERE pri.request_id = pr.id
          ), '[]'::jsonb),
          'requester_name', prf.full_name,
          'project_name', proj.name
        )
        ORDER BY pr.created_at DESC
      )
      FROM purchase_requests pr
      LEFT JOIN profiles prf ON prf.id = pr.requested_by
      LEFT JOIN projects proj ON proj.id = pr.project_id
      WHERE
        CASE
          WHEN p_project_id IS NOT NULL THEN
            pr.project_id = p_project_id
            AND pr.created_at <= (COALESCE(p_filter_date, CURRENT_DATE) + 1)::timestamptz - interval '1 second'
          ELSE
            (v_scope.scope_all OR pr.project_id = ANY(v_scope.project_ids))
        END
        AND (NOT p_only_pending OR pr.status IN ('bekliyor', 'beklemede', 'talep_olusturuldu', 'talep_oluşturuldu'))
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_purchase_requests_list(text, date, boolean) TO authenticated;

