import { useState, useEffect } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { getProjects } from '../../../api'
import TicketListesi from '../../../components/tickets/TicketListesi'

export default function TabTickets({ openTicketId, onOpenedTicket } = {}) {
  const { isAdmin, role } = useAuth()
  // proje_yoneticisi de cross_project (admin gibi tüm erişilebilir projeleri görebiliyor) —
  // 2026-07-21'de proje filtresi bu role da açıldı.
  const canFilterByProject = isAdmin || role === 'proje_yoneticisi'
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = () => setRefreshKey(k => k + 1)
  const [projectFilter, setProjectFilter] = useState('')
  const [projects, setProjects] = useState([])

  useEffect(() => {
    if (!canFilterByProject) return
    // getProjects() cross_project rollerde projects tablosunun eksik RLS kapsamını
    // get_my_projects() ile tamamlıyor — raw .from('projects') proje_yoneticisi için
    // eksik liste dönerdi.
    getProjects().then(({ data }) => setProjects(data || []))
  }, [canFilterByProject])

  return (
    <div>
      {canFilterByProject && (
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
