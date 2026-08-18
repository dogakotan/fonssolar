import { useEffect, useRef, useState } from 'react'
import WizardStepper            from './WizardStepper'
import Adim1ProjeBilgileri      from './Adim1ProjeBilgileri'
import Adim2IsKalemleri         from './Adim2IsKalemleri'
import Adim3KategoriAgirliklari from './Adim3KategoriAgirliklari'
import Adim5Tedarik             from './Adim5Tedarik'
import Adim6Butce               from './Adim6Butce'
import Adim8Tamamlandi          from './Adim8Tamamlandi'
import { projectWizardDraftKey, loadProjectWizardDraft, saveProjectWizardDraft, clearProjectWizardDraft } from '../../../utils/projectWizardDraft'

// Riskler adımı burada YOK — yeni oluşturulan bir projede henüz görev/satın alma
// verisi olmadığı için ne otomatik risk motoru bir şey üretebilir ne de manuel risk
// girişi anlamlı olur. Risk girişi yalnızca proje düzenleme akışında (ProjeEditWizard.jsx)
// var — bkz. CLAUDE.md "Kritik yol ve otomatik risk motoru".
const STEP_LABELS = ['Proje Bilgileri', 'İş Kalemleri', 'Kategori Ağırlıkları', 'Tedarik', 'Bütçe', 'Tamamlandı']
// Adim8Tamamlandi.jsx'in varsayılan STEPS'i (Riskler dahil 6 adımlık) burada
// geçerli değil — kendi 6 adımlık numaralandırmamızı geçiyoruz.
const SUMMARY_STEPS = [
  { step: 2, table: 'project_tasks',     label: 'İş Kalemleri' },
  { step: 3, rpc: 'save_project_category_weights', label: 'Kategori Ağırlıkları' },
  { step: 4, rpc: 'set_project_procurement_completed', label: 'Tedarik ve Teslimat' },
  { step: 5, table: 'budget_lines',      label: 'Bütçe' },
]

const DRAFT_KEY = projectWizardDraftKey('new', null)

export default function YeniProjeWizard({ onSuccess, onViewProject }) {
  const initialDraft = useRef(loadProjectWizardDraft(DRAFT_KEY)).current
  const [step,        setStep]        = useState(initialDraft?.step ?? 1)
  const [stepsResult, setStepsResult] = useState(initialDraft?.stepsResult ?? {})
  const [draftNotice, setDraftNotice] = useState(!!initialDraft)
  const actionRef = useRef('next')

  const projectId = stepsResult[1]?.id ?? null
  const completedSteps = Object.keys(stepsResult).map(Number)
  const availableUntil = projectId ? 6 : 1

  useEffect(() => {
    saveProjectWizardDraft(DRAFT_KEY, { step, stepsResult })
  }, [step, stepsResult])

  const goBack = () => setStep(s => s - 1)

  function handleStepDone(stepNo, result) {
    setStepsResult(r => ({ ...r, [stepNo]: result }))
    if (actionRef.current === 'save') {
      setStep(6)
    } else if (actionRef.current === 'next') {
      setStep(current => Math.min(6, Math.max(current + 1, stepNo + 1)))
    }
  }

  function setStepDraft(stepNo, draft) {
    setStepsResult(r => ({ ...r, [stepNo]: draft }))
  }

  function submitCurrentStep(action = 'next') {
    actionRef.current = action
    if (step === 1) document.querySelector('[data-wizard-form="project"]')?.requestSubmit()
    else if (step < 6) document.querySelector('[data-wizard-submit="next"]')?.click()
    else document.querySelector('[data-wizard-submit="save"]')?.click()
  }

  function discardDraft() {
    clearProjectWizardDraft(DRAFT_KEY)
    setStepsResult({})
    setStep(1)
    setDraftNotice(false)
  }

  function handleCancel() {
    clearProjectWizardDraft(DRAFT_KEY)
    onSuccess()
  }

  function handleFinish() {
    clearProjectWizardDraft(DRAFT_KEY)
    onSuccess()
  }

  function handleViewProject(id, name) {
    clearProjectWizardDraft(DRAFT_KEY)
    onViewProject(id, name)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {draftNotice && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.9rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 'var(--radius-md)', fontSize: 12.5, color: '#92400e' }}>
          <span>📝 Kaydedilmemiş bir taslak bulundu, devam ediliyor.</span>
          <button type="button" onClick={discardDraft} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#92400e', fontWeight: 700, fontSize: 12, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
            Taslağı Sil ve Baştan Başla
          </button>
        </div>
      )}
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
            onClick={handleCancel}
            style={{ padding: '0.5rem', background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border-md)', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            İptal
          </button>
          {step < 6 && (
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
            {step === 6 ? 'Kaydet' : 'Devam →'}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {step === 1 && (
          <Adim1ProjeBilgileri
            result={stepsResult[1]}
            onDone={r => handleStepDone(1, r)}
            onCancel={handleCancel}
            onDraftChange={r => setStepDraft(1, r)}
          />
        )}
        {step === 2 && (
          <Adim2IsKalemleri
            projectId={projectId}
            result={stepsResult[2]}
            onDone={r => handleStepDone(2, r)}
            onBack={goBack}
            onDraftChange={r => setStepDraft(2, r)}
          />
        )}
        {step === 3 && (
          <Adim3KategoriAgirliklari
            projectId={projectId}
            taskRows={stepsResult[2]?.rows}
            result={stepsResult[3]}
            onDone={r => handleStepDone(3, r)}
            onBack={goBack}
            onDraftChange={r => setStepDraft(3, r)}
          />
        )}
        {step === 4 && (
          <Adim5Tedarik
            projectId={projectId}
            result={stepsResult[4]}
            onDone={r => handleStepDone(4, r)}
            onBack={goBack}
            onDraftChange={r => setStepDraft(4, r)}
          />
        )}
        {step === 5 && (
          <Adim6Butce
            projectId={projectId}
            result={stepsResult[5]}
            onDone={r => handleStepDone(5, r)}
            onBack={goBack}
            onDraftChange={r => setStepDraft(5, r)}
          />
        )}
        {step === 6 && (
          <Adim8Tamamlandi
            stepsResult={stepsResult}
            projectType={stepsResult[1]?.project_type ?? null}
            steps={SUMMARY_STEPS}
            onBack={goBack}
            onSuccess={handleFinish}
            onViewProject={handleViewProject}
          />
        )}
      </div>
      </div>
    </div>
  )
}
