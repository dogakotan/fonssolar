CREATE OR REPLACE FUNCTION public.fn_purchase_request_procurement_fields_only(
  p_id uuid, p_project_id text, p_requested_by uuid, p_approved_by uuid,
  p_approved_at timestamptz, p_title text, p_urgency text, p_category text,
  p_estimated_amount_excl_vat numeric, p_status text
) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT
    p_project_id IS NOT DISTINCT FROM pr.project_id
    AND p_requested_by IS NOT DISTINCT FROM pr.requested_by
    AND p_approved_by IS NOT DISTINCT FROM pr.approved_by
    AND p_approved_at IS NOT DISTINCT FROM pr.approved_at
    AND p_title IS NOT DISTINCT FROM pr.title
    AND p_urgency IS NOT DISTINCT FROM pr.urgency
    AND p_category IS NOT DISTINCT FROM pr.category
    AND p_estimated_amount_excl_vat IS NOT DISTINCT FROM pr.estimated_amount_excl_vat
    AND (
      (pr.status = 'onaylandi'   AND p_status IN ('onaylandi', 'satin_alindi', 'iptal'))
      OR (pr.status = 'satin_alindi' AND p_status = 'satin_alindi')
    )
  FROM purchase_requests pr WHERE pr.id = p_id;
$$;

