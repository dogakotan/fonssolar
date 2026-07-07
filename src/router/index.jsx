import { Routes, Route, Navigate } from 'react-router-dom'
import Login          from '../pages/Login'
import Dashboard      from '../pages/dashboard'
import YetkisizPage   from '../pages/Yetkisiz'
import ProtectedRoute from '../components/ProtectedRoute'
import { ScopeProvider } from '../context/ScopeContext'

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/"           element={<Navigate to="/login" replace />} />
      <Route path="/login"      element={<Login />} />
      <Route path="/yetkisiz"   element={<YetkisizPage />} />
      <Route path="/dashboard"  element={<ProtectedRoute><ScopeProvider><Dashboard /></ScopeProvider></ProtectedRoute>} />
      <Route path="*"           element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
