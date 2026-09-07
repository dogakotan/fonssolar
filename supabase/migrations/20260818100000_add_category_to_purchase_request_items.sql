-- YeniTalepModal.jsx'te "Bu ayın planından seç" bölümü kaldırıldı, yerine
-- malzeme seçildiğinde altında bir Kategori seçimi eklendi (procurement_items
-- ile aynı serbest metin taksonomi: Mobilizasyon/Hizmet/İş makineleri/
-- Güvenlik/Elektrik/Mekanik/Hırdavat/Diğer, bkz. MALZEME_KATEGORI_OPTS).
-- purchase_request_items'ta bu bilgiyi tutacak bir kolon yoktu.

alter table public.purchase_request_items
  add column if not exists category text;

-- create_purchase_request_with_items: imza değişmedi (p_project_id, p_title,
-- p_request_note, p_requested_by, p_items, p_category) — yalnızca p_items
-- içindeki opsiyonel 'material_category' alanı yeni category kolonuna yazılıyor.
create or replace function public.create_purchase_request_with_items(
  p_project_id text,
  p_title text,
  p_request_note text,
  p_requested_by uuid,
  p_items jsonb,
  p_category text default null::text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  if p_requested_by is distinct from auth.uid() then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;

  if p_project_id is null or btrim(p_project_id) = '' then
    raise exception 'Proje seçimi zorunludur.';
  end if;

  if not exists (
    select 1 from public.projects where id = p_project_id
  ) then
    raise exception 'Seçilen proje bulunamadı.';
  end if;

  if not public.has_project_access(p_project_id) then
    raise exception 'Bu projeye erişim yetkiniz yok.';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) <> 1 then
    raise exception 'Her satın alma talebi tam olarak bir kalem içermelidir.';
  end if;

  if coalesce(btrim(p_items->0->>'name'), '') = '' then
    raise exception 'Talep kalemi adı zorunludur.';
  end if;

  if coalesce(nullif(p_items->0->>'quantity', '')::numeric, 0) <= 0 then
    raise exception 'Talep miktarı sıfırdan büyük olmalıdır.';
  end if;

  insert into public.purchase_requests (
    project_id, title, request_note, status, requested_by, category, request_no
  )
  values (
    p_project_id, p_title, p_request_note,
    'talep_olusturuldu', p_requested_by, coalesce(p_category, 'diger'),
    public.fn_next_purchase_request_no(extract(year from now())::int)
  )
  returning id into v_id;

  insert into public.purchase_request_items (
    request_id, name, quantity, unit, unit_price, bom_item_id, category
  )
  values (
    v_id,
    btrim(p_items->0->>'name'),
    coalesce(nullif(p_items->0->>'quantity', '')::numeric, 1),
    coalesce(p_items->0->>'unit', 'Adet'),
    nullif(p_items->0->>'unit_price', '')::numeric,
    nullif(p_items->0->>'bom_item_id', '')::uuid,
    nullif(btrim(p_items->0->>'material_category'), '')
  );

  return v_id;
end;
$function$;
