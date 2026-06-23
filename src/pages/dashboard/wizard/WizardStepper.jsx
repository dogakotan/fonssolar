const STEP_LABELS = [
  'Proje Bilgileri',
  'İş Kalemleri',
  'İlerleme',
  'Riskler',
  'Tedarik',
  'Bütçe',
  'Kritik Yol',
  'Tamamlandı',
]

export default function WizardStepper({ current }) {
  return (
    <div>
      <div style={{ padding: '0.875rem 1rem 0.75rem', borderBottom: '1px solid var(--color-border-md)' }}>
        <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Adımlar
        </p>
      </div>
      {STEP_LABELS.map((label, i) => {
        const no     = i + 1
        const done   = no < current
        const active = no === current
        return (
          <div
            key={no}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.65rem 1rem',
              background: active ? '#eff6ff' : 'transparent',
              borderLeft: `3px solid ${active ? 'var(--color-primary)' : 'transparent'}`,
            }}
          >
            <div style={{
              width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700,
              background: done ? '#22c55e' : active ? 'var(--color-primary)' : '#e2e8f0',
              color: (done || active) ? '#fff' : '#94a3b8',
            }}>
              {done
                ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                : no}
            </div>
            <span style={{
              fontSize: 12.5,
              fontWeight: active ? 700 : 500,
              lineHeight: 1.3,
              color: active ? 'var(--color-primary)' : done ? '#22c55e' : '#94a3b8',
            }}>
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
