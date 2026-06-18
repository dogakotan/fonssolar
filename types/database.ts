// Supabase generate types ile otomatik üretilecek — şimdilik placeholder.
// npx supabase gen types typescript --project-id YOUR_PROJECT_ID > types/database.ts

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          full_name: string
          role: 'admin' | 'santiye_sefi' | 'satin_alma'
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
