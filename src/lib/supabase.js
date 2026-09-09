import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

// PostgREST GET yanıtları hiçbir Cache-Control/ETag header'ı taşımıyor — bu da
// tarayıcının kendi buluşsal (heuristic) HTTP önbellekleme kararına bırakıyor.
// Aynı URL'e (ör. bildirim listesi — filtresiz, her zaman birebir aynı sorgu)
// tekrar giden bir GET, arada gerçek bir PATCH/POST ile veri değişmiş olsa bile
// tarayıcı tarafından önbellekten (sunucuya hiç gitmeden) cevaplanabiliyor —
// "okundu işaretledim ama okunmamış görünmeye devam ediyor" gibi bulgular bu
// yüzden oluşuyor (04.09.2026'da procurement_monthly_plan'da da aynı kök neden
// bulunmuştu). Tüm Supabase REST/Storage/Auth istekleri için `cache: 'no-store'`
// zorunlu kılınarak tarayıcı önbelleği tamamen devre dışı bırakılıyor.
const noStoreFetch = (url, options = {}) => fetch(url, { ...options, cache: 'no-store' })

export const supabase = createClient(
  supabaseUrl || 'https://missing-supabase-url.supabase.co',
  supabaseAnonKey || 'missing-supabase-anon-key',
  { global: { fetch: noStoreFetch } },
)

export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password })

export const signOut = () =>
  supabase.auth.signOut()

export const getSession = () =>
  supabase.auth.getSession()
