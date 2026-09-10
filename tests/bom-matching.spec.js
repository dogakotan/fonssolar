import { test, expect } from '@playwright/test'
import { nameSimilarity, suggestBomMatches } from '../src/utils/satinAlma.js'

// "Malzeme eşleştirme önerisi" (07.09.2026) hiç test kapsamında değildi.
// nameSimilarity/suggestBomMatches saf JS fonksiyonları (yan etkisi yok, DB'ye
// bağlı değil) — bu proje bir unit-test çatısı (vitest/jest) kullanmıyor, ama
// Playwright'ın test() fonksiyonu `page` fixture'ı olmadan düz Node'da
// çalıştığından burada gerçek bir unit test gibi kullanılabiliyor.
//
// İlk sürümün gerçek regresyonu: saf tüm-string Levenshtein oranı, kısa/kolokyal
// talep adı ("TTR kablo") ile uzun/teknik BOM adı ("3x2,5mm2 TTR Kablo Kamera
// Panosu ve Kamera Direği arası") arasındaki uzunluk farkını doğrudan skora
// yediriyordu (%16), eşiği (%55) hiç geçemiyordu — CLAUDE.md'de canlı proje
// verisiyle doğrulanmış, tokenSetSimilarity ile düzeltilmiş (%100) gerçek bir
// vaka. Bu dosya tam olarak bu iki gerçek çifti regresyon guard'ı olarak kullanır.
test.describe('nameSimilarity / suggestBomMatches', () => {
  test('kısa/kolokyal talep adı ile uzun/teknik BOM adı eşleşir (dokümante edilen fix vakası)', () => {
    const score = nameSimilarity('TTR kablo', '3x2,5mm2 TTR Kablo Kamera Panosu ve Kamera Direği arası')
    expect(score).toBeGreaterThanOrEqual(0.55)
  })

  test('ikinci dokümante edilen fix vakası da eşiği geçer', () => {
    const score = nameSimilarity('DC Solar Kablo Seti', 'DC Kablo 4mm2 (75.000 mt)')
    expect(score).toBeGreaterThanOrEqual(0.55)
  })

  test('ilgisiz malzeme adları eşiğin altında kalır (yanlış-pozitif olmamalı)', () => {
    const score = nameSimilarity('TTR kablo', 'Kum Torbası 50kg')
    expect(score).toBeLessThan(0.55)
  })

  test('aynı ad tam eşleşme verir', () => {
    expect(nameSimilarity('Panel Montaj Cıvatası', 'Panel Montaj Cıvatası')).toBeCloseTo(1, 5)
  })

  const baseMaterial = { id: 'mat-1', equipment: '3x2,5mm2 TTR Kablo Kamera Panosu ve Kamera Direği arası', unit: 'm' }
  const baseRequest = {
    id: 'req-1', status: 'onaylandi', category: 'malzeme', request_no: 'SAT-2026-999', title: 'TTR kablo talebi',
    items: [{ id: 'item-1', bom_item_id: null, name: 'TTR kablo', quantity: '50', unit: 'm' }],
  }

  test('eşik üstü aday tek öneri olarak döner', () => {
    const suggestions = suggestBomMatches([baseRequest], [baseMaterial])
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({ itemId: 'item-1', requestId: 'req-1', candidateId: 'mat-1' })
  })

  test('bom_item_id zaten doluysa öneri üretilmez', () => {
    const linked = { ...baseRequest, items: [{ ...baseRequest.items[0], bom_item_id: 'already-linked' }] }
    expect(suggestBomMatches([linked], [baseMaterial])).toHaveLength(0)
  })

  test('kategori malzeme değilse (hizmet/diğer) öneri üretilmez', () => {
    const service = { ...baseRequest, category: 'hizmet' }
    expect(suggestBomMatches([service], [baseMaterial])).toHaveLength(0)
  })

  test('reddedilen/iptal talepler için öneri üretilmez', () => {
    const rejected = { ...baseRequest, status: 'reddedildi' }
    const cancelled = { ...baseRequest, status: 'iptal' }
    expect(suggestBomMatches([rejected], [baseMaterial])).toHaveLength(0)
    expect(suggestBomMatches([cancelled], [baseMaterial])).toHaveLength(0)
  })

  test('eşik altı aday için hiç öneri üretilmez', () => {
    const unrelated = { ...baseRequest, items: [{ ...baseRequest.items[0], name: 'Kum Torbası 50kg' }] }
    expect(suggestBomMatches([unrelated], [baseMaterial])).toHaveLength(0)
  })
})
