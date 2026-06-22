import { Routes, Route, Navigate } from 'react-router-dom'
import Login          from '../pages/Login'
import About          from '../pages/About'
import Register       from '../pages/Register'
import Dashboard      from '../pages/dashboard'
import YetkisizPage   from '../pages/Yetkisiz'
import ProtectedRoute from '../components/ProtectedRoute'

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/"           element={<Navigate to="/login" replace />} />
      <Route path="/login"      element={<Login />} />
      <Route path="/register"   element={<Register />} />
      <Route path="/about"      element={<About />} />
      <Route path="/yetkisiz"   element={<YetkisizPage />} />
      <Route path="/dashboard"  element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="*"           element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
