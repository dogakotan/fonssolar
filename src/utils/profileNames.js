import { supabase } from '../lib/supabase'

// created_by/updated_by gibi başka bir kullanıcıya işaret eden alanlardan isim
// çözümlemek için — profiles_select RLS'i (admin/proje_yoneticisi/kendi satırı)
// diğer rollerin doğrudan .from('profiles') ile başka birinin adını okumasını
// engelliyor, bu yüzden yalnızca id+full_name döndüren SECURITY DEFINER
// get_profile_names RPC'si üzerinden çözülür (tickets'ta "Oluşturan"/"Son işlem"
// alanlarının santiye_sefi gibi rollerde sessizce boş gelmesine yol açan bug,
// 2026-07-31).
export async function fetchProfileNames(ids) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))]
  if (uniqueIds.length === 0) return new Map()
  const { data } = await supabase.rpc('get_profile_names', { p_ids: uniqueIds })
  return new Map((data || []).map(p => [p.id, p]))
}
