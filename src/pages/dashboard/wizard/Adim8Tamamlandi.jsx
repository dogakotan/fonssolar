import { useState, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { GorevKayitOnizleme } from './GorevKayitOnizleme'
import { callSaveProjectTasks } from './saveProjectTasks'

// Varsayılan (Proje Düzenleme'deki 6 adımlık akış — Riskler dahil). Yeni proje
// oluşturma akışında (YeniProjeWizard.jsx) Riskler adımı yok — bu bileşene kendi
// step-numarasına göre bir `steps` prop'u geçiriyor (bkz. o dosyadaki not).
const DEFAULT_STEPS = [
  { step: 2, table: 'project_tasks',       label: 'İş Kalemleri' },
  { step: 3, rpc: 'save_project_category_weights', label: 'Kategori Ağırlıkları' },
  { step: 4, table: 'project_risks',       label: 'Riskler' },
  { step: 5, rpc: 'set_project_procurement_completed', label: 'Tedarik ve Teslimat' },
  { step: 6, table: 'budget_lines',        label: 'Bütçe' },
]

const btnP = { padding: '0.5rem 1.25rem', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const btnS = { padding: '0.5rem 1.25rem', background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border-md)', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }

export default function Adim8Tamamlandi({ stepsResult, projectType, mode = 'new', project, onBack, onSuccess, onViewProject, steps = DEFAULT_STEPS }) {
  const [status,    setStatus]    = useState('idle') // 'idle' | 'saving' | 'done' | 'error'
  const [errorMsg,  setErrorMsg]  = useState(null)
  const [savedId,   setSavedId]   = useState(null)
  const [savedName, setSavedName] = useState(null)
  const savingRef = useRef(false)

  const isEdit = mode === 'edit'
  const step1  = stepsResult?.[1] ?? {}

  const tasksStep   = steps.find(x => x.table === 'project_tasks')
  const weightsStep = steps.find(x => x.rpc === 'save_project_category_weights')
  const tasksRes    = tasksStep ? stepsResult?.[tasksStep.step] : null
  const weightsRes  = weightsStep ? stepsResult?.[weightsStep.step] : null
  const tasksUsable   = Boolean(tasksRes && !tasksRes.skipped && tasksRes.rows?.length)
  const weightsUsable = Boolean(weightsRes && !weightsRes.skipped && weightsRes.rows?.length)
  const [preview, setPreview] = useState(null) // { report, errorItems, error }

  function fail(msg) {
    savingRef.current = false
    setStatus('error')
    setErrorMsg(msg)
  }

  // Düzenlemede görev listesi önce önizlenir (Ç-B, Karar 59); yeni projede bütün satırlar eklenir, önizleme gerekmez.
  async function handleSave() {
    if (savingRef.current) return
    setErrorMsg(null)
    if (isEdit && tasksUsable) {
      savingRef.current = true
      setStatus('saving')
      const r = await callSaveProjectTasks(project.id, tasksRes.rows, { dryRun: true, weights: weightsUsable ? weightsRes.rows : null })
      savingRef.current = false
      setStatus('idle')
      if (!r.missing) {
        setPreview({ report: r.data || null, errorItems: r.items, error: r.error || null })
        return
      }
    }
    await doSave()
  }

  async function doSave() {
    if (savingRef.current) return
    savingRef.current = true
    setStatus('saving')
    setErrorMsg(null)

    const n = (v) => (v !== '' && v != null ? Number(v) : null)
    const projectPayload = {
      name:             step1.name,
      location:         step1.location         || null,
      capacity_kwp:     n(step1.capacity_kwp),
      capacity_kwe:     n(step1.capacity_kwe),
      storage_kwh:      n(step1.storage_kwh),
      start_date:       step1.start_date       || null,
      target_date:      step1.target_date      || null,
      total_days:       step1.total_days !== '' ? Number(step1.total_days) : 180,
      status:           step1.status,
      progress:         Number(step1.progress) || 0,
      project_type:     projectType            || null,
      panel_brand:      step1.panel_brand      || null,
      panel_count:      n(step1.panel_count),
      inverter_brand:   step1.inverter_brand   || null,
      inverter_count:   n(step1.inverter_count),
      battery_brand:    step1.battery_brand    || null,
      battery_power_kw: n(step1.battery_power_kw),
      battery_count:    n(step1.battery_count),
    }

    let projectId

    if (!isEdit) {
      // Proje + kod tek işlemde (Karar 29, 35). Fonksiyon yoksa (Faz 1 migration'ı öncesi) eski doğrudan ekleme.
      const { data: created, error: rpcErr } = await supabase.rpc('create_project_with_code', {
        p_project: { ...projectPayload, id: step1.id }, p_code: step1.code,
      })
      if (rpcErr && (rpcErr.code === 'PGRST202' || /could not find the function/i.test(rpcErr.message || ''))) {
        const { data, error } = await supabase.from('projects').insert([{ ...projectPayload, id: step1.id }]).select().single()
        if (error) {
          return fail(error.code === '23505'
            ? `"${step1.id}" ID'siyle bir proje zaten mevcut. Geri dönüp farklı bir ID girin.`
            : error.message)
        }
        projectId = data.id
      } else if (rpcErr) {
        return fail(rpcErr.hint || rpcErr.message)
      } else {
        projectId = created.id
      }
    } else {
      projectId = project.id
      const { error } = await supabase
        .from('projects')
        .update(projectPayload)
        .eq('id', projectId)
      if (error) return fail(error.message)
    }

    // Görevler ve kategori ağırlıkları tek işlemde (ağırlıksız kategori kontrolü commit anında, Karar 56)
    let tasksDone = false
    let weightsDone = false
    if (tasksUsable) {
      const r = await callSaveProjectTasks(projectId, tasksRes.rows, { dryRun: false, weights: weightsUsable ? weightsRes.rows : null })
      if (r.error) {
        setPreview(p => (p ? { ...p, error: r.error, errorItems: r.items } : p))
        return fail(`${tasksStep.label} kaydedilirken hata: ${r.error}`)
      }
      if (!r.missing) { tasksDone = true; weightsDone = weightsUsable }
    }

    for (const { step, table, rpc, label } of steps) {
      const res = stepsResult?.[step]
      if (!res || res.skipped) continue
      if (table === 'project_tasks' && tasksDone) continue
      if (rpc === 'save_project_category_weights' && weightsDone) continue

      if (rpc) {
        // Tedarik onayı isteğe bağlı (Karar 88): yalnızca PM gerçekten onayladıysa çağrılır.
        if (rpc === 'set_project_procurement_completed' && res.completed !== true) continue
        const params = rpc === 'set_project_procurement_completed'
          ? { p_project_id: projectId, p_completed: res.completed === true }
          : { p_project_id: projectId, p_weights: res.rows }
        const { error: rpcError } = await supabase.rpc(rpc, params)
        if (rpcError) return fail(`${label} kaydedilirken hata: ${rpcError.message}`)
        continue
      }

      if (!res.rows?.length) continue

      // Eski yol (görevler için yalnızca save_project_tasks yoksa; riskler ve bütçe bugünkü gibi)
      if (isEdit) {
        const { error: delErr } = await supabase.from(table).delete().eq('project_id', projectId)
        if (delErr) return fail(`${label} silinirken hata: ${delErr.message}`)
      }
      const rowsWithId = res.rows.map(({ id: _omit, ...r }) => ({ ...r, project_id: projectId }))
      const { error: insErr } = await supabase.from(table).insert(rowsWithId)
      if (insErr) return fail(`${label} kaydedilirken hata: ${insErr.message}`)
    }

    setPreview(null)
    setSavedId(projectId)
    setSavedName(step1.name)
    setStatus('done')
  }

  if (status === 'done') {
    return (
      <div className="card">
        <div style={{ padding: '2.5rem 2rem', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f0fdf4', border: '2px solid #86efac', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text)', margin: '0 0 0.5rem' }}>
            {isEdit ? 'Proje Başarıyla Güncellendi!' : 'Proje Başarıyla Oluşturuldu!'}
          </h2>
          <p style={{ fontSize: 14, color: 'var(--color-muted)', margin: '0 0 0.25rem' }}>
            <strong style={{ color: 'var(--color-text-sub)' }}>{savedName}</strong>{' '}
            {isEdit ? 'projesi güncellendi.' : 'projesi sisteme kaydedildi.'}
          </p>
          <p style={{ fontSize: 12, color: 'var(--color-muted-light)', margin: '0 0 2rem' }}>ID: {savedId}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
            <button onClick={() => onViewProject(savedId, savedName)} style={{ ...btnP, width: '100%', maxWidth: 280 }}>
              Projeyi Görüntüle →
            </button>
            <button onClick={onSuccess} style={{ ...btnS, width: '100%', maxWidth: 280 }}>
              {isEdit ? 'Yönetim Listesine Dön' : 'Projeler Listesine Dön'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const isSaving = status === 'saving'

  return (
    <div className="card">
      <div className="card-header">
        <h3>Adım {steps.length + 2} — {isEdit ? 'Güncelle & Tamamla' : 'Kaydet & Tamamla'}</h3>
        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
          Veriler veritabanına şimdi yazılacak
        </span>
      </div>

      <div style={{ padding: '1.5rem' }}>
        {errorMsg && (
          <div style={{ padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)', fontSize: 13, marginBottom: '1.25rem' }}>
            {errorMsg}
          </div>
        )}

        <p style={{ fontSize: 13, color: 'var(--color-muted)', margin: '0 0 1.25rem' }}>
          {isEdit
            ? 'Güncellenen adımlar aşağıda özetlendi. Onaylamak için "Projeyi Güncelle" butonuna basın.'
            : 'Tüm adımlar hazırlandı. Onaylamak için "Projeyi Kaydet" butonuna basın.'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
          {/* Step 1 summary */}
          {(() => {
            const done = !!stepsResult?.[1]
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 0.875rem', background: done ? '#f0fdf4' : '#fef9c3', border: `1px solid ${done ? '#bbf7d0' : '#fde047'}`, borderRadius: 6 }}>
                <span style={{ fontSize: 15 }}>{done ? '✓' : '!'}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: done ? '#166534' : '#854d0e' }}>Proje Bilgileri</span>
                {done && (
                  <span style={{ fontSize: 12, color: '#15803d', marginLeft: 'auto' }}>
                    {stepsResult[1].name} ({stepsResult[1].id})
                  </span>
                )}
                {!done && (
                  <span style={{ fontSize: 12, color: '#854d0e', marginLeft: 'auto' }}>Adım 1 tamamlanmadı</span>
                )}
              </div>
            )
          })()}

          {/* Steps 2–7 summary */}
          {steps.map(({ step, label }) => {
            const res  = stepsResult?.[step]
            const done = res !== undefined
            return (
              <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 0.875rem', background: done ? (res.skipped ? '#f8fafc' : '#f0fdf4') : '#fafafa', border: `1px solid ${done ? (res.skipped ? '#e2e8f0' : '#bbf7d0') : '#e2e8f0'}`, borderRadius: 6 }}>
                <span style={{ fontSize: 15 }}>{done ? (res.skipped ? '⊘' : '✓') : '○'}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: done ? (res.skipped ? '#94a3b8' : '#166534') : '#64748b' }}>{label}</span>
                <span style={{ fontSize: 12, marginLeft: 'auto', color: done ? (res.skipped ? '#94a3b8' : '#15803d') : '#94a3b8' }}>
                  {done ? (res.skipped ? 'yetki proje yöneticisinde' : (res.completed ? 'tamamlandı' : `${res.count} kayıt`)) : 'ziyaret edilmedi'}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {preview && (
        <GorevKayitOnizleme report={preview.report} errorItems={preview.errorItems} error={preview.error}
          busy={status === 'saving'} onClose={() => setPreview(null)} onConfirm={doSave} />
      )}

      <div style={{ display: 'none' }}>
        <button
          style={{ ...btnS, opacity: isSaving ? 0.5 : 1, cursor: isSaving ? 'not-allowed' : 'pointer' }}
          onClick={onBack}
          disabled={isSaving}
        >
          ← Geri
        </button>
        <button
          style={{ ...btnP, opacity: (isSaving || !stepsResult?.[1]) ? 0.7 : 1, cursor: (isSaving || !stepsResult?.[1]) ? 'not-allowed' : 'pointer' }}
          data-wizard-submit="save"
          onClick={handleSave}
          disabled={isSaving || !stepsResult?.[1]}
        >
          {isSaving ? 'Kaydediliyor…' : isEdit ? 'Projeyi Güncelle →' : 'Projeyi Kaydet →'}
        </button>
      </div>
    </div>
  )
}
