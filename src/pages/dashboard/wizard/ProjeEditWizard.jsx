import { useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import WizardStepper            from './WizardStepper'
import Adim1ProjeBilgileri      from './Adim1ProjeBilgileri'
import Adim2IsKalemleri         from './Adim2IsKalemleri'
import Adim3IlerlemeBilgileri   from './Adim3IlerlemeBilgileri'
import Adim4Riskler             from './Adim4Riskler'
import Adim5Tedarik             from './Adim5Tedarik'
import Adim6Butce               from './Adim6Butce'
import Adim7KritikYol           from './Adim7KritikYol'
import Adim8Tamamlandi          from './Adim8Tamamlandi'

const TABLE_MAP = {
  2: 'project_tasks',
  3: 'progress_items',
  4: 'project_risks',
  5: 'procurement_items',
  6: 'budget_lines',
  7: 'critical_path_items',
}

export default function ProjeEditWizard({ project, onSuccess, onViewProject }) {
  const projectId = project.id
  const [step,        setStep]        = useState(1)
  const [stepsResult, setStepsResult] = useState({})
  const [saving,      setSaving]      = useState(false)
  const [toast,       setToast]       = useState(null) // { msg, ok }
  const actionRef = useRef('next')

  const goNext = () => setStep(s => s + 1)
  const goBack = () => setStep(s => s - 1)

  function showToast(msg, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  async function directSave(stepNo, result) {
    setSaving(true)
    try {
      if (stepNo === 1) {
        const n = v => (v !== '' && v != null ? Number(v) : null)
        const payload = {
          name:             result.name,
          location:         result.location         || null,
          capacity_kwp:     n(result.capacity_kwp),
          capacity_kwe:     n(result.capacity_kwe),
          storage_kwh:      n(result.storage_kwh),
          start_date:       result.start_date       || null,
          target_date:      result.target_date      || null,
          total_days:       result.total_days !== '' ? Number(result.total_days) : 180,
          status:           result.status,
          progress:         Number(result.progress) || 0,
          project_type:     result.project_type     || null,
          panel_brand:      result.panel_brand      || null,
          panel_count:      n(result.panel_count),
          inverter_brand:   result.inverter_brand   || null,
          inverter_count:   n(result.inverter_count),
          battery_brand:    result.battery_brand    || null,
          battery_power_kw: n(result.battery_power_kw),
          battery_count:    n(result.battery_count),
        }
        const { error } = await supabase.from('projects').update(payload).eq('id', projectId)
        if (error) throw error
      } else {
        const table = TABLE_MAP[stepNo]
        if (table && !result.skipped && result.rows?.length) {
          const { error: delErr } = await supabase.from(table).delete().eq('project_id', projectId)
          if (delErr) throw delErr
          const { error: insErr } = await supabase.from(table).insert(
            result.rows.map(r => ({ ...r, project_id: projectId }))
          )
          if (insErr) throw insErr
        }
      }
      showToast('Değişiklikler kaydedildi')
    } catch (err) {
      showToast(err.message, false)
    } finally {
      setSaving(false)
    }
  }

  function handleStepDone(stepNo, result) {
    setStepsResult(r => ({ ...r, [stepNo]: result }))
    if (actionRef.current === 'save') {
      directSave(stepNo, result)
    } else if (actionRef.current === 'next') {
      goNext()
    }
  }

  function submitCurrentStep(action = 'next') {
    actionRef.current = action
    if (step === 1) document.querySelector('[data-wizard-form="project"]')?.requestSubmit()
    else if (step < 8) document.querySelector('[data-wizard-submit="next"]')?.click()
    else document.querySelector('[data-wizard-submit="save"]')?.click()
  }

  const btnBase = { padding: '0.5rem', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: 'none' }

  return (
    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
      <div className="card" style={{ width: 210, flexShrink: 0, overflow: 'hidden' }}>
        <WizardStepper current={step} completedSteps={Object.keys(stepsResult).map(Number)} availableUntil={8} onSelect={setStep} />
        <div style={{ padding: '0.875rem', borderTop: '1px solid var(--color-border-md)', display: 'grid', gap: '0.5rem' }}>
          <button type="button" onClick={onSuccess} style={{ ...btnBase, background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border-md)' }}>
            İptal
          </button>
          {step < 8 && (
            <button
              type="button"
              onClick={() => submitCurrentStep('save')}
              disabled={saving}
              style={{ ...btnBase, background: saving ? '#f1f5f9' : '#fff', color: saving ? '#94a3b8' : 'var(--color-primary)', border: `1px solid ${saving ? '#e2e8f0' : 'var(--color-primary)'}`, cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          )}
          <button
            type="button"
            onClick={() => submitCurrentStep('next')}
            style={{ ...btnBase, background: 'var(--color-primary)', color: '#fff' }}
          >
            {step === 8 ? 'Kaydet' : 'Devam →'}
          </button>

          {toast && (
            <div style={{
              padding: '0.5rem 0.625rem',
              borderRadius: 6,
              background: toast.ok ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${toast.ok ? '#86efac' : '#fecaca'}`,
              color: toast.ok ? '#166534' : '#991b1b',
              fontSize: 11,
              fontWeight: 600,
              textAlign: 'center',
            }}>
              {toast.ok ? '✓ ' : '✗ '}{toast.msg}
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {step === 1 && (
          <Adim1ProjeBilgileri
            result={stepsResult[1]}
            mode="edit"
            initialProject={project}
            onDone={r => handleStepDone(1, r)}
            onCancel={onSuccess}
          />
        )}
        {step === 2 && (
          <Adim2IsKalemleri
            projectId={projectId}
            result={stepsResult[2]}
            mode="edit"
            onDone={r => handleStepDone(2, r)}
            onBack={goBack}
          />
        )}
        {step === 3 && (
          <Adim3IlerlemeBilgileri
            projectId={projectId}
            result={stepsResult[3]}
            mode="edit"
            onDone={r => handleStepDone(3, r)}
            onBack={goBack}
          />
        )}
        {step === 4 && (
          <Adim4Riskler
            projectId={projectId}
            result={stepsResult[4]}
            mode="edit"
            onDone={r => handleStepDone(4, r)}
            onBack={goBack}
          />
        )}
        {step === 5 && (
          <Adim5Tedarik
            projectId={projectId}
            result={stepsResult[5]}
            mode="edit"
            onDone={r => handleStepDone(5, r)}
            onBack={goBack}
          />
        )}
        {step === 6 && (
          <Adim6Butce
            projectId={projectId}
            result={stepsResult[6]}
            mode="edit"
            onDone={r => handleStepDone(6, r)}
            onBack={goBack}
          />
        )}
        {step === 7 && (
          <Adim7KritikYol
            projectId={projectId}
            result={stepsResult[7]}
            mode="edit"
            onDone={r => handleStepDone(7, r)}
            onBack={goBack}
          />
        )}
        {step === 8 && (
          <Adim8Tamamlandi
            stepsResult={stepsResult}
            projectType={stepsResult[1]?.project_type ?? project.project_type ?? null}
            mode="edit"
            project={project}
            onBack={goBack}
            onSuccess={onSuccess}
            onViewProject={onViewProject}
          />
        )}
      </div>
    </div>
  )
}
