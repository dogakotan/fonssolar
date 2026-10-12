import { Modal } from '../components/is-plani/GorevSiniflandirmaModals'
import { modalStyles as S } from '../components/is-plani/modalStyles'

// Sihirbaz görev kaydı (Ç-B, Karar 59): save_project_tasks önizlemesi ve onayı. Sil-yeniden-yaz yok; çıkarılan görev
// Activity ID / ilerleme / bağlı kayıt varsa iptal edilir, yoksa silinir.

const ACTION = { insert: 'Eklenecek', update: 'Güncellenecek', unchanged: 'Değişmeyecek', error: 'Hatalı' }

export function GorevKayitOnizleme({ report, errorItems, busy, error, onConfirm, onClose }) {
  const s = report?.summary
  const items = (report?.items || errorItems || []).filter(x => x.action !== 'unchanged')
  const removed = report?.removed || []
  const canConfirm = s && s.error_count === 0
  return (
    <Modal title="Görev listesi — kayıt önizlemesi" subtitle="Hiçbir şey yazılmadı; onaylayınca kaydedilir." onClose={onClose} width={900}
      footer={<>
        <button type="button" style={S.btn} onClick={onClose} disabled={busy}>Vazgeç</button>
        <button type="button" style={{ ...S.btnP, opacity: canConfirm && !busy ? 1 : 0.55 }} disabled={!canConfirm || busy} onClick={onConfirm} data-testid="gorev-kayit-onayla">
          {busy ? 'Kaydediliyor…' : 'Onayla ve kaydet'}
        </button>
      </>}>
      {s && (
        <p style={S.info} data-testid="gorev-kayit-ozet">
          {s.insert} eklenecek · {s.update} güncellenecek · {s.unchanged} değişmeyecek · {s.cancel} iptal edilecek · {s.delete} silinecek · {s.error_count} hatalı
        </p>
      )}
      {error && <p style={S.err}>{error}</p>}
      {removed.length > 0 && (
        <>
          <strong style={{ fontSize: 13 }}>Listeden çıkarılan görevler</strong>
          <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={S.th}>Görev</th><th style={S.th}>Sonuç</th><th style={S.th}>Neden</th></tr></thead>
              <tbody>
                {removed.map(r => (
                  <tr key={r.task_id}>
                    <td style={S.td}><b>{r.task_code}</b> {r.task_name}{r.activity_id ? ` · ${r.activity_id}` : ''}</td>
                    <td style={S.td}>{{ cancel: 'İptal edilecek', delete: 'Silinecek', keep_cancelled: 'Zaten iptal' }[r.action] || r.action}</td>
                    <td style={S.td}>{r.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {items.length > 0 && (
        <>
          <strong style={{ fontSize: 13 }}>Değişen satırlar</strong>
          <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={S.th}>Satır</th><th style={S.th}>Kod</th><th style={S.th}>Sonuç</th><th style={S.th}>Ayrıntı</th></tr></thead>
              <tbody>
                {items.map(it => (
                  <tr key={`${it.row}-${it.task_code}`} style={{ background: it.errors?.length ? '#fef2f2' : undefined }}>
                    <td style={S.td}>{it.row}</td>
                    <td style={S.td}>{it.task_code || '—'}</td>
                    <td style={S.td}>{ACTION[it.action] || it.action}</td>
                    <td style={S.td}>
                      {[...(it.errors || []), ...(it.warnings || [])].map(x => x.message).join(' · ')
                        || (it.changes?.length ? `Değişen: ${it.changes.join(', ')}` : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  )
}
