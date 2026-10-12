import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { parseDetails, wbsAreaErrorMessage } from '../../../../utils/wbsAreaErrors'
import { MAX_SELECTION, modalStyles as S } from './modalStyles'

// Faz 1 Adım 5 — İş Planı'nda disiplin / alan / WBS, Activity ID ve iptal işlemleri (faz1-adim5-tasarim.md §2).
// Yazma yolları: tek görev düzenleme doğrudan UPDATE (trigger'lar kuralları uygular), toplu atama
// set_tasks_classification, kod atama assign_activity_ids, ID düzeltme admin_correct_task_activity_id (B4).
// Hepsinde önce önizleme, sonra onay.

export function Modal({ title, subtitle, onClose, children, footer, width }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} style={S.overlay}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ ...S.box, ...(width ? { width: `min(${width}px, 100%)` } : {}) }}>
        <div style={S.head}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, color: 'var(--color-text)' }}>{title}</h3>
            {subtitle && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-muted)' }}>{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" style={{ border: 'none', background: 'none', fontSize: 22, color: 'var(--color-muted)', cursor: 'pointer' }}>×</button>
        </div>
        <div style={S.body}>{children}</div>
        {footer && <div style={S.foot}>{footer}</div>}
      </div>
    </div>
  )
}

// WBS seçeneği: alan seçiliyse yalnızca etkin kümesi alanı içeren ya da bağı tanımsız WBS'ler seçilebilir.
function WbsSelect({ structure, value, onChange, areaId, disabled, allowEmpty = true, emptyLabel = '— seçin —' }) {
  const rows = structure.treeOrder(structure.wbs.filter(w => w.is_active || w.id === value))
  return (
    <select style={S.input} value={value || ''} disabled={disabled} onChange={e => onChange(e.target.value || null)}>
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {rows.map(({ item, depth }) => {
        const st = areaId ? structure.chainState(item.id, areaId) : null
        const blocked = st === 'not_linked'
        return (
          <option key={item.id} value={item.id} disabled={blocked && item.id !== value}>
            {'  '.repeat(depth)}{item.wbs_code} · {item.name}{blocked ? ' (alan bağlı değil)' : ''}
          </option>
        )
      })}
    </select>
  )
}

// Alan seçeneği: WBS seçiliyse ve etkin küme doluysa yalnızca kümedeki alanlar.
function AreaSelect({ structure, value, onChange, wbsId, disabled, emptyLabel = '— seçin —' }) {
  const eff = wbsId ? structure.effectiveAreas(wbsId) : { defined: false, areaIds: new Set(), sources: new Map() }
  const rows = structure.treeOrder(structure.areas.filter(a => a.is_active || a.id === value))
  return (
    <select style={S.input} value={value || ''} disabled={disabled} onChange={e => onChange(e.target.value || null)}>
      <option value="">{emptyLabel}</option>
      {rows.map(({ item, depth }) => {
        const blocked = eff.defined && !eff.areaIds.has(item.id)
        return (
          <option key={item.id} value={item.id} disabled={blocked && item.id !== value}>
            {'  '.repeat(depth)}{item.area_code} · {item.name}{blocked ? ' (WBS\'e bağlı değil)' : ''}
          </option>
        )
      })}
    </select>
  )
}

function DisciplineSelect({ structure, value, onChange, disabled, emptyLabel = '— seçin —' }) {
  return (
    <select style={S.input} value={value || ''} disabled={disabled} onChange={e => onChange(e.target.value || null)}>
      <option value="">{emptyLabel}</option>
      {structure.disciplines.map(d => <option key={d.discipline} value={d.discipline}>{d.label_tr} ({d.id_code})</option>)}
    </select>
  )
}

function LockNote({ children }) {
  return <span style={{ fontSize: 11, color: '#92400e', fontWeight: 600 }}>🔒 {children}</span>
}

