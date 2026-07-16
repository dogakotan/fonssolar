import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import TicketStats  from '../../../components/tickets/TicketStats'
import TicketListesi from '../../../components/tickets/TicketListesi'

export default function TabTickets({ openTicketId, onOpenedTicket } = {}) {
  const { isAdmin } = useAuth()
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = () => setRefreshKey(k => k + 1)
  const [projectFilter, setProjectFilter] = useState('')
  const [projects, setProjects] = useState([])

  useEffect(() => {
    if (!isAdmin) return
    supabase.from('projects').select('id, name').then(({ data }) => setProjects(data || []))
  }, [])

  return (
    <div>
      {isAdmin && (
        <select
          value={projectFilter}
          onChange={e => setProjectFilter(e.target.value)}
          style={{ marginBottom: 16, border: '1px solid #E5E7EB', borderRadius: 8,
            padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', color: '#374151' }}
        >
          <option value="">Tüm Projeler</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      <TicketStats refreshKey={refreshKey} />
      <TicketListesi
        onNewTicket={refresh}
        refreshKey={refreshKey}
        projectId={projectFilter || undefined}
        openTicketId={openTicketId}
        onOpenedTicket={onOpenedTicket}
      />
    </div>
  )
}
