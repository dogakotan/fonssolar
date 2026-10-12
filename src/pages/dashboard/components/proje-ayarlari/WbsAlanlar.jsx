import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useProjectStructure } from '../../../../hooks/useProjectStructure'
import { AREA_TYPES } from '../../../../utils/wbsAreaExcel'
import { wbsAreaErrorMessage } from '../../../../utils/wbsAreaErrors'
import { Modal } from '../is-plani/GorevSiniflandirmaModals'
import { modalStyles as S } from '../is-plani/modalStyles'
import WbsAlanImportModal from './WbsAlanImportModal'

// Proje Ayarları › WBS ve Alanlar (Karar 46-50, 55, 58).
// Herkes (proje erişimi olan) görür; ekleme / düzenleme / pasifleştirme / eşleştirme / import yalnızca admin ve
// proje yöneticisi (şantiye şefi yalnızca okur — RLS de bunu zorunlu kılar, Karar 55). Silme düğmesi yok.
// Kurallar DB trigger'larında (Adım 4); ekran hataları wbsAreaErrors ile Türkçe gösterir.

const card = { background: 'var(--color-surface, #fff)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 14, minWidth: 0 }
const rowBtn = { border: '1px solid var(--color-border-md)', borderRadius: 6, padding: '2px 7px', background: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--color-text-sub)' }

function useTaskCounts(projectId, reloadKey) {
  const [counts, setCounts] = useState({ wbs: new Map(), area: new Map() })
  useEffect(() => {
    if (!projectId) return
    let alive = true
    supabase.from('project_tasks').select('wbs_id, area_id, activity_id').eq('project_id', projectId).then(({ data }) => {
      if (!alive) return
      const wbs = new Map()
      const area = new Map()
      const bump = (m, k, aid) => { if (!k) return; const c = m.get(k) || { n: 0, aid: 0 }; c.n += 1; if (aid) c.aid += 1; m.set(k, c) }
      for (const t of data || []) { bump(wbs, t.wbs_id, t.activity_id); bump(area, t.area_id, t.activity_id) }
      setCounts({ wbs, area })
    })
    return () => { alive = false }
  }, [projectId, reloadKey])
  return counts
}

function CountBadge({ c }) {
  if (!c) return <span style={{ color: 'var(--color-muted-light)', fontSize: 11 }}>—</span>
  return <span style={{ fontSize: 11, color: 'var(--color-text-sub)' }}>{c.n} görev{c.aid ? ` · ${c.aid} ID'li` : ''}</span>
}

function ItemModal({ kind, item, structure, counts, projectId, onClose, onSaved }) {
  const isWbs = kind === 'wbs'
  const editing = !!item
  const c = editing ? (isWbs ? counts.wbs.get(item.id) : counts.area.get(item.id)) : null
  const [code, setCode] = useState(item ? (isWbs ? item.wbs_code : item.area_code) : '')
  const [name, setName] = useState(item?.name || '')
  const [parentId, setParentId] = useState(item?.parent_id || '')
  const [discipline, setDiscipline] = useState(item?.discipline || '')
  const [areaType, setAreaType] = useState(item?.area_type || 'diger')
  const [notes, setNotes] = useState(item?.notes || '')
  const [active, setActive] = useState(item ? item.is_active : true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const codeLocked = editing && c?.n > 0
  const parentLocked = editing && c?.aid > 0
  const list = isWbs ? structure.wbs : structure.areas
  const parents = structure.treeOrder(list.filter(x => x.id !== item?.id))
  const codeOk = isWbs ? /^[A-Z0-9][A-Z0-9-]*$/.test(code) : /^[A-Z0-9]+$/.test(code)

  async function save() {
    if (!code || !name.trim()) { setError('Kod ve ad zorunlu.'); return }
    if (!codeOk) { setError(isWbs ? 'WBS kodu yalnızca büyük harf, rakam ve tire içerebilir (DYB-020).' : 'Alan kodu yalnızca büyük harf ve rakam içerebilir, tire yok (B1, INV12).'); return }
    setSaving(true)
    setError('')
    const row = isWbs
      ? { wbs_code: code, name: name.trim(), parent_id: parentId || null, discipline: discipline || null, notes: notes.trim() || null, is_active: active }
      : { area_code: code, name: name.trim(), parent_id: parentId || null, area_type: areaType, notes: notes.trim() || null, is_active: active }
    const table = isWbs ? 'project_wbs' : 'project_areas'
    const q = editing
      ? supabase.from(table).update(row).eq('id', item.id)
      : supabase.from(table).insert({ ...row, project_id: projectId })
    const { error: err } = await q
    setSaving(false)
    if (err) { setError(wbsAreaErrorMessage(err)); return }
    onSaved()
  }

  return (
    <Modal title={`${isWbs ? 'WBS' : 'Alan'} ${editing ? 'düzenle' : 'ekle'}`} subtitle={editing ? `${code} · ${item.name}` : null} onClose={onClose} width={560}
      footer={<>
        <button type="button" style={S.btn} onClick={onClose} disabled={saving}>Vazgeç</button>
        <button type="button" style={S.btnP} onClick={save} disabled={saving}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
      </>}>
      <label style={S.label}>{isWbs ? 'WBS kodu' : 'Alan kodu'} *
        <input style={S.input} value={code} disabled={codeLocked} onChange={e => setCode(e.target.value.toUpperCase().trim())} placeholder={isWbs ? 'DYB-020' : 'B1'} />
        {codeLocked && <span style={{ fontSize: 11, color: '#92400e', fontWeight: 600 }}>🔒 Bu kodu kullanan {c.n} görev var; kod değiştirilemez. Yeni kodla yeni kayıt açın, eskisini pasifleştirin.</span>}
        {isWbs && !codeLocked && <span style={S.info}>Liste koda göre sıralanır; kodları sabit haneli yazın (DYB-020, DYB-100).</span>}
      </label>
      <label style={S.label}>Ad *<input style={S.input} value={name} onChange={e => setName(e.target.value)} /></label>
      <label style={S.label}>Üst {isWbs ? 'WBS' : 'alan'}
        <select style={S.input} value={parentId} disabled={parentLocked} onChange={e => setParentId(e.target.value)}>
          <option value="">— kök —</option>
          {parents.map(({ item: p, depth }) => <option key={p.id} value={p.id}>{'  '.repeat(depth)}{isWbs ? p.wbs_code : p.area_code} · {p.name}</option>)}
        </select>
        {parentLocked && <span style={{ fontSize: 11, color: '#92400e', fontWeight: 600 }}>🔒 Activity ID'li görevi olan kayıt taşınamaz.</span>}
      </label>
      {isWbs ? (
        <label style={S.label}>Disiplin
          <select style={S.input} value={discipline} onChange={e => setDiscipline(e.target.value)}>
            <option value="">—</option>
            {structure.disciplines.map(d => <option key={d.discipline} value={d.discipline}>{d.label_tr} ({d.id_code})</option>)}
          </select>
        </label>
      ) : (
        <label style={S.label}>Alan tipi
          <select style={S.input} value={areaType} onChange={e => setAreaType(e.target.value)}>
            {AREA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      )}
      <label style={S.label}>Not<input style={S.input} value={notes} onChange={e => setNotes(e.target.value)} /></label>
      <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Aktif
      </label>
      {error && <p style={S.err}>{error}</p>}
    </Modal>
  )
}

function LinkPanel({ wbs, structure, canEdit, onSaved }) {
  const direct = useMemo(() => new Set(structure.linksByWbs.get(wbs.id) || []), [structure.linksByWbs, wbs.id])
  const inherited = useMemo(() => {
    const m = new Map()
    for (const node of structure.wbsChain(wbs.id).slice(1)) {
      for (const id of structure.linksByWbs.get(node.id) || []) if (!m.has(id)) m.set(id, node.wbs_code)
    }
    return m
  }, [structure, wbs.id])
  const [sel, setSel] = useState(direct)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setSel(new Set(direct)) }, [direct])

  const dirty = sel.size !== direct.size || [...sel].some(x => !direct.has(x))
  const effective = new Set([...sel, ...inherited.keys()])

  async function save() {
    setSaving(true)
    setError('')
    const { error: err } = await supabase.rpc('save_area_wbs_links', { p_wbs_id: wbs.id, p_area_ids: [...sel] })
    setSaving(false)
    if (err) { setError(wbsAreaErrorMessage(err)); return }
    onSaved()
  }

  const rows = structure.treeOrder(structure.areas)
  return (
    <div style={card} data-testid="alan-wbs-panel">
      <h4 style={{ margin: '0 0 4px', fontSize: 14 }}>Alan-WBS eşleştirme · {wbs.wbs_code}</h4>
      <p style={{ ...S.info, margin: '0 0 8px' }}>
        {effective.size === 0
          ? "Bağ tanımsız: bu WBS'te her alan kullanılabilir."
          : `Etkin küme (Karar 38): ${[...effective].map(id => structure.areaById.get(id)?.area_code).filter(Boolean).join(', ')}`}
      </p>
      <div style={{ display: 'grid', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
        {rows.map(({ item, depth }) => {
          const via = inherited.get(item.id)
          return (
            <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, paddingLeft: depth * 14, color: item.is_active ? 'var(--color-text)' : 'var(--color-muted-light)' }}>
              <input type="checkbox" disabled={!canEdit || !!via} checked={!!via || sel.has(item.id)}
                onChange={() => setSel(prev => { const n = new Set(prev); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n })} />
              <b>{item.area_code}</b> {item.name}
              {via && <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>({via} üzerinden)</span>}
            </label>
          )
        })}
      </div>
      {error && <p style={{ ...S.err, marginTop: 8 }}>{error}</p>}
      {canEdit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" style={{ ...S.btnP, opacity: dirty && !saving ? 1 : 0.55 }} disabled={!dirty || saving} onClick={save}>{saving ? 'Kaydediliyor…' : 'Bağları kaydet'}</button>
        </div>
      )}
    </div>
  )
}

export default function WbsAlanlar({ projectId, role }) {
  const canEdit = role === 'admin' || role === 'proje_yoneticisi'
  const structure = useProjectStructure(projectId)
  const [reloadKey, setReloadKey] = useState(0)
  const counts = useTaskCounts(projectId, reloadKey)
  const [showInactive, setShowInactive] = useState(false)
  const [modal, setModal] = useState(null) // { kind, item }
  const [importOpen, setImportOpen] = useState(false)
  const [selectedWbsId, setSelectedWbsId] = useState(null)
  const [error, setError] = useState('')

  const reload = useCallback(() => { structure.reload(); setReloadKey(k => k + 1) }, [structure])

  async function toggleActive(kind, item) {
    setError('')
    const { error: err } = await supabase.from(kind === 'wbs' ? 'project_wbs' : 'project_areas').update({ is_active: !item.is_active }).eq('id', item.id)
    if (err) { setError(wbsAreaErrorMessage(err)); return }
    reload()
  }

  if (structure.loading) return <div style={card}>Yükleniyor…</div>
  if (!structure.available) {
    return <div style={card}>Bu veritabanında proje yapısı (Faz 1) henüz kurulu değil.</div>
  }

  const wbsRows = structure.treeOrder(structure.wbs.filter(w => showInactive || w.is_active))
  const areaRows = structure.treeOrder(structure.areas.filter(a => showInactive || a.is_active))
  const selectedWbs = structure.wbsById.get(selectedWbsId)

  const List = ({ title, kind, rows }) => (
    <div style={card} data-testid={kind === 'wbs' ? 'wbs-listesi' : 'alan-listesi'}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <h4 style={{ margin: 0, fontSize: 14 }}>{title} ({rows.length})</h4>
        {canEdit && <button type="button" style={{ ...rowBtn, marginLeft: 'auto' }} onClick={() => setModal({ kind, item: null })}>+ Ekle</button>}
      </div>
      {rows.length === 0 && <p style={S.info}>Kayıt yok.</p>}
      <div style={{ display: 'grid', gap: 2, maxHeight: 420, overflowY: 'auto' }}>
        {rows.map(({ item, depth }) => {
          const c = kind === 'wbs' ? counts.wbs.get(item.id) : counts.area.get(item.id)
          const isSel = kind === 'wbs' && item.id === selectedWbsId
          return (
            <div key={item.id} data-code={kind === 'wbs' ? item.wbs_code : item.area_code}
              onClick={kind === 'wbs' ? () => setSelectedWbsId(item.id) : undefined}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', paddingLeft: 6 + depth * 16, borderRadius: 6, cursor: kind === 'wbs' ? 'pointer' : 'default',
                background: isSel ? 'rgba(37,99,235,.08)' : undefined, opacity: item.is_active ? 1 : 0.5 }}>
              <b style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{kind === 'wbs' ? item.wbs_code : item.area_code}</b>
              <span style={{ fontSize: 12.5, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.name}{kind === 'wbs' && item.discipline ? ` · ${item.discipline}` : ''}{kind === 'area' ? ` · ${item.area_type}` : ''}{!item.is_active ? ' · pasif' : ''}
              </span>
              <CountBadge c={c} />
              {canEdit && (
                <span style={{ display: 'inline-flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                  <button type="button" style={rowBtn} onClick={() => setModal({ kind, item })}>Düzenle</button>
                  <button type="button" style={rowBtn} onClick={() => toggleActive(kind, item)}>{item.is_active ? 'Pasifleştir' : 'Aktifleştir'}</button>
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div style={{ display: 'grid', gap: 12 }} data-testid="wbs-ve-alanlar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <p style={{ ...S.info, margin: 0, flex: 1 }}>
          {canEdit
            ? "WBS ve alan yapısı Activity ID'nin temelidir. Görevi olan kaydın kodu değişmez; Activity ID'li görevi olan kayıt pasifleştirilemez ve taşınamaz."
            : 'Yapıyı yalnızca admin ve proje yöneticisi düzenler. Yeni alan gerekiyorsa Ticket ile talep açın.'}
        </p>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Pasifleri göster
        </label>
        {canEdit && <button type="button" style={S.btnP} onClick={() => setImportOpen(true)}>Excel'den içe aktar</button>}
      </div>
      {error && <p style={S.err}>{error}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
        <List title="WBS" kind="wbs" rows={wbsRows} />
        <List title="Alanlar" kind="area" rows={areaRows} />
      </div>
      {selectedWbs
        ? <LinkPanel key={selectedWbs.id} wbs={selectedWbs} structure={structure} canEdit={canEdit} onSaved={reload} />
        : <p style={S.info}>Alan-WBS eşleştirmesi için listeden bir WBS seçin.</p>}
      {modal && (
        <ItemModal kind={modal.kind} item={modal.item} structure={structure} counts={counts} projectId={projectId}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); reload() }} />
      )}
      {importOpen && <WbsAlanImportModal projectId={projectId} onClose={() => setImportOpen(false)} onImported={reload} />}
    </div>
  )
}
