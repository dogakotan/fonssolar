/**
 * AgentPanel.jsx — GES Proje Yönetim Sistemi AI Agent Paneli
 *
 * Supabase tablosu (bir kez çalıştırın):
 *   CREATE TABLE agent_reports (
 *     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     project_id text NOT NULL,
 *     agent_role text NOT NULL,
 *     input_data jsonb,
 *     report_text text,
 *     risk_level text CHECK (risk_level IN ('düşük','orta','yüksek')),
 *     created_at timestamptz DEFAULT now()
 *   );
 *
 * .env dosyasına ekleyin:
 *   VITE_ANTHROPIC_API_KEY=sk-ant-...
 */

import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ── Agent rolleri ──────────────────────────────────────────────────────────
const AGENT_CONFIGS = {
  santiye_sefi: {
    label: 'Şantiye Şefi',
    color: '#0f6e56',
    bg: '#e1f5ee',
    icon: '🏗️',
    rapor_turu: 'Günlük Vardiya Raporu',
    sistem_promptu: `Sen bir GES (Güneş Enerji Santrali) projesinin Şantiye Şefi'sin.
Görevlerin: günlük saha operasyonu, iş güvenliği denetimi, ekip yönetimi ve kalite kontrol.
Sana verilen saha verilerini analiz et ve aşağıdaki başlıkları içeren kısa bir günlük vardiya raporu yaz:
1. Bugünkü genel durum (1-2 cümle)
2. Tamamlanan işler
3. Devam eden işler ve yüzde tamamlanma
4. Tespit edilen sorunlar / riskler
5. Yarın için öncelikler
Risk seviyesini belirle: düşük / orta / yüksek
Son satıra şunu yaz: RİSK_SEVİYESİ: [düşük|orta|yüksek]
Yanıtın Türkçe olsun, profesyonel ama sade bir dil kullan.`,
  },

  elektrik_sefi: {
    label: 'Elektrik Şefi',
    color: '#185fa5',
    bg: '#e6f1fb',
    icon: '⚡',
    rapor_turu: 'Günlük Elektrik İmalat Raporu',
    sistem_promptu: `Sen bir GES projesinin Elektrik Şefi'sin.
Görevlerin: DC/AC/OG kablo döşeme, inverter kurulumu, trafo ve köşk elektrik işlerinin koordinasyonu.
Verilen verilere göre kısa bir elektrik imalat raporu hazırla:
1. Bugünkü elektrik imalat özeti
2. Kablo döşeme ilerlemesi (metre veya %)
3. İnverter ve trafo durumu
4. Teknik sorunlar / bekleyen malzeme
5. Güvenlik ihlali var mı?
Son satıra: RİSK_SEVİYESİ: [düşük|orta|yüksek]
Türkçe, teknik ama anlaşılır yaz.`,
  },

  mekanik_sef: {
    label: 'Mekanik Şef',
    color: '#854f0b',
    bg: '#faeeda',
    icon: '🔩',
    rapor_turu: 'Günlük İmalat Raporu',
    sistem_promptu: `Sen bir GES projesinin Mekanik Şefi'sin.
Görevlerin: kazık/çelik yapı kurulumu, delgi-çakım makinelerinin yönetimi ve panel montajı.
Verilen verilere göre günlük imalat raporu hazırla:
1. Bugün kurulan kazık/çelik yapı miktarı
2. Panel montaj ilerlemesi
3. Makine ve ekipman durumu
4. Hava/zemin koşulları etkisi
5. Kritik beklemeler veya gecikmeler
Son satıra: RİSK_SEVİYESİ: [düşük|orta|yüksek]
Türkçe, mühendislik diliyle yaz.`,
  },

  isg_sorumlusu: {
    label: 'İSG Sorumlusu',
    color: '#a32d2d',
    bg: '#fcebeb',
    icon: '🦺',
    rapor_turu: 'Günlük Güvenlik Turu Raporu',
    sistem_promptu: `Sen bir GES projesinin İSG (İş Sağlığı Güvenliği) Sorumlusu'sun.
Görevlerin: iş güvenliği denetimi, KKD kontrolü, kaza raporu yönetimi ve güvenlik eğitimleri.
Verilen verilere göre günlük güvenlik turu raporu hazırla:
1. Bugünkü KKD uyum oranı
2. Tespit edilen güvensiz davranışlar veya durumlar
3. Kaza/ramak kala olayı var mı?
4. Alınan önlemler
5. Yarın için güvenlik odak noktaları
Son satıra: RİSK_SEVİYESİ: [düşük|orta|yüksek]
Türkçe, net ve uyarı odaklı yaz.`,
  },

  proje_koordinatoru: {
    label: 'Proje Koordinatörü',
    color: '#534ab7',
    bg: '#eeedfe',
    icon: '📋',
    rapor_turu: 'Haftalık Durum Raporu',
    sistem_promptu: `Sen bir GES projesinin Proje Koordinatörü'sün.
Görevlerin: genel proje koordinasyonu, paydaş yönetimi, TEİAŞ-EPDK koordinasyonu ve raporlama.
Tüm ekiplerden gelen verileri sentezleyerek haftalık durum raporu hazırla:
1. Proje genel ilerleme yüzdesi ve plana göre durumu
2. Bu haftanın kritik tamamlanan işleri
3. Kritik gecikmeler ve etkileri
4. TEİAŞ/EPDK/izin süreçlerinde durum
5. Gelecek hafta kritik kilometre taşları
6. Yönetici özeti (2-3 cümle, karar gerektiren konular dahil)
Son satıra: RİSK_SEVİYESİ: [düşük|orta|yüksek]
Türkçe, yöneticiye sunulabilecek profesyonel bir dil kullan.`,
  },

  maliyet_kontrolcu: {
    label: 'Maliyet Kontrolcü',
    color: '#3b6d11',
    bg: '#eaf3de',
    icon: '💰',
    rapor_turu: 'Aylık Maliyet Raporu',
    sistem_promptu: `Sen bir GES projesinin Maliyet Kontrolcüsü'sün.
Görevlerin: bütçe takibi, hakediş hazırlama ve maliyet sapma analizi.
Verilen finansal verilere göre aylık maliyet analizi hazırla:
1. Bütçe vs. harcama özeti (planlanan / gerçekleşen / sapma)
2. En büyük maliyet sapması olan kalemler
3. Hakediş durumu
4. Nakit akış projeksiyonu
5. Tasarruf önerileri veya bütçe uyarısı
Son satıra: RİSK_SEVİYESİ: [düşük|orta|yüksek]
Türkçe, sayısal ve analitik bir dil kullan.`,
  },

  lojistik: {
    label: 'Lojistik & Tedarik',
    color: '#5f5e5a',
    bg: '#f1efe8',
    icon: '🚛',
    rapor_turu: 'Haftalık Tedarik Durumu',
    sistem_promptu: `Sen bir GES projesinin Lojistik & Tedarik Sorumlusu'sun.
Görevlerin: malzeme tedariki, depo yönetimi, nakliye planlaması ve stok takibi.
Verilen lojistik verilere göre haftalık tedarik durum raporu hazırla:
1. Kritik malzemelerin sahaya ulaşma durumu
2. Geciken veya eksik malzemeler
3. Depo stok özeti
4. Gelecek hafta beklenen sevkiyatlar
5. Kritik tedarik riski olan kalemler
Son satıra: RİSK_SEVİYESİ: [düşük|orta|yüksek]
Türkçe, operasyonel ve pratik bir dil kullan.`,
  },

  orchestrator: {
    label: 'Orchestrator — Genel Özet',
    color: '#1a1a2e',
    bg: '#f0f0fa',
    icon: '🎯',
    rapor_turu: 'Proje Genel İçgörü Raporu',
    sistem_promptu: `Sen bir GES projesinin üst düzey Proje Yönetim Danışmanısın.
Sana birden fazla ekip liderinin raporları verilecek. Bu raporları bütünleştirerek proje sahibine sunulacak kısa bir icra özeti hazırla:
1. Projenin genel sağlık durumu (iyi / dikkat / kritik)
2. En kritik 3 risk veya sorun
3. Bu hafta mutlaka yapılması gereken 3 aksiyon
4. Olumlu gelişmeler
5. Yönetici için tek paragraflık özet
Yanıtın karar vericiyi bilgilendirmeye odaklanmalı, gereksiz teknik detaylardan kaçın.
Son satıra: RİSK_SEVİYESİ: [düşük|orta|yüksek]
Türkçe, C-level yöneticiye hitap eder tonda yaz.`,
  },
}

