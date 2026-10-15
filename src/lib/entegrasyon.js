// YALNIZCA local/entegrasyon dalı. Asıl dallarda bu dosya yok.
// Entegrasyon sunucusu canlı veritabanına bağlı; faz-a'nın Adım 5 yazma işlemleri canlıda
// olmayan RPC'lere (save_project_tasks, set_tasks_classification, assign_activity_ids,
// admin_correct_task_activity_id, import_wbs_areas, save_area_wbs_links) dayanıyor.
// Sunucu VITE_ENTEGRASYON_6AB_YOK=true ile başlatılınca bu düğmeler gri ve tıklanamaz olur.
export const ENTEGRASYON_6AB_YOK = import.meta.env.VITE_ENTEGRASYON_6AB_YOK === 'true'
export const ENTEGRASYON_6AB_MESAJ = '6a/6b canlıya uygulanmadı'

// Düğmeye yayılacak özellikler: disabled + tooltip + gri görünüm. Bayrak kapalıysa boş.
export function entegrasyonKilidi(style = {}) {
  if (!ENTEGRASYON_6AB_YOK) return {}
  return {
    disabled: true,
    title: ENTEGRASYON_6AB_MESAJ,
    'data-entegrasyon-kilit': 'true',
    style: { ...style, opacity: 0.45, cursor: 'not-allowed', filter: 'grayscale(1)' },
  }
}
