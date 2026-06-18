import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Yönetici Paneli | Fons Solar',
}

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-[#003B8E] rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
            stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-800">Yönetici Paneli</h1>
        <p className="text-slate-500 mt-2 text-sm">GES proje yönetimi yakında aktif olacak.</p>
      </div>
    </div>
  )
}
