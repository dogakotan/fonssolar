import { useState, useRef, useEffect } from 'react'
import { exportToExcel, exportToPdf } from '../../utils/exportUtils'

const PERIYOTLAR = [
  { value: 'gunluk',   label: 'Günlük' },
  { value: 'haftalık', label: 'Haftalık' },
  { value: 'aylik',    label: 'Aylık' },
]

export default function ExportButton({ getData, title, disabled }) {
  const [acik, setAcik]         = useState(false)
  const [acikYukarı, setAcikYukarı] = useState(false)
  const [periyot, setPeriyot]   = useState('aylik')
  const [yukleniyor, setYukleniyor] = useState(false)
  const wrapperRef = useRef(null)

  useEffect(() => {
    function disariTikla(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setAcik(false)
      }
    }
    if (acik) document.addEventListener('mousedown', disariTikla)
    return () => document.removeEventListener('mousedown', disariTikla)
  }, [acik])

  function toggle() {
    if (disabled) return
    if (!acik && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect()
      setAcikYukarı(window.innerHeight - rect.bottom < 220)
    }
    setAcik(prev => !prev)
  }

  function indir(tip) {
    if (disabled || yukleniyor) return
    setYukleniyor(true)
    try {
      const { columns, rows } = getData(periyot)
      if (tip === 'excel') {
        exportToExcel(title, periyot, columns, rows)
      } else {
        exportToPdf(title, periyot, columns, rows)
      }
    } catch (e) {
      // hata sessiz geç — kullanıcı deneyimini bozmaz
    } finally {
      setYukleniyor(false)
      setAcik(false)
    }
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={toggle}
        disabled={disabled}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: '7px 14px',
          background: '#fff',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          fontSize: '13px',
          fontWeight: 500,
          color: disabled ? '#9ca3af' : 'var(--color-text)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          transition: 'background 0.15s, border-color 0.15s',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = '#f8fafc' }}
        onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Dışa Aktar
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 1 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {acik && (
        <div style={{
          position: 'fixed',
          ...((() => {
            if (!wrapperRef.current) return { top: 0, right: 0 }
            const r = wrapperRef.current.getBoundingClientRect()
            return acikYukarı
              ? { bottom: window.innerHeight - r.top + 6, right: window.innerWidth - r.right }
              : { top: r.bottom + 6, right: window.innerWidth - r.right }
          })()),
          zIndex: 9999,
          background: '#fff',
          border: '1px solid var(--color-border)',
          borderRadius: '10px',
          boxShadow: '0 4px 24px rgba(0,0,0,.10)',
          padding: '1rem',
          minWidth: '210px',
        }}>
          <p style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--color-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            margin: '0 0 0.625rem',
          }}>
            Periyot
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginBottom: '0.875rem' }}>
            {PERIYOTLAR.map(p => (
              <label
                key={p.value}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: 'var(--color-text)',
                  fontWeight: periyot === p.value ? 600 : 400,
                }}
              >
                <input
                  type="radio"
                  name="export-periyot"
                  value={p.value}
                  checked={periyot === p.value}
                  onChange={() => setPeriyot(p.value)}
                  style={{ accentColor: 'var(--color-primary)', cursor: 'pointer' }}
                />
                {p.label}
              </label>
            ))}
          </div>

          <div style={{
            borderTop: '1px solid var(--color-border)',
            paddingTop: '0.75rem',
            display: 'flex',
            gap: '0.5rem',
          }}>
            <button
              onClick={() => indir('excel')}
              disabled={yukleniyor}
              style={{
                flex: 1,
                padding: '7px 0',
                background: '#166534',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: yukleniyor ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.3rem',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { if (!yukleniyor) e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="8" y1="8" x2="16" y2="8" />
                <line x1="8" y1="12" x2="16" y2="12" />
                <line x1="8" y1="16" x2="12" y2="16" />
              </svg>
              Excel
            </button>
            <button
              onClick={() => indir('pdf')}
              disabled={yukleniyor}
              style={{
                flex: 1,
                padding: '7px 0',
                background: '#991b1b',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: yukleniyor ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.3rem',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { if (!yukleniyor) e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              PDF
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
