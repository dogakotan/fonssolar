// Proje sihirbazı (Yeni Proje / Düzenle) için tarayıcı-yerel taslak kaydı —
// kullanıcı sihirbaz doluyken başka bir sayfaya/sekmeye geçerse (Proje Yönetimi
// dışına, ya da sihirbaz içinde bir adımdan diğerine WizardStepper üzerinden)
// girilen veriler kaybolmasın diye. DB'ye hiç yazılmaz, yalnızca bu tarayıcıda
// localStorage'da tutulur — daily_report_drafts'ın DB-bazlı taslak deseninden
// kasıtlı olarak farklı (burada cross-device/cross-session kalıcılığa gerek yok,
// tek oturumda sekme değiştirmeyi hayatta tutmak yeterli).
const PREFIX = 'ges-project-wizard-draft'

export function projectWizardDraftKey(mode, projectId) {
  return mode === 'edit' ? `${PREFIX}:edit:${projectId}` : `${PREFIX}:new`
}

export function loadProjectWizardDraft(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function saveProjectWizardDraft(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...data, savedAt: new Date().toISOString() }))
  } catch {
    // localStorage kapalı/dolu olabilir — taslak sessizce kaydedilmez, akışı bozmaz
  }
}

export function clearProjectWizardDraft(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    // yoksay
  }
}
