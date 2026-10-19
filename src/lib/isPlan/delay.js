// Gecikme ve sapma (saf). Karar İP-5 (docs/is-plani-kararlar.md): varsayılan referans günü bugündür
// (Europe/Istanbul); her fonksiyon asOf ('YYYY-MM-DD') alır, ekran seçili filtre tarihini verebilir.
import { diffDays, todayKey, toKey } from './dates.js'

const CLOSED = new Set(['tamamlandi', 'iptal'])

export function isClosed(task) {
  return CLOSED.has(task?.status)
}

// Plan bitişi asOf'tan önce ve görev kapanmamışsa gecikmiş. Plan bitişi asOf günü olan görev gecikmiş değil.
export function isTaskLate(task, asOf = todayKey()) {
  const end = toKey(task?.planned_end)
  if (!end || isClosed(task)) return false
  return end < asOf
}

// Sapma (gün): gerçek bitiş varsa gerçek − plan (+ gecikme, − erken). Gerçek bitiş yoksa ve plan bitişi
// geçmişse görev kapanmamışken asOf − plan bitişi. Diğer durumlarda null.
export function computeSapma(task, asOf = todayKey()) {
  const plannedEnd = toKey(task?.planned_end)
  const actualEnd = toKey(task?.actual_end)
  if (actualEnd && plannedEnd) return diffDays(actualEnd, plannedEnd)
  if (plannedEnd && !isClosed(task) && asOf > plannedEnd) return diffDays(asOf, plannedEnd)
  return null
}
