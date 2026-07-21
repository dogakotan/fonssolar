CREATE INDEX idx_picr_procurement_item_id ON public.procurement_item_change_requests (procurement_item_id);
CREATE INDEX idx_picr_project_id ON public.procurement_item_change_requests (project_id);
CREATE INDEX idx_picr_requested_by ON public.procurement_item_change_requests (requested_by);
CREATE INDEX idx_picr_reviewed_by ON public.procurement_item_change_requests (reviewed_by);
CREATE INDEX idx_picr_pending ON public.procurement_item_change_requests (project_id) WHERE status = 'bekliyor';

