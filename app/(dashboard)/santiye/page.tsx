import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Şantiye Şefi Paneli | Fons Solar',
}

export default function SantiyePage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-[#003B8E] rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
            stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 20h20" />
            <path d="M5 20V8l7-6 7 6v12" />
            <path d="M9 20v-6h6v6" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-800">Şantiye Şefi Paneli</h1>
        <p className="text-slate-500 mt-2 text-sm">Saha takip modülü yakında aktif olacak.</p>
      </div>
    </div>
  )
}
