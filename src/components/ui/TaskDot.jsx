export default function TaskDot({ status }) {
  if (status === 'done')
    return (
      <div className="task-dot done-dot">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    )
  if (status === 'active')
    return <div className="task-dot active-dot"><div /></div>
  if (status === 'late')
    return <div className="task-dot late-dot" />
  return <div className="task-dot pending-dot" />
}
