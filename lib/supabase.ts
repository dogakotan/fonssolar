import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Client-side Supabase client (singleton)
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

// Auth helpers
export async function signIn(username: string, password: string) {
  // Kullanıcı adını email olarak kullanıyorsak:
  const email = username.includes('@') ? username : `${username}@fons-solar.com`
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signOut() {
  return supabase.auth.signOut()
}

export async function getSession() {
  return supabase.auth.getSession()
}
