import SantiyeSefiDashboard from '../../../pages/SantiyeSefiDashboard'

export default function TabSantiyeSefi({ onTabChange, onNewReport, onEditReport }) {
  return (
    <SantiyeSefiDashboard
      onTabChange={onTabChange}
      onNewReport={onNewReport}
      onEditReport={onEditReport}
    />
  )
}