// ── Tek görev düzenleme (admin / proje yöneticisi) ──
export function GorevDuzenleModal({ task, structure, isAdmin, onClose, onSaved }) {
  const locked = !!task.activity_id
  const [discipline, setDiscipline] = useState(task.discipline || null)
  const [areaId, setAreaId] = useState(task.area_id || null)
  const [wbsId, setWbsId] = useState(task.wbs_id || null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fixOpen, setFixOpen] = useState(false)

  const state = structure.chainState(wbsId, areaId)
  const changed = discipline !== (task.discipline || null) || areaId !== (task.area_id || null) || wbsId !== (task.wbs_id || null)

  async function save() {
    setSaving(true)
    setError('')
    const patch = locked ? { wbs_id: wbsId } : { discipline, area_id: areaId, wbs_id: wbsId }
    const { error: err } = await supabase.from('project_tasks').update(patch).eq('id', task.id)
    setSaving(false)
    if (err) { setError(wbsAreaErrorMessage(err)); return }
    onSaved()
  }

  if (fixOpen) {
    return <IdDuzeltModal task={task} structure={structure} onClose={() => setFixOpen(false)} onSaved={onSaved} />
  }

  return (
    <Modal title="Görevi Sınıflandır" subtitle={`${task.task_code} · ${task.task_name}${task.activity_id ? ` · ${task.activity_id}` : ''}`} onClose={onClose}
      footer={<>
        {locked && isAdmin && <button type="button" style={{ ...S.btn, marginRight: 'auto' }} onClick={() => setFixOpen(true)}>Activity ID'yi düzelt (admin)</button>}
        <button type="button" style={S.btn} onClick={onClose} disabled={saving}>Vazgeç</button>
        <button type="button" style={{ ...S.btnP, opacity: saving || !changed ? .6 : 1 }} onClick={save} disabled={saving || !changed}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
      </>}>
      <label style={S.label}>Disiplin
        <DisciplineSelect structure={structure} value={discipline} onChange={setDiscipline} disabled={locked} />
        {locked && <LockNote>Activity ID atanmış; disiplin yalnızca admin düzeltmesiyle değişir</LockNote>}
      </label>
      <label style={S.label}>WBS
        <WbsSelect structure={structure} value={wbsId} onChange={setWbsId} areaId={areaId} />
      </label>
      <label style={S.label}>Alan
        <AreaSelect structure={structure} value={areaId} onChange={setAreaId} wbsId={wbsId} disabled={locked} />
        {locked && <LockNote>Activity ID atanmış; alan yalnızca admin düzeltmesiyle değişir</LockNote>}
      </label>
      {state === 'undefined' && <p style={S.warn}>Bu WBS'te alan bağı tanımlanmamış; her alan kullanılabilir.</p>}
      {state === 'not_linked' && <p style={S.err}>Seçilen alan bu WBS'e (veya üst WBS'lerine) bağlı değil.{task.activity_id ? ' Activity ID\'li görevde kaydedilemez.' : ' "Kod ata" bu görevde engellenir.'}</p>}
      {error && <p style={S.err}>{error}</p>}
    </Modal>
  )
}

// ── Admin: Activity ID düzeltme (B4) ──
function IdDuzeltModal({ task, structure, onClose, onSaved }) {
  const [discipline, setDiscipline] = useState(task.discipline || null)
  const [areaId, setAreaId] = useState(task.area_id || null)
  const [newId, setNewId] = useState(task.activity_id || '')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const disc = structure.disciplines.find(d => d.discipline === discipline)
  const area = structure.areaById.get(areaId)
  const prefix = (task.activity_id || '').split('-')[0]
  const expected = disc && area && prefix ? `${prefix}-${disc.id_code}-${area.area_code}-` : null

  useEffect(() => {
    if (!expected) return
    if (!newId.startsWith(expected)) {
      const num = (task.activity_id || '').split('-').pop()
      setNewId(`${expected}${num || '0010'}`)
    }
  }, [expected]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!reason.trim()) { setError('Gerekçe zorunlu.'); return }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.rpc('admin_correct_task_activity_id', {
      p_task_id: task.id, p_new_activity_id: newId.trim() || null, p_reason: reason.trim(),
      p_discipline: discipline !== task.discipline ? discipline : null,
      p_area_id: areaId !== task.area_id ? areaId : null,
    })
    setSaving(false)
    if (err) { setError(wbsAreaErrorMessage(err)); return }
    onSaved()
  }

  return (
    <Modal title="Activity ID düzeltme (admin)" subtitle={`${task.task_code} · ${task.activity_id}`} onClose={onClose}
      footer={<>
        <button type="button" style={S.btn} onClick={onClose} disabled={saving}>Vazgeç</button>
        <button type="button" style={S.btnD} onClick={save} disabled={saving}>{saving ? 'Kaydediliyor…' : 'Düzelt'}</button>
      </>}>
      <p style={S.warn}>Bu işlem atanmış kimliği değiştirir ve gerekçesiyle denetim kaydına yazılır. Yeni ID görevin proje kodu, disiplini ve alanıyla uyumlu olmalı.</p>
      <label style={S.label}>Disiplin<DisciplineSelect structure={structure} value={discipline} onChange={setDiscipline} /></label>
      <label style={S.label}>Alan<AreaSelect structure={structure} value={areaId} onChange={setAreaId} wbsId={task.wbs_id} /></label>
      <label style={S.label}>Yeni Activity ID
        <input style={S.input} value={newId} onChange={e => setNewId(e.target.value.toUpperCase())} />
        {expected && <span style={S.info}>Beklenen biçim: {expected}NNNN</span>}
      </label>
      <label style={S.label}>Gerekçe *<textarea style={S.input} rows={3} value={reason} onChange={e => setReason(e.target.value)} /></label>
      {error && <p style={S.err}>{error}</p>}
    </Modal>
  )
}

