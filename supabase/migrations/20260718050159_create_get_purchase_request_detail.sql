CREATE OR REPLACE FUNCTION public.get_purchase_request_detail(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_project_id text;
  v_scope record;
BEGIN
  SELECT project_id INTO v_project_id FROM purchase_requests WHERE id = p_id;
  IF v_project_id IS NULL THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  SELECT * INTO v_scope FROM get_project_scope(v_project_id);
  IF NOT v_scope.authorized THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  SELECT jsonb_build_object(
    'authorized', true,
    'request', to_jsonb(pr) || jsonb_build_object(
      'items', COALESCE((
        SELECT jsonb_agg(to_jsonb(pri) ORDER BY pri.id)
        FROM purchase_request_items pri WHERE pri.request_id = pr.id
      ), '[]'::jsonb),
      'requester_name', prf.full_name,
      'suppliers', jsonb_build_object('name', sup.name)
    )
  ) INTO result
  FROM purchase_requests pr
  LEFT JOIN profiles prf ON prf.id = pr.requested_by
  LEFT JOIN suppliers sup ON sup.id = pr.supplier_id
  WHERE pr.id = p_id;

  RETURN result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_purchase_request_detail(uuid) TO authenticated;