// ── Claude API ──────────────────────────────────────────────────────────────
async function claudeAnaliz(sistemPrompt, kullaniciMesaji) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY .env dosyasında tanımlı değil.')

  const response = await fetch('/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: sistemPrompt,
      messages: [{ role: 'user', content: kullaniciMesaji }],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `API hatası: ${response.status}`)
  }

  const data = await response.json()
  return data.content[0]?.text || ''
}

// ── Yardımcı fonksiyonlar ──────────────────────────────────────────────────
function riskRengi(seviye) {
  if (!seviye) return { bg: '#f1f5f9', text: '#64748b', label: 'Belirsiz' }
  const s = seviye.toLowerCase()
  if (s === 'kritik') return { bg: '#fce7f3', text: '#9d174d', label: 'Kritik Risk' }
  if (s === 'yüksek') return { bg: '#fee2e2', text: '#dc2626', label: 'Yüksek Risk' }
  if (s === 'orta')   return { bg: '#fef9c3', text: '#ca8a04', label: 'Orta Risk' }
  return                     { bg: '#dcfce7', text: '#16a34a', label: 'Düşük Risk' }
}

function riskCikar(metin) {
  if (!metin) return null
  const esles = metin.match(/R[İI]SK_SEV[İI]YES[İI]:\s*(d[üu][şs][üu]k|orta|y[üu]ksek|kritik)/i)
  return esles ? esles[1].toLowerCase() : null
}

