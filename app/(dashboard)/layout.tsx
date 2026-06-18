// Protected dashboard layout
// Supabase auth entegrasyonu sonrası burada session kontrolü yapılacak:
//
// import { redirect } from 'next/navigation'
// import { createServerClient } from '@/lib/supabase-server'
//
// export default async function DashboardLayout({ children }) {
//   const supabase = createServerClient()
//   const { data: { session } } = await supabase.auth.getSession()
//   if (!session) redirect('/login')
//   return <>{children}</>
// }

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
