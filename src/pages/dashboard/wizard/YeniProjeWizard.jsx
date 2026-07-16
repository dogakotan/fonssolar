import { useRef, useState } from 'react'
import WizardStepper            from './WizardStepper'
import Adim1ProjeBilgileri      from './Adim1ProjeBilgileri'
import Adim2IsKalemleri         from './Adim2IsKalemleri'
import Adim5Tedarik             from './Adim5Tedarik'
import Adim6Butce               from './Adim6Butce'
import Adim8Tamamlandi          from './Adim8Tamamlandi'

// Riskler adımı burada YOK — yeni oluşturulan bir projede henüz görev/satın alma
// verisi olmadığı için ne otomatik risk motoru bir şey üretebilir ne de manuel risk
// girişi anlamlı olur. Risk girişi yalnızca proje düzenleme akışında (ProjeEditWizard.jsx)
// var — bkz. CLAUDE.md "Kritik yol ve otomatik risk motoru".
const STEP_LABELS = ['Proje Bilgileri', 'İş Kalemleri', 'Tedarik', 'Bütçe', 'Tamamlandı']
// Adim8Tamamlandi.jsx'in varsayılan STEPS'i (Riskler dahil 6 adımlık) burada
// geçerli değil — kendi 5 adımlık numaralandırmamızı geçiyoruz.
const SUMMARY_STEPS = [
  { step: 2, table: 'project_tasks',     label: 'İş Kalemleri' },
  { step: 3, table: 'procurement_items', label: 'Tedarik' },
  { step: 4, table: 'budget_lines',      label: 'Bütçe' },
]

export default function YeniProjeWizard({ onSuccess, onViewProject }) {
  const [step,        setStep]        = useState(1)
  const [stepsResult, setStepsResult] = useState({})
  const actionRef = useRef('next')

  const projectId = stepsResult[1]?.id ?? null
  const completedSteps = Object.keys(stepsResult).map(Number)
  const availableUntil = projectId ? 5 : 1

  const goNext = () => setStep(s => s + 1)
  const goBack = () => setStep(s => s - 1)

  function handleStepDone(stepNo, result) {
    setStepsResult(r => ({ ...r, [stepNo]: result }))
    if (actionRef.current === 'save') {
      setStep(5)
    } else if (actionRef.current === 'next') {
      setStep(current => Math.min(5, Math.max(current + 1, stepNo + 1)))
    }
  }

  function submitCurrentStep(action = 'next') {
    actionRef.current = action
    if (step === 1) document.querySelector('[data-wizard-form="project"]')?.requestSubmit()
    else if (step < 5) document.querySelector('[data-wizard-submit="next"]')?.click()
    else document.querySelector('[data-wizard-submit="save"]')?.click()
  }

  return (
    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
      <div className="card" style={{ width: 210, flexShrink: 0, overflow: 'hidden' }}>
        <WizardStepper
          current={step}
          completedSteps={completedSteps}
          availableUntil={availableUntil}
          onSelect={setStep}
          labels={STEP_LABELS}
        />
        <div style={{ padding: '0.875rem', borderTop: '1px solid var(--color-border-md)', display: 'grid', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={onSuccess}
            style={{ padding: '0.5rem', background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border-md)', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            İptal
          </button>
          {step < 5 && (
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
            {step === 5 ? 'Kaydet' : 'Devam →'}
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
          <Adim5Tedarik
            projectId={projectId}
            result={stepsResult[3]}
            onDone={r => handleStepDone(3, r)}
            onBack={goBack}
          />
        )}
        {step === 4 && (
          <Adim6Butce
            projectId={projectId}
            result={stepsResult[4]}
            onDone={r => handleStepDone(4, r)}
            onBack={goBack}
          />
        )}
        {step === 5 && (
          <Adim8Tamamlandi
            stepsResult={stepsResult}
            projectType={stepsResult[1]?.project_type ?? null}
            steps={SUMMARY_STEPS}
            onBack={goBack}
            onSuccess={onSuccess}
            onViewProject={onViewProject}
          />
        )}
      </div>
    </div>
  )
}

