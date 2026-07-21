import { test, expect } from '@playwright/test'
import {
  classifyMaterials,
  classifyRequestTypes,
  materialKey,
  normalizeStatus,
  riskState,
} from '../src/utils/satinAlma.js'

const plan = new Map([[materialKey('DC Kablo'), 100]])

test.describe('Satın alma risk sınıflandırması', () => {
  test('planın altı ve plan kadar talep uygun, planı aşan risklidir', () => {
    expect(riskState([{ name: 'DC Kablo', quantity: 60 }], plan, new Map([[materialKey('DC Kablo'), 60]]), 'malzeme')).toBe('uygun')
    expect(riskState([{ name: 'DC Kablo', quantity: 100 }], plan, new Map([[materialKey('DC Kablo'), 100]]), 'malzeme')).toBe('uygun')
    expect(riskState([{ name: 'DC Kablo', quantity: 101 }], plan, new Map([[materialKey('DC Kablo'), 101]]), 'malzeme')).toBe('riskli')
  })

  test('iki bekleyen talebin toplamı planı aşınca ikisi de riskli sayılır', () => {
    const requests = [
      { category: 'malzeme', items: [{ name: 'DC Kablo', quantity: 60 }] },
      { category: 'malzeme', items: [{ name: 'DC Kablo', quantity: 50 }] },
    ]
    expect(classifyMaterials([{ equipment: 'DC Kablo', planned_qty: 100 }], requests))
      .toEqual({ total: 2, ok: 0, excess: 2, missing: 0 })
  })

  test('listede olmayan malzeme listede_yok, hizmet uygundur', () => {
    expect(riskState([{ name: 'Bilinmeyen' }], plan, new Map(), 'malzeme')).toBe('listede_yok')
    expect(riskState([{ name: 'Montaj' }], plan, new Map(), 'hizmet')).toBe('uygun')
  })

  test('diğer talebin satır rozeti ve KPI sınıfı listede_yok olmalıdır', () => {
    const request = { category: 'diger', items: [{ name: 'Listede olmayan diğer' }] }
    expect(riskState(request.items, plan, new Map(), request.category)).toBe('listede_yok')
    expect(classifyMaterials([{ equipment: 'DC Kablo', planned_qty: 100 }], [request]))
      .toEqual({ total: 1, ok: 0, excess: 0, missing: 1 })
  })

  test('karışık talepte tek bir listede olmayan kalem varsa listede_yok olmalıdır', () => {
    const items = [{ name: 'DC Kablo', quantity: 10 }, { name: 'Bilinmeyen', quantity: 1 }]
    expect(riskState(items, plan, new Map([[materialKey('DC Kablo'), 10]]), 'malzeme')).toBe('listede_yok')
  })

  test('reddedilen ve iptal edilen talepler bekleyen toplamına girmez', () => {
    const rows = [
      { status: 'talep_olusturuldu', items: [{ name: 'DC Kablo', quantity: 60 }] },
      { status: 'reddedildi', items: [{ name: 'DC Kablo', quantity: 90 }] },
      { status: 'iptal', items: [{ name: 'DC Kablo', quantity: 90 }] },
    ]
    const pending = rows.filter(row => normalizeStatus(row.status) === 'bekliyor')
    expect(pending).toHaveLength(1)
    expect(classifyMaterials([{ equipment: 'DC Kablo', planned_qty: 100 }], pending))
      .toEqual({ total: 1, ok: 1, excess: 0, missing: 0 })
  })

  test('talep tipi dağılımı diğer kategorisini sayabilmelidir', () => {
    expect(classifyRequestTypes([
      { category: 'malzeme' }, { category: 'hizmet' }, { category: 'diger' },
    ])).toEqual({ malzeme: 1, hizmet: 1, diger: 1 })
  })
})