function raporTemizle(metin) {
  return metin.replace(/\nR[İI]SK_SEV[İI]YES[İI]:.*$/im, '').trim()
}

// ── AgentKarti ─────────────────────────────────────────────────────────────
function AgentKarti({ roleKey, config, projectId }) {
  const [girdi, setGirdi]           = useState('')
  const [rapor, setRapor]           = useState(null)
  const [risk, setRisk]             = useState(null)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata]             = useState(null)
  const [acik, setAcik]             = useState(false)

  const raporOlustur = useCallback(async () => {
    if (!girdi.trim()) return
    setYukleniyor(true)
    setHata(null)
    try {
      const mesaj  = `Proje: ${projectId}\n\nSaha / Operasyon Verileri:\n${girdi}`
      const sonuc  = await claudeAnaliz(config.sistem_promptu, mesaj)
      const riskSeviye = riskCikar(sonuc)
      const temiz  = raporTemizle(sonuc)

      setRapor(temiz)
      setRisk(riskSeviye)

      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('agent_reports').insert({
        project_id: projectId,
        agent_role: roleKey,
        input_data: { veri: girdi },
        report_text: temiz,
        risk_level: riskSeviye,
        created_by: user?.id,
      })
    } catch (e) {
      setHata(e.message)
    } finally {
      setYukleniyor(false)
    }
  }, [girdi, config, projectId, roleKey])

  const renk = riskRengi(risk)

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 10, background: '#fff' }}>
      {/* Başlık butonu */}
      <button
        onClick={() => setAcik(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: acik ? config.bg : '#fff', border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s' }}
      >
        <span style={{ fontSize: 20 }}>{config.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>{config.label}</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{config.rapor_turu}</div>
        </div>
        {risk && (
          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: renk.bg, color: renk.text }}>
            {renk.label}
          </span>
        )}
        <span style={{ color: '#9ca3af', fontSize: 11 }}>{acik ? '▲' : '▼'}</span>
      </button>

      {/* İçerik */}
      {acik && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid #f3f4f6' }}>
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
              Bugünkü saha / operasyon verilerini girin:
            </label>
            <textarea
              value={girdi}
              onChange={e => setGirdi(e.target.value)}
              placeholder={`Örnek:\n- Panel montajı: 45 adet tamamlandı\n- Kablo döşeme: Blok 3, %60\n- Sorun: Vinç arızası 2 saat durdurdu`}
              rows={5}
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, color: '#111827', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            />
          </div>

          <button
            onClick={raporOlustur}
            disabled={yukleniyor || !girdi.trim()}
            style={{ marginTop: 10, padding: '9px 20px', background: yukleniyor || !girdi.trim() ? '#e5e7eb' : config.color, color: yukleniyor || !girdi.trim() ? '#9ca3af' : '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: yukleniyor || !girdi.trim() ? 'not-allowed' : 'pointer', transition: 'background 0.15s' }}
          >
            {yukleniyor ? '⏳ Analiz ediliyor...' : '🤖 Agent Raporu Oluştur'}
          </button>

          {hata && (
            <div style={{ marginTop: 10, padding: '10px 12px', background: '#fee2e2', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>
              ⚠️ {hata}
            </div>
          )}

          {rapor && (
            <div style={{ marginTop: 14, padding: '14px 16px', background: '#f9fafb', borderRadius: 10, borderLeft: `4px solid ${config.color}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: config.color, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {config.rapor_turu} — Agent Çıktısı
              </div>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#111827', lineHeight: 1.7, fontFamily: 'inherit', margin: 0 }}>
                {rapor}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── OrchestratorPanel ──────────────────────────────────────────────────────
function OrchestratorPanel({ projectId }) {
  const [ozet, setOzet]             = useState(null)
  const [risk, setRisk]             = useState(null)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata]             = useState(null)

  const ozetOlustur = async () => {
    setYukleniyor(true)
    setHata(null)
    try {
      const { data, error } = await supabase
        .from('agent_reports')
        .select('agent_role, report_text, risk_level, created_at')
        .eq('project_id', projectId)
        .neq('agent_role', 'orchestrator')
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw new Error(error.message)
      if (!data?.length) throw new Error('Henüz kayıtlı rapor yok. Önce en az bir agent raporu oluşturun.')

      // Her rolün en güncel raporunu al
      const rolBazliSon = {}
      data.forEach(r => { if (!rolBazliSon[r.agent_role]) rolBazliSon[r.agent_role] = r })

      const birlesmis = Object.entries(rolBazliSon)
        .map(([rol, r]) => {
          const cfg = AGENT_CONFIGS[rol]
          return `## ${cfg?.label || rol}\nRisk: ${r.risk_level || 'belirsiz'}\n${r.report_text}`
        })
        .join('\n\n---\n\n')

      const mesaj = `Proje ID: ${projectId}\n\nEkip Raporları:\n\n${birlesmis}`
      const sonuc = await claudeAnaliz(AGENT_CONFIGS.orchestrator.sistem_promptu, mesaj)
      const riskSeviye = riskCikar(sonuc)

      setOzet(raporTemizle(sonuc))
      setRisk(riskSeviye)

      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('agent_reports').insert({
        project_id: projectId,
        agent_role: 'orchestrator',
        input_data: { kaynak_rapor_sayisi: Object.keys(rolBazliSon).length },
        report_text: raporTemizle(sonuc),
        risk_level: riskSeviye,
        created_by: user?.id,
      })
    } catch (e) {
      setHata(e.message)
    } finally {
      setYukleniyor(false)
    }
  }

  const renk   = riskRengi(risk)
  const config = AGENT_CONFIGS.orchestrator

  return (
    <div style={{ border: `2px solid ${config.color}`, borderRadius: 12, overflow: 'hidden', marginBottom: 14, background: config.bg }}>
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 22 }}>{config.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: config.color }}>{config.label}</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
            Tüm ekip raporlarını Supabase'den çekip tek yönetici özeti üretir
          </div>
        </div>
        {risk && (
          <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: renk.bg, color: renk.text, border: `1px solid ${renk.text}40` }}>
            {renk.label}
          </span>
        )}
      </div>

      <div style={{ padding: '0 16px 16px' }}>
        <button
          onClick={ozetOlustur}
          disabled={yukleniyor}
          style={{ padding: '10px 24px', background: yukleniyor ? '#9ca3af' : config.color, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: yukleniyor ? 'not-allowed' : 'pointer' }}
        >
          {yukleniyor ? '⏳ Raporlar sentezleniyor...' : '🎯 Genel Proje Özeti Oluştur'}
        </button>

        {hata && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: '#fee2e2', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>
            ⚠️ {hata}
          </div>
        )}

        {ozet && (
          <div style={{ marginTop: 14, padding: '16px 18px', background: '#fff', borderRadius: 10, borderLeft: `5px solid ${config.color}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: config.color, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Orchestrator — İcra Özeti
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#111827', lineHeight: 1.8, fontFamily: 'inherit', margin: 0 }}>
              {ozet}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Ana bileşen ────────────────────────────────────────────────────────────
export default function AgentPanel({ projectId = 'kaptan-adana', projectName = 'Kaptan Adana GES' }) {
  const [aktifSekme, setAktifSekme] = useState('saha')

  const sekmeler = [
    { key: 'saha',    label: 'Saha & İnşaat',    roller: ['santiye_sefi', 'mekanik_sef', 'isg_sorumlusu'] },
    { key: 'teknik',  label: 'Teknik & Elektrik', roller: ['elektrik_sefi'] },
    { key: 'yonetim', label: 'Yönetim',           roller: ['proje_koordinatoru', 'maliyet_kontrolcu', 'lojistik'] },
  ]

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>🤖 AI Agent Paneli</h2>
        <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
          {projectName} — saha verisi girin, her rol için AI raporu alın
        </p>
      </div>

      {/* Orchestrator her zaman üstte */}
      <OrchestratorPanel projectId={projectId} />

      {/* Sekmeler */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid #e5e7eb' }}>
        {sekmeler.map(s => (
          <button
            key={s.key}
            onClick={() => setAktifSekme(s.key)}
            style={{ padding: '8px 16px', border: 'none', borderBottom: aktifSekme === s.key ? '2px solid #003B8E' : '2px solid transparent', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: aktifSekme === s.key ? 600 : 400, color: aktifSekme === s.key ? '#003B8E' : '#6b7280', transition: 'all 0.15s', marginBottom: -1 }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Agent kartları */}
      {sekmeler
        .find(s => s.key === aktifSekme)
        ?.roller.map(roleKey => (
          <AgentKarti
            key={roleKey}
            roleKey={roleKey}
            config={AGENT_CONFIGS[roleKey]}
            projectId={projectId}
          />
        ))}
    </div>
  )
}
