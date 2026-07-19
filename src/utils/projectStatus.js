// projects.status için tek kaynak (DB constraint: projects_status_check).
// badgeClass: TabGenel.jsx'in CSS sınıfı bazlı rozetleri için.
// bg/color: TabProjeler.jsx/TabProjeYonetimi.jsx'in inline-style rozetleri için.
export const PROJECT_STATUS_META = {
  aktif:          { badgeClass: 'green', bg: '#dcfce7', color: '#166534', label: 'Aktif' },
  'tamamlandı':   { badgeClass: 'blue',  bg: '#dbeafe', color: '#1e40af', label: 'Tamamlandı' },
  beklemede:      { badgeClass: 'amber', bg: '#fef9c3', color: '#854d0e', label: 'Beklemede' },
  'iptal edildi': { badgeClass: 'red',   bg: '#fee2e2', color: '#991b1b', label: 'İptal' },
}
