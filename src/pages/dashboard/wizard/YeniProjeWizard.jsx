import { useRef, useState } from 'react'
import WizardStepper            from './WizardStepper'
import Adim1ProjeBilgileri      from './Adim1ProjeBilgileri'
import Adim2IsKalemleri         from './Adim2IsKalemleri'
import Adim3IlerlemeBilgileri   from './Adim3IlerlemeBilgileri'
import Adim4Riskler             from './Adim4Riskler'
import Adim5Tedarik             from './Adim5Tedarik'
import Adim6Butce               from './Adim6Butce'
import Adim7KritikYol           from './Adim7KritikYol'
import Adim8Tamamlandi          from './Adim8Tamamlandi'

const PROJECT_TYPES = [
  { value: 'arazi_ges',            label: 'Arazi GES',            icon: '🌄', desc: 'Açık arazi güneş enerji santrali' },
  { value: 'endustriyel_cati_ges', label: 'Endüstriyel Çatı GES', icon: '🏭', desc: 'Fabrika, depo, sanayi binası çatısı' },
  { value: 'evsel_ges',            label: 'Evsel GES',            icon: '🏠', desc: 'Konut ve küçük ticari çatı' },
]

export default function YeniProjeWizard({ onSuccess, onViewProject }) {
  const [projectType, setProjectType] = useState(null)
  const [step,        setStep]        = useState(1)
  const [stepsResult, setStepsResult] = useState({})
  const actionRef = useRef('next')

  const projectId = stepsResult[1]?.id ?? null
  const completedSteps = Object.keys(stepsResult).map(Number)
  const availableUntil = projectId ? 8 : 1

  const goNext = () => setStep(s => s + 1)
  const goBack = () => setStep(s => s - 1)

  function handleStepDone(stepNo, result) {
    setStepsResult(r => ({ ...r, [stepNo]: result }))
    if (actionRef.current === 'next') {
      setStep(current => Math.min(8, Math.max(current + 1, stepNo + 1)))
    }
  }

  function submitCurrentStep(action = 'next') {
    actionRef.current = action
    if (step === 1) document.querySelector('[data-wizard-form="project"]')?.requestSubmit()
    else if (step < 8) document.querySelector('[data-wizard-submit="next"]')?.click()
    else document.querySelector('[data-wizard-submit="save"]')?.click()
  }

  if (!projectType) {
    return <TypeSelector onConfirm={setProjectType} onCancel={onSuccess} />
  }

  return (
    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
      <div className="card" style={{ width: 210, flexShrink: 0, overflow: 'hidden' }}>
        <WizardStepper
          current={step}
          completedSteps={completedSteps}
          availableUntil={availableUntil}
          onSelect={setStep}
        />
        <div style={{ padding: '0.875rem', borderTop: '1px solid var(--color-border-md)', display: 'grid', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={onSuccess}
            style={{ padding: '0.5rem', background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border-md)', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            İptal
          </button>
          {step < 8 && (
            <button
              type="button"
              onClick={() => submitCurrentStep('save')}
              style={{ padding: '0.5rem', background: '#fff', color: 'var(--color-primary)', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Kaydet
            </button>
          )}
          <button
            type="button"
            onClick={() => submitCurrentStep('next')}
            style={{ padding: '0.5rem', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {step === 8 ? 'Kaydet' : 'Devam →'}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {step === 1 && (
          <Adim1ProjeBilgileri
            result={stepsResult[1]}
            onDone={r => handleStepDone(1, r)}
            onCancel={onSuccess}
          />
        )}
        {step === 2 && (
          <Adim2IsKalemleri
            projectId={projectId}
            result={stepsResult[2]}
            onDone={r => handleStepDone(2, r)}
            onBack={goBack}
          />
        )}
        {step === 3 && (
          <Adim3IlerlemeBilgileri
            projectId={projectId}
            result={stepsResult[3]}
            onDone={r => handleStepDone(3, r)}
            onBack={goBack}
          />
        )}
        {step === 4 && (
          <Adim4Riskler
            projectId={projectId}
            result={stepsResult[4]}
            onDone={r => handleStepDone(4, r)}
            onBack={goBack}
          />
        )}
        {step === 5 && (
          <Adim5Tedarik
            projectId={projectId}
            result={stepsResult[5]}
            onDone={r => handleStepDone(5, r)}
            onBack={goBack}
          />
        )}
        {step === 6 && (
          <Adim6Butce
            projectId={projectId}
            result={stepsResult[6]}
            onDone={r => handleStepDone(6, r)}
            onBack={goBack}
          />
        )}
        {step === 7 && (
          <Adim7KritikYol
            projectId={projectId}
            result={stepsResult[7]}
            onDone={r => handleStepDone(7, r)}
            onBack={goBack}
          />
        )}
        {step === 8 && (
          <Adim8Tamamlandi
            stepsResult={stepsResult}
            projectType={projectType}
            onBack={goBack}
            onSuccess={onSuccess}
            onViewProject={onViewProject}
          />
        )}
      </div>
    </div>
  )
}

function TypeSelector({ onConfirm, onCancel }) {
  const [selected, setSelected] = useState(null)

  return (
    <div className="card">
      <div className="card-header">
        <h3>Proje Türü Seç</h3>
        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>Devam etmek için proje türünü belirleyin</span>
      </div>
      <div style={{ padding: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          {PROJECT_TYPES.map(pt => {
            const active = selected === pt.value
            return (
              <button
                key={pt.value}
                onClick={() => setSelected(pt.value)}
                style={{
                  padding: '1.5rem 1rem',
                  border: `2px solid ${active ? 'var(--color-primary)' : 'var(--color-border-md)'}`,
                  borderRadius: 'var(--radius-md)',
                  background: active ? '#eff6ff' : 'var(--color-surface)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <span style={{ fontSize: 36 }}>{pt.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: active ? 'var(--color-primary)' : 'var(--color-text)' }}>
                  {pt.label}
                </span>
                <span style={{ fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.4 }}>
                  {pt.desc}
                </span>
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            style={{ padding: '0.5rem 1.25rem', background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border-md)', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
            onClick={onCancel}
          >
            İptal
          </button>
          <button
            disabled={!selected}
            onClick={() => selected && onConfirm(selected)}
            style={{ padding: '0.5rem 1.25rem', background: selected ? 'var(--color-primary)' : '#94a3b8', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 600, cursor: selected ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}
          >
            Devam →
          </button>
        </div>
      </div>
    </div>
  )
}
