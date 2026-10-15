// YALNIZCA local/entegrasyon dalı. Asıl dallarda bu dosya yok.
// Entegrasyon sunucusu canlı veritabanına bağlı; faz-a'nın Adım 5 yazma işlemleri canlıda
// olmayan RPC'lere (save_project_tasks, set_tasks_classification, assign_activity_ids,
// admin_correct_task_activity_id, import_wbs_areas, save_area_wbs_links) dayanıyor.
// Kilit VARSAYILAN OLARAK AÇIK: sunucu nasıl başlatılırsa başlatılsın (betik, elle `npm run dev`,
// bayrak tanımsız) bu düğmeler gri ve tıklanamaz. Yalnızca açıkça VITE_ENTEGRASYON_6AB_YOK=false
// verilirse açılır (ör. 6a/6b canlıya uygulandıktan sonra). Ayrıca klasördeki .env.development.local
// (gitignore) bayrağı true olarak tutar.
export const ENTEGRASYON_6AB_YOK = import.meta.env.VITE_ENTEGRASYON_6AB_YOK !== 'false'
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
