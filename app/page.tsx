import { redirect } from 'next/navigation'

// Root page — directs to login. After Supabase auth is connected,
// authenticated users will be redirected to their role-based dashboard here.
export default function HomePage() {
  redirect('/login')
}
