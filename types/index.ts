// Kullanıcı rolleri
export type UserRole = 'admin' | 'santiye_sefi' | 'satin_alma'

// Rol bazlı yönlendirme haritası
export const ROLE_ROUTES: Record<UserRole, string> = {
  admin: '/admin',
  santiye_sefi: '/santiye',
  satin_alma: '/satin-alma',
}

// Kullanıcı profili (Supabase profiles tablosundan)
export interface UserProfile {
  id: string
  username: string
  full_name: string
  role: UserRole
  created_at: string
}

// GES Projesi
export interface GESProject {
  id: string
  name: string
  location: string
  capacity_kwp: number
  status: 'planlama' | 'insaat' | 'isletmede' | 'beklemede'
  start_date: string | null
  completion_date: string | null
  created_at: string
}

// İş paketi / aktivite
export interface WorkPackage {
  id: string
  project_id: string
  title: string
  description: string | null
  status: 'bekliyor' | 'devam_ediyor' | 'tamamlandi' | 'iptal'
  assigned_to: string | null
  due_date: string | null
  created_at: string
}

// Satın alma kalemi
export interface PurchaseItem {
  id: string
  project_id: string
  item_name: string
  quantity: number
  unit: string
  unit_price: number | null
  status: 'talep' | 'onaylandi' | 'siparis' | 'teslim_alindi'
  requested_by: string
  created_at: string
}
