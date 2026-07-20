// Yatay onay süreci göstergesi — dikey stepper'ların (ör. TalepDetayModal.jsx'in
// "Onay Süreci" kartı) kompakt bir listede (ör. bildirim satırı) sığacak yatay hali.
// `steps`: [{ key, label, done, active, rejected }]
export default function ApprovalStepsHorizontal({ steps }) {
  if (!steps?.length) return null
  function stateOf(step) {
    if (step.rejected) return 'rejected'
    if (step.done) return 'done'
    if (step.active) return 'active'
    return 'pending'
  }
  return (
    <div className="approval-steps-h" style={{ '--approval-steps-count': steps.length }}>
      <div className="approval-steps-h-track">
        {steps.map((step, i) => (
          <div
            key={step.key || i}
            className={`approval-steps-h-dotcol${i === 0 ? ' first' : ''}${i === steps.length - 1 ? ' last' : ''}`}
          >
            <span className={`approval-steps-h-dot ${stateOf(step)}`} />
          </div>
        ))}
      </div>
      <div className="approval-steps-h-labels">
        {steps.map((step, i) => (
          <span key={step.key || i} className={`approval-steps-h-label ${stateOf(step)}`}>{step.label}</span>
        ))}
      </div>
    </div>
  )
}
