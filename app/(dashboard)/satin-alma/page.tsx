import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Satın Alma Paneli | Fons Solar',
}

export default function SatinAlmaPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-[#003B8E] rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
            stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" x2="21" y1="6" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-800">Satın Alma Paneli</h1>
        <p className="text-slate-500 mt-2 text-sm">Tedarik yönetimi modülü yakında aktif olacak.</p>
      </div>
    </div>
  )
}
