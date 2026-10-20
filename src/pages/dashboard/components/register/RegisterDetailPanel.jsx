import { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { fetchProfileNames } from '../../../../utils/profileNames'
import { StatusDot } from '../../../../components/ui/Badge'
import { allColumns, parseRegisterNo } from '../../../../lib/register/registerConfig'
import RegisterCell from './RegisterCell'

// Geçmiş zamanı UTC saklanır; kullanıcının yerel saatiyle gösterilir (ör. 06:08 UTC → 09:08 İstanbul).
function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString('tr-TR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Yan panel: kaydın bütün alanları + durum geçmişi (get_register_status_history). Yalnızca okuma.
export default function RegisterDetailPanel({ tab, registerKey, row, prefix, names, onClose }) {
  const [history, setHistory] = useState({ loading: true, data: null, error: '' })
  const [historyNames, setHistoryNames] = useState(new Map())

  useEffect(() => {
    let active = true
    setHistory({ loading: true, data: null, error: '' })
    supabase.rpc('get_register_status_history', { p_register: registerKey, p_record_id: row.id })
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          console.error('get_register_status_history error:', error)
          setHistory({ loading: false, data: null, error: 'Durum geçmişi yüklenemedi.' })
          return
        }
        setHistory({ loading: false, data, error: '' })
        fetchProfileNames((data?.history || []).map(h => h.changed_by)).then(map => { if (active) setHistoryNames(map) })
      })
    return () => { active = false }
  }, [registerKey, row.id])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const parsed = parseRegisterNo(row.no)
  const fields = allColumns(tab).filter(c => c.key !== 'title')
  const statusColumn = fields.find(c => c.key === 'status')

  return (
    <div className="register-panel-backdrop" onClick={onClose}>
      <aside
        className="register-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`${tab.label} ${row.no || ''}`}
        onClick={e => e.stopPropagation()}
      >
        <header className="register-panel-head">
          <div>
            <div className="register-no">{row.no || '—'}</div>
            <h3>{row.title || '—'}</h3>
            {parsed.project && (
              <div className="register-panel-sub">
                Proje kodu {parsed.project}{prefix && prefix !== parsed.project ? ` (proje ayarı: ${prefix})` : ''} · sıra {parsed.seq}
              </div>
            )}
          </div>
          <button type="button" className="register-btn" onClick={onClose} aria-label="Paneli kapat">Kapat</button>
        </header>

        <dl className="register-fields">
          {fields.map(c => (
            <div key={c.key} className="register-field-row">
              <dt>{c.label}</dt>
              <dd><RegisterCell column={c} row={row} names={names} /></dd>
            </div>
          ))}
        </dl>

        {tab.detail.filter(c => row[c.key]).map(c => (
          <section key={c.key} className="register-long">
            <h4>{c.label}</h4>
            <p>{row[c.key]}</p>
          </section>
        ))}

        <section className="register-history">
          <h4>Durum geçmişi</h4>
          {!tab.historyTracked || history.data?.tracked === false ? (
            <p className="register-muted">Bu register için durum geçmişi tutulmuyor.</p>
          ) : history.loading ? (
            <p className="register-muted">Yükleniyor…</p>
          ) : history.error ? (
            <p className="register-error" role="alert">{history.error}</p>
          ) : history.data?.authorized === false ? (
            <p className="register-muted">Bu kaydın geçmişini görme yetkiniz yok.</p>
          ) : (history.data?.history || []).length === 0 ? (
            <p className="register-muted">Geçmiş kaydı yok.</p>
          ) : (
            <ol className="register-history-list">
              {history.data.history.map((h, i) => (
                <li key={i}>
                  <span className="register-muted">{formatDateTime(h.changed_at)}</span>
                  <span>
                    {h.old_status
                      ? <><StatusDot map={statusColumn.map} value={h.old_status} /> → </>
                      : 'Açıldı: '}
                    <StatusDot map={statusColumn.map} value={h.new_status} />
                  </span>
                  <span className="register-muted">{historyNames.get(h.changed_by)?.full_name || (h.changed_by ? '—' : 'Sistem / panel')}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </div>
  )
}
