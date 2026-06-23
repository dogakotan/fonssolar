import { useState } from 'react'
import WizardStepper            from './WizardStepper'
import Adim1ProjeBilgileri      from './Adim1ProjeBilgileri'
import Adim2IsKalemleri         from './Adim2IsKalemleri'
import Adim3IlerlemeBilgileri   from './Adim3IlerlemeBilgileri'
import Adim4Riskler             from './Adim4Riskler'
import Adim5Tedarik             from './Adim5Tedarik'
import Adim6Butce               from './Adim6Butce'
import Adim7KritikYol           from './Adim7KritikYol'
import Adim8Tamamlandi          from './Adim8Tamamlandi'

export default function YeniProjeWizard({ onSuccess, onViewProject }) {
  const [step,        setStep]        = useState(1)
  const [stepsResult, setStepsResult] = useState({})

  const projectId = stepsResult[1]?.id ?? null

  const goNext = () => setStep(s => s + 1)
  const goBack = () => setStep(s => s - 1)

  function handleStepDone(stepNo, result) {
    setStepsResult(r => ({ ...r, [stepNo]: result }))
    goNext()
  }

  return (
    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
      <div className="card" style={{ width: 210, flexShrink: 0 }}>
        <WizardStepper current={step} />
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
            onBack={goBack}
            onSuccess={onSuccess}
            onViewProject={onViewProject}
          />
        )}
      </div>
    </div>
  )
}