function ResultTable({ items, columns }) {
  return (
    <div style={{ maxHeight: 340, overflow: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{columns.map(c => <th key={c.key} style={S.th}>{c.label}</th>)}</tr></thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.task_id || i} style={{ background: it.errors?.length ? '#fef2f2' : it.warnings?.length ? '#fffbeb' : undefined }}>
              {columns.map(c => <td key={c.key} style={S.td}>{c.render(it)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const msgList = list => (list || []).map(x => x.message).join(' · ') || '—'

// ── Toplu disiplin / alan / WBS atama ──
export function TopluAtaModal({ tasks, structure, onClose, onSaved }) {
  const [discipline, setDiscipline] = useState(null)
  const [areaId, setAreaId] = useState(null)
  const [wbsId, setWbsId] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ids = useMemo(() => tasks.map(t => t.id), [tasks])

  useEffect(() => { setPreview(null) }, [discipline, areaId, wbsId])

  async function call(dry) {
    setBusy(true)
    setError('')
    const { data, error: err } = await supabase.rpc('set_tasks_classification', {
      p_task_ids: ids, p_discipline: discipline, p_area_id: areaId, p_wbs_id: wbsId, p_dry_run: dry,
    })
    setBusy(false)
    if (err) {
      const detail = parseDetails(err)
      if (detail?.tasks) setPreview({ items: detail.tasks, summary: null })
      setError(wbsAreaErrorMessage(err))
      return
    }
    if (dry) setPreview(data)
    else onSaved(data)
  }

  const none = !discipline && !areaId && !wbsId
  const canApply = preview?.summary && preview.summary.error_count === 0 && preview.summary.update > 0

  return (
    <Modal title="Toplu Atama" subtitle={`${tasks.length} görev seçili`} onClose={onClose} width={860}
      footer={<>
        <button type="button" style={S.btn} onClick={onClose} disabled={busy}>Vazgeç</button>
        <button type="button" style={S.btn} onClick={() => call(true)} disabled={busy || none}>Önizle</button>
        <button type="button" style={{ ...S.btnP, opacity: canApply && !busy ? 1 : .55 }} onClick={() => call(false)} disabled={!canApply || busy}>Onayla ve Uygula</button>
      </>}>
      <p style={S.info}>Boş bırakılan alan değişmez. Activity ID atanmış görevlerde disiplin ve alan değiştirilemez; gerçek kayıt hepsi ya da hiçbiri.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <label style={S.label}>Disiplin<DisciplineSelect structure={structure} value={discipline} onChange={setDiscipline} emptyLabel="— değişmez —" /></label>
        <label style={S.label}>WBS<WbsSelect structure={structure} value={wbsId} onChange={setWbsId} areaId={areaId} emptyLabel="— değişmez —" /></label>
        <label style={S.label}>Alan<AreaSelect structure={structure} value={areaId} onChange={setAreaId} wbsId={wbsId} emptyLabel="— değişmez —" /></label>
      </div>
      {error && <p style={S.err}>{error}</p>}
      {preview?.summary && (
        <p style={S.info}>Önizleme: {preview.summary.update} güncellenecek · {preview.summary.unchanged} değişmeyecek · {preview.summary.error_count} hatalı. Hiçbir şey yazılmadı.</p>
      )}
      {preview?.items && (
        <ResultTable items={preview.items} columns={[
          { key: 'code', label: 'Görev', render: it => <><b>{it.task_code}</b> {it.task_name}</> },
          { key: 'aid', label: 'Activity ID', render: it => it.activity_id || '—' },
          { key: 'act', label: 'Sonuç', render: it => ({ update: 'Güncellenecek', unchanged: 'Değişmez', error: 'Hata' }[it.action] || it.action) },
          { key: 'msg', label: 'Açıklama', render: it => msgList([...(it.errors || []), ...(it.warnings || [])]) },
        ]} />
      )}
    </Modal>
  )
}

// ── Kod ata (tekil veya toplu; en fazla 500, Karar 54) ──
export function KodAtaModal({ tasks, onClose, onSaved }) {
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ids = useMemo(() => tasks.map(t => t.id), [tasks])
  const tooMany = ids.length > MAX_SELECTION

  async function call(dry) {
    setBusy(true)
    setError('')
    const { data, error: err } = await supabase.rpc('assign_activity_ids', { p_task_ids: ids, p_dry_run: dry })
    setBusy(false)
    if (err) {
      const detail = parseDetails(err)
      if (detail?.tasks) setPreview(p => ({ ...(p || {}), items: detail.tasks }))
      setError(wbsAreaErrorMessage(err))
      return
    }
    if (dry) setPreview(data)
    else onSaved(data)
  }

  useEffect(() => { if (!tooMany) call(true) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const s = preview?.summary
  const canApply = s && s.error_count === 0 && s.ok > 0
  return (
    <Modal title="Kod Ata (Activity ID)" subtitle={`${tasks.length} görev`} onClose={onClose} width={900}
      footer={<>
        <button type="button" style={S.btn} onClick={onClose} disabled={busy}>Vazgeç</button>
        <button type="button" style={{ ...S.btnP, opacity: canApply && !busy ? 1 : .55 }} onClick={() => call(false)} disabled={!canApply || busy}>Onayla ve Ata</button>
      </>}>
      {tooMany && <p style={S.err}>En fazla {MAX_SELECTION} görev seçilebilir; WBS veya alan filtresiyle seçimi daraltın.</p>}
      {busy && !preview && <p style={S.info}>Önizleme hazırlanıyor…</p>}
      {error && <p style={S.err}>{error}</p>}
      {s && (
        <p style={S.info}>
          Önizleme: {s.ok} görev kod alacak · {s.error_count} hatalı · {s.warning_count} uyarılı. Hiçbir şey yazılmadı.
          {s.error_count > 0 && ' Hatalı görev varken atama yapılamaz (hepsi ya da hiçbiri).'}
          {' '}Gerçek atamada araya başka bir atama girerse numaralar değişebilir.
        </p>
      )}
      {preview?.items && (
        <ResultTable items={preview.items} columns={[
          { key: 'code', label: 'Görev', render: it => <><b>{it.task_code}</b> {it.task_name}</> },
          { key: 'aid', label: 'Önerilen Activity ID', render: it => it.activity_id ? <b>{it.activity_id}</b> : '—' },
          { key: 'msg', label: 'Hata / uyarı', render: it => msgList([...(it.errors || []), ...(it.warnings || [])]) },
        ]} />
      )}
    </Modal>
  )
}

// ── İptal et / yeniden aç (admin / proje yöneticisi; DB de bunu zorunlu kılar, Karar 44) ──
export function IptalModal({ task, onClose, onSaved }) {
  const reopening = task.status === 'iptal'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run() {
    setBusy(true)
    setError('')
    const next = reopening ? (Number(task.total_progress || 0) > 0 ? 'devam_ediyor' : 'beklemede') : 'iptal'
    const { error: err } = await supabase.from('project_tasks').update({ status: next }).eq('id', task.id)
    setBusy(false)
    if (err) { setError(wbsAreaErrorMessage(err)); return }
    onSaved()
  }
  return (
    <Modal title={reopening ? 'Görevi yeniden aç' : 'Görevi iptal et'} subtitle={`${task.task_code} · ${task.task_name}`} onClose={onClose} width={520}
      footer={<>
        <button type="button" style={S.btn} onClick={onClose} disabled={busy}>Vazgeç</button>
        <button type="button" style={reopening ? S.btnP : S.btnD} onClick={run} disabled={busy}>{busy ? 'İşleniyor…' : reopening ? 'Yeniden aç' : 'İptal et'}</button>
      </>}>
      {reopening
        ? <p style={S.info}>Görev yeniden hesaplamalara (ilerleme, ağırlık, S-eğrisi) katılır ve yeniden ilerleme girilebilir.</p>
        : <p style={S.warn}>İptal edilen göreve ilerleme girilemez; görev ilerleme, kategori ağırlığı ve S-eğrisi hesaplarından çıkar. Kaydı ve Activity ID'si korunur.</p>}
      {error && <p style={S.err}>{error}</p>}
    </Modal>
  )
}
