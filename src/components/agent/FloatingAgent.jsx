import { useState, useEffect } from 'react'
import AgentChat from './AgentChat'
import { getTabConfig, getAgentById } from './agentConfig'

export default function FloatingAgent({ activeTab, projectId, selectedDate }) {
  const [open,        setOpen]        = useState(false)
  const [agentColor,  setAgentColor]  = useState('#185FA5')
  const [agentIcon,   setAgentIcon]   = useState('🤖')

  useEffect(() => {
    const config = getTabConfig(activeTab)
    const agent  = getAgentById(config.default)
    if (agent) {
      setAgentColor(agent.color)
      setAgentIcon(agent.icon)
    }
  }, [activeTab])

  return (
    <>
      {/* Floating buton */}
      <button
        onClick={() => setOpen(o => !o)}
        title={open ? 'Kapat' : 'AI Asistan'}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 300,
          width: 52, height: 52, borderRadius: '50%',
          background: open ? '#374151' : agentColor,
          border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: open ? 22 : 24, color: '#fff',
          transition: 'all 0.2s ease',
          transform: open ? 'rotate(0deg)' : 'rotate(0deg)',
        }}
      >
        {open ? '×' : agentIcon}
      </button>

      {/* Chat penceresi */}
      {open && (
        <AgentChat
          activeTab={activeTab}
          onClose={() => setOpen(false)}
          projectId={projectId}
          selectedDate={selectedDate}
        />
      )}
    </>
  )
}
