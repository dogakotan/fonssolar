import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login          from '../pages/Login'
import HesapOlustur   from '../pages/HesapOlustur'
import YetkisizPage   from '../pages/Yetkisiz'
import ProtectedRoute from '../components/ProtectedRoute'
import { ScopeProvider } from '../context/ScopeContext'

const Dashboard = lazy(() => import('../pages/dashboard'))

function DashboardFallback() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f8fafc', color: '#64748b', fontSize: 14 }}>
      Dashboard yükleniyor…
    </div>
  )
}

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/"           element={<Navigate to="/login" replace />} />
      <Route path="/login"      element={<Login />} />
      <Route path="/hesap-olustur" element={<HesapOlustur />} />
      <Route path="/yetkisiz"   element={<YetkisizPage />} />
      <Route path="/dashboard"  element={<ProtectedRoute><ScopeProvider><Suspense fallback={<DashboardFallback />}><Dashboard /></Suspense></ScopeProvider></ProtectedRoute>} />
      <Route path="*"           element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
