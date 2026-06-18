import { useState } from 'react'
import TicketStats  from '../../../components/tickets/TicketStats'
import TicketListesi from '../../../components/tickets/TicketListesi'

export default function TabTickets() {
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = () => setRefreshKey(k => k + 1)

  return (
    <div>
      <TicketStats refreshKey={refreshKey} />
      <TicketListesi onNewTicket={refresh} refreshKey={refreshKey} />
    </div>
  )
}
