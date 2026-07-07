import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import AppRouter from './router'
import { isSupabaseConfigured } from './lib/supabase'
import './App.css'

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#F8FAFC', color: '#111827' }}>
        <div style={{ maxWidth: 520, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 24, boxShadow: '0 12px 30px rgba(15, 23, 42, 0.08)' }}>
          <h1 style={{ margin: '0 0 10px', fontSize: 20 }}>Supabase ayarlari eksik</h1>
          <p style={{ margin: 0, color: '#4B5563', lineHeight: 1.6 }}>
            Vercel Environment Variables icinde VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY tanimli olmali.
          </p>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </BrowserRouter>
  )
}
