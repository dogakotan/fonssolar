-- Muhasebe'nin Satın Alma sayfası, faturası oluşturulup yönetici onayına
-- gönderilen (fatura_onay_bekliyor) talepleri tamamen listeden düşürüyordu —
-- muhasebe kendi oluşturduğu faturanın hangi talebe ait olduğunu Satın Alma
-- ekranından takip edemiyordu. Bu durumu da kapsama eklenip frontend'de
-- "Onayda" etiketiyle gösterilecek (muhasebe zaten bu faturaları Faturalar
-- sekmesinden görebiliyor, yeni bir veri sızıntısı değil).

CREATE OR REPLACE FUNCTION public.get_satin_alma_overview_all()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_result jsonb; v_requests jsonb;
begin
  v_result := public.get_satin_alma_overview_all_internal();
  if public.get_my_role() = 'muhasebe' then
    select coalesce(jsonb_agg(value order by value->>'created_at' desc),'[]'::jsonb) into v_requests
    from jsonb_array_elements(coalesce(v_result->'requests','[]'::jsonb))
    where value->>'status' in ('satin_alindi','fatura_bekliyor','fatura_onay_bekliyor');
    v_result := jsonb_set(v_result,'{requests}',v_requests,true);
    v_result := jsonb_set(v_result,'{procurement_items}','[]'::jsonb,true);
  end if;
  return v_result;
end;$function$;
