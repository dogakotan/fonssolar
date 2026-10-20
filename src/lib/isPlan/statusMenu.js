// Detaylı İş Planı'ndaki kilometre taşı (target_qty'siz) görev durum menüsü: hangi seçenekler, salt okunur mu.
// DB kuralıyla aynı (130100 eki, fn_project_tasks_site_chief_guard): şantiye şefi görevi iptal edemez ve
// iptal edilmiş görevin durumunu değiştiremez; admin ve proje yöneticisi serbest. Menü yalnızca kolaylık,
// asıl koruma DB'de.

export const MILESTONE_STATUS_OPTIONS = [
  { v: 'beklemede', l: 'Beklemede' },
  { v: 'devam_ediyor', l: 'Devam Ediyor' },
  { v: 'tamamlandi', l: 'Tamamlandı' },
  { v: 'askida', l: 'Askıda' },
  { v: 'iptal', l: 'İptal' },
]

export const SITE_CHIEF_CANCELLED_REASON =
  'Bu iş kalemi iptal edilmiş. Yeniden açılması için proje yöneticisine veya admin\'e başvurun.'

// → { options, readOnly, reason }
export function milestoneStatusMenu(role, status) {
  if (role !== 'santiye_sefi') {
    return { options: MILESTONE_STATUS_OPTIONS, readOnly: false, reason: '' }
  }
  if (status === 'iptal') {
    // Mevcut değer görünsün diye İptal seçeneği listede kalır; menü kilitli.
    return {
      options: MILESTONE_STATUS_OPTIONS.filter(opt => opt.v === 'iptal'),
      readOnly: true,
      reason: SITE_CHIEF_CANCELLED_REASON,
    }
  }
  return { options: MILESTONE_STATUS_OPTIONS.filter(opt => opt.v !== 'iptal'), readOnly: false, reason: '' }
}
