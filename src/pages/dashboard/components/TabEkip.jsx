import { useState, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../../lib/supabase'
import { insertAgentReport } from '../../../api'
import { AGENT_PROMPTS } from '../../../utils/agentLoader'

// ── Ajan katalogu ──────────────────────────────────────────────────────────
const AGENT_CATALOG = [
  // Proje Yönetimi
  {
    id: 'proje-koordinatoru',
    isim: 'Proje Koordinatörü',
    ikon: '📋',
    renk: '#534ab7',
    kategori: 'Proje Yönetimi',
    aciklama: 'GES projelerinin genel ilerleyişini takip eder, farklı ekiplerden gelen bilgileri birleştirir ve yönetime düzenli rapor sunar.',
    sistemPrompt: `Sen Fons Solar büyük ölçekli GES projeleri için çalışan Proje Koordinatörü ajanısın.

GES projelerinin genel ilerleyişini takip etmek, farklı ekiplerden gelen bilgileri birleştirmek, kurum süreçlerini izlemek, riskleri belirlemek ve yönetime düzenli rapor sunmak senin ana görevindir.

Sorumlulukların arasında genel proje koordinasyonunu takip etmek, proje takvimi ve kilometre taşlarını izlemek, paydaş yönetimini desteklemek, TEİAŞ/EPDK/TEDAŞ süreçlerini takip etmek, haftalık ve aylık raporlar hazırlamak, gecikme ve risk tespiti yapmak bulunmaktadır.

Büyük resmi görürsün, gereksiz teknik detaya boğulmazsın. Yönetimin hızlı karar alabileceği net özetler üretirsin. Eksik veri varsa açıkça belirtirsin. Yanıtların Türkçe olsun.`,
  },
  {
    id: 'proje-tasarim-sorumlusu',
    isim: 'Proje Tasarım Sorumlusu',
    ikon: '📐',
    renk: '#0369a1',
    kategori: 'Proje Yönetimi',
    aciklama: 'GES projelerinde tasarım ve proje dokümantasyonu süreçlerini destekler, TEDAŞ standartlarına uygun proje çizimi ve BOM listesi hazırlar.',
    sistemPrompt: `Sen Fons Solar büyük ölçekli GES projeleri için çalışan Proje Tasarım Sorumlusu ajanısın.

GES projelerinde tasarım ve proje dokümantasyonu süreçlerini desteklemek, TEDAŞ standartlarına uygun proje çizimi, uygulama projesi hazırlanması, proje onay süreci takibi ve proje BOM listesi oluşturulması konularında çalışırsın.

Teknik, net ve kontrol listesi mantığında çalışırsın. Varsayım yapmazsın; eksik veri varsa açıkça belirtirsin. Proje çizimlerini yorumlar ve kontrol edersin; nihai mühendislik onayı yerine geçmezsin. Yanıtların Türkçe olsun.`,
  },
  {
    id: 'proje-kurulum-sefi',
    isim: 'Proje Kurulum Şefi',
    ikon: '🏭',
    renk: '#0f6e56',
    kategori: 'Proje Yönetimi',
    aciklama: 'GES sahasında mekanik ve elektrik kurulum süreçlerini bütüncül şekilde takip eder, iş programına göre sapmaları tespit eder.',
    sistemPrompt: `Sen Fons Solar büyük ölçekli GES projeleri için çalışan Proje Kurulum Şefi ajanısın.

GES sahasında mekanik ve elektrik kurulum süreçlerini bütüncül şekilde takip etmek, günlük saha ilerlemesini değerlendirmek, iş programına göre sapmaları tespit etmek ve ekip/kaynak optimizasyonu için aksiyon önerileri üretmek senin ana görevindir.

Saha gerçeklerine odaklanırsın. Teorik açıklamalardan çok uygulanabilir aksiyon üretirsin. Günlük üretim verilerini iş programı ile karşılaştırırsın. Yanıtların Türkçe olsun.`,
  },
  {
    id: 'evrak-takip-uzmani',
    isim: 'Evrak Takip Uzmanı',
    ikon: '📂',
    renk: '#6d4c41',
    kategori: 'Proje Yönetimi',
    aciklama: 'GES projelerinde gerekli resmi evrakları, kurum başvurularını ve onay süreçlerini takip eder; eksik belgeleri tespit eder.',
    sistemPrompt: `Sen Fons Solar büyük ölçekli GES projeleri için çalışan Evrak Takip Uzmanı ajanısın.

GES projelerinde gerekli resmi evrakları, kurum başvurularını, onay süreçlerini ve proje dokümanlarını düzenli şekilde takip etmek; eksik, hatalı veya geciken belgeleri tespit ederek ilgili ekiplere aksiyon listesi hazırlamak senin ana görevindir.

Düzenli, sistematik ve kontrol listesi mantığında çalışırsın. Her belgenin durumunu net sınıflandırırsın: hazır / eksik / incelemede / revizyonda / onaylandı / beklemede. Yanıtların Türkçe olsun.`,
  },
  {
    id: 'maliyet-kontrolcu',
    isim: 'Maliyet Kontrolcü',
    ikon: '💰',
    renk: '#3b6d11',
    kategori: 'Proje Yönetimi',
    aciklama: 'GES projelerinde proje bütçesini, gerçekleşen maliyetleri, hakedişleri ve maliyet sapmalarını takip eder.',
    sistemPrompt: `Sen Fons Solar büyük ölçekli GES projeleri için çalışan Maliyet Kontrolcü ajanısın.

GES projelerinde proje bütçesini, gerçekleşen maliyetleri, satın alma harcamalarını, hakedişleri ve maliyet sapmalarını takip etmek; proje yönetimine finansal durum, risk ve aksiyon önerileri sunmak senin ana görevindir.

Sayısal, net ve tablo odaklı çalışırsın. Maliyetleri sadece listelemezsin; bütçe, gerçekleşen, sapma ve sebep ilişkisiyle analiz edersin. Finansal karar vermezsin; karar destek raporu üretirsin. Yanıtların Türkçe olsun.`,
  },
  // Saha Operasyonu
  {
    id: 'santiye-sefi',
    isim: 'Şantiye Şefi',
    ikon: '🏗️',
    renk: '#374151',
    kategori: 'Saha Operasyonu',
    aciklama: 'GES sahasında günlük operasyonu takip eder, ekiplerin vardiya içindeki faaliyetlerini raporlar ve saha düzenini değerlendirir.',
    sistemPrompt: `Sen Fons Solar büyük ölçekli GES projeleri için çalışan Şantiye Şefi ajanısın.

GES sahasında günlük operasyonu takip etmek, ekiplerin vardiya içindeki faaliyetlerini raporlamak, saha düzeni, iş güvenliği, kalite ve günlük üretim durumunu değerlendirmek senin ana görevindir.

Sahadan gelen bilgileri net ve pratik şekilde düzenlersin. Uzun teorik açıklamalar yapmazsın. Günlük gerçekleşen işleri somut kalemlerle yazarsın. Kritik İSG riski varsa raporun en üstünde belirtirsin. Yanıtların Türkçe olsun.`,
  },
  {
    id: 'operasyon-sorumlusu',
    isim: 'Operasyon Sorumlusu',
    ikon: '⚙️',
    renk: '#1e3a5f',
    kategori: 'Saha Operasyonu',
    aciklama: 'GES projelerinde saha operasyonlarının düzenli, verimli ve kesintisiz ilerlemesini takip eder; ekip, malzeme ve makine koordinasyonu yapar.',
    sistemPrompt: `Sen Fons Solar büyük ölçekli GES projeleri için çalışan Operasyon Sorumlusu ajanısın.

GES projelerinde saha operasyonlarının düzenli, verimli ve kesintisiz ilerlemesini takip etmek; ekip, malzeme, makine, lojistik ve günlük operasyon ihtiyaçlarını koordine edecek raporlar hazırlamak senin ana görevindir.

Pratik, çözüm odaklı ve saha gerçeklerine uygun çalışırsın. Her aksaklığı iş programına etkisi ve gerekli aksiyon ile birlikte belirtirsin. Yanıtların Türkçe olsun.`,
  },
  {
    id: 'mekanik-sef',
    isim: 'Mekanik Şef',
    ikon: '🔩',
    renk: '#854f0b',
    kategori: 'Saha Operasyonu',
    aciklama: 'GES sahasında mekanik imalatların ilerleyişini takip eder; kazık çakımı, konstrüksiyon ve panel montaj süreçlerini raporlar.',
    sistemPrompt: `Sen Fons Solar büyük ölçekli GES projeleri için çalışan Mekanik Şef ajanısın.

GES sahasında mekanik imalatların proje çizimlerine, uygulama planına ve kalite beklentilerine uygun ilerleyip ilerlemediğini takip etmek; kazık, konstrüksiyon ve panel montaj süreçlerini günlük/haftalık olarak raporlamak senin ana görevindir.

Sahadaki mekanik imalatlara odaklanırsın. Net, ölçülebilir ve üretim odaklı rapor hazırlarsın. Sadece "yapıldı" demezsin; miktar, lokasyon, ekip ve varsa sorun belirtirsin. Yanıtların Türkçe olsun.`,
  },
  {
    id: 'elektrik-sefi',
    isim: 'Elektrik Şefi',
    ikon: '⚡',
    renk: '#185fa5',
    kategori: 'Saha Operasyonu',
    aciklama: 'GES sahasında elektrik imalatların ilerleyişini takip eder; DC/AC kablolama, inverter, trafo ve OG bağlantı işlerini raporlar.',
    sistemPrompt: `Sen Fons Solar büyük ölçekli GES projeleri için çalışan Elektrik Şefi ajanısın.

GES sahasında elektrik imalatların proje çizimlerine, uygulama projesine, teknik şartnamelere ve saha iş programına uygun ilerleyip ilerlemediğini takip etmek; DC, AC, OG bağlantı işleri ve test-devreye alma öncesi elektrik hazırlıklarını raporlamak senin ana görevindir.

Sahadaki elektrik imalatlara odaklanırsın. Net, teknik ve ölçülebilir rapor hazırlarsın. Elektrik güvenlik riski varsa raporun en üstünde belirtirsin. Yanıtların Türkçe olsun.`,
  },
  {
    id: 'is-makinesi-operator-sefi',
    isim: 'İş Makinesi Operatör Şefi',
    ikon: '🚜',
    renk: '#5c3317',
    kategori: 'Saha Operasyonu',
    aciklama: 'GES sahasında kullanılan iş makinelerinin doğru ve verimli kullanılmasını takip eder; arıza, bakım ve makine planlamasını raporlar.',
    sistemPrompt: `Sen Fons Solar büyük ölçekli GES projeleri için çalışan İş Makinesi Operatör Şefi ajanısın.

GES sahasında kullanılan iş makinelerinin doğru, verimli, güvenli ve iş programına uygun şekilde kullanılmasını takip etmek; makine kullanım durumunu, operatör ekiplerini, arıza/bakım ihtiyaçlarını ve saha içi makine planlamasını raporlamak senin ana görevindir.

Saha ve makine operasyonlarına pratik gözle bakarsın. Hangi makinenin nerede, hangi iş için, kaç saat kullanıldığını net belirtirsin. Güvenlik riski olan makine operasyonlarını raporun en üstünde belirtirsin. Yanıtların Türkçe olsun.`,
  },
  {
    id: 'enh-sorumlusu',
    isim: 'ENH Sorumlusu',
    ikon: '🔌',
    renk: '#1a3650',
    kategori: 'Saha Operasyonu',
    aciklama: 'GES projelerinde enerji nakil hattı, OG hat uygulamaları ve şebeke bağlantı süreçlerini takip eder.',
    sistemPrompt: `Sen Fons Solar büyük ölçekli GES projeleri için çalışan ENH Sorumlusu ajanısın.

GES projelerinde enerji nakil hattı, bağlantı hattı, OG hat uygulamaları, direk güzergahı, hat imalatı, kurum izinleri ve kabul süreçlerini takip etmek; ENH kaynaklı teknik, operasyonel ve resmi süreç risklerini raporlamak senin ana görevindir.

ENH sürecini hem teknik hem resmi izin boyutuyla değerlendirirsin. Güzergah veya izin kaynaklı gecikmeleri kritik risk olarak işaretlersin. Yanıtların Türkçe olsun.`,
  },
  // Kalite & Güvenlik & Lojistik
  {
    id: 'isg-sorumlusu',
    isim: 'İSG Sorumlusu',
    ikon: '🦺',
    renk: '#a32d2d',
    kategori: 'Kalite & Güvenlik & Lojistik',
    aciklama: 'GES sahasında iş sağlığı ve güvenliği süreçlerini takip eder, saha risklerini belirler ve İSG raporları hazırlar.',
    sistemPrompt: `Sen Fons Solar büyük ölçekli GES projeleri için çalışan İSG Sorumlusu ajanısın.

GES sahasında iş sağlığı ve güvenliği süreçlerini takip etmek, saha risklerini belirlemek, uygunsuzlukları kayıt altına almak, ramak kala/olay bildirimlerini düzenlemek ve ekiplerin güvenli çalışma kurallarına uygun ilerlemesini desteklemek senin ana görevindir.

Güvenlik risklerini önceliklendirirsin. Kritik riskleri raporun en üstünde belirtirsin. Sadece problemi yazmazsın; gerekli aksiyon, sorumlu ekip ve hedef kapanış tarihi de belirtirsin. Dili net, uyarıcı ve aksiyon odaklı kullanırsın. Yanıtların Türkçe olsun.`,
  },
  {
    id: 'kalite-kontrol-sefi',
    isim: 'Kalite Kontrol Şefi',
    ikon: '✅',
    renk: '#065f46',
    kategori: 'Kalite & Güvenlik & Lojistik',
    aciklama: 'GES sahasında mekanik ve elektrik imalatların proje çizimlerine ve teknik şartnamelere uygunluğunu takip eder; punch list hazırlar.',
    sistemPrompt: `Sen Fons Solar büyük ölçekli GES projeleri için çalışan Kalite Kontrol Şefi ajanısın.

GES sahasında yapılan mekanik, elektrik ve altyapı imalatlarının proje çizimlerine, teknik şartnamelere, kalite beklentilerine ve saha uygulama standartlarına uygunluğunu takip etmek; uygunsuzlukları tespit etmek, punch list hazırlamak ve kabul öncesi kalite kontrol süreçlerini raporlamak senin ana görevindir.

Detaycı, sistematik ve kontrol listesi mantığında çalışırsın. Uygunsuzlukları açık, ölçülebilir ve lokasyon bazlı yazarsın. Her uygunsuzluk için etki, risk seviyesi, sorumlu ekip ve gerekli aksiyonu belirtirsin. Yanıtların Türkçe olsun.`,
  },
  {
    id: 'lojistik-tedarik-sorumlusu',
    isim: 'Lojistik & Tedarik Sorumlusu',
    ikon: '🚛',
    renk: '#5f5e5a',
    kategori: 'Kalite & Güvenlik & Lojistik',
    aciklama: 'GES projelerinde malzeme, ekipman ve bileşenlerin zamanında doğru sahaya ulaşmasını takip eder; tedarik risklerini raporlar.',
    sistemPrompt: `Sen Fons Solar büyük ölçekli GES projeleri için çalışan Lojistik ve Tedarik Sorumlusu ajanısın.

GES projelerinde ihtiyaç duyulan malzeme, ekipman ve ana sistem bileşenlerinin zamanında, doğru miktarda, doğru sahaya ve doğru iş paketine uygun şekilde ulaşmasını takip etmek; tedarik ve lojistik kaynaklı gecikme risklerini raporlamak senin ana görevindir.

Malzeme akışını proje iş programıyla birlikte değerlendirirsin. Sadece "geldi/gelmedi" demekle yetinmezsin; malzemenin hangi iş paketini etkilediğini belirtirsin. Sahada üretimi durdurabilecek eksikleri raporun en üstünde belirtirsin. Yanıtların Türkçe olsun.`,
  },
]

const KATEGORILER = ['Tümü', 'Proje Yönetimi', 'Saha Operasyonu', 'Kalite & Güvenlik & Lojistik']

// ── Claude API çağrısı ──────────────────────────────────────────────────────
async function claudeMesaj(sistemPrompt, mesajGecmisi, pdfBase64 = null) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY .env dosyasında tanımlı değil.')

  const gecmis = mesajGecmisi.slice(-20)

  const messages = gecmis.map((m, idx) => {
    if (pdfBase64 && m.role === 'user' && idx === gecmis.length - 1) {
      const base64Data = pdfBase64.split(',')[1] || pdfBase64
      return {
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64Data },
          },
          { type: 'text', text: m.content || '(PDF dosyası yüklendi, lütfen incele)' },
        ],
      }
    }
    // Sadece role ve content gönder — display/dosyaAdi gibi UI alanları API'ye gitmemeli
    return { role: m.role, content: m.content }
  })

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }
  if (pdfBase64) headers['anthropic-beta'] = 'pdfs-2024-09-25'

  const response = await fetch('/anthropic/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: sistemPrompt,
      messages,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `API hatası: ${response.status}`)
  }

  const data = await response.json()
  return data.content[0]?.text || ''
}

// ── Ajan Dizin Kartı ───────────────────────────────────────────────────────
function AjanKart({ ajan, onSec }) {
  return (
    <div
      onClick={() => onSec(ajan)}
      style={{
        background: '#fff',
        border: '1px solid var(--color-border)',
        borderRadius: '0.75rem',
        padding: '1.25rem',
        cursor: 'pointer',
        transition: 'box-shadow 0.18s, border-color 0.18s',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.625rem',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = `0 4px 20px rgba(0,0,0,0.10)`
        e.currentTarget.style.borderColor = ajan.renk
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.borderColor = 'var(--color-border)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{
          fontSize: '1.75rem',
          width: 48,
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `${ajan.renk}18`,
          borderRadius: '0.625rem',
          flexShrink: 0,
        }}>
          {ajan.ikon}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-text)', marginBottom: '0.2rem', lineHeight: 1.3 }}>
            {ajan.isim}
          </div>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0.15rem 0.5rem',
            borderRadius: 999,
            fontSize: '0.65rem',
            fontWeight: 600,
            background: `${ajan.renk}18`,
            color: ajan.renk,
            letterSpacing: '0.02em',
          }}>
            {ajan.kategori}
          </span>
        </div>
      </div>
      <p style={{
        fontSize: '0.78rem',
        color: 'var(--color-muted)',
        margin: 0,
        lineHeight: 1.55,
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {ajan.aciklama}
      </p>
      <button
        onClick={e => { e.stopPropagation(); onSec(ajan) }}
        style={{
          marginTop: 'auto',
          padding: '0.5rem 0.875rem',
          background: ajan.renk,
          color: '#fff',
          border: 'none',
          borderRadius: '0.5rem',
          fontSize: '0.78rem',
          fontWeight: 600,
          cursor: 'pointer',
          alignSelf: 'flex-start',
          transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
      >
        Sohbet Başlat
      </button>
    </div>
  )
}

// ── Sohbet Balonu ──────────────────────────────────────────────────────────
function MesajBalonu({ mesaj }) {
  const kullanici = mesaj.role === 'user'
  const gosterilen = mesaj.display !== undefined ? mesaj.display : mesaj.content
  return (
    <div style={{
      display: 'flex',
      justifyContent: kullanici ? 'flex-end' : 'flex-start',
      marginBottom: '0.75rem',
    }}>
      <div style={{
        maxWidth: '75%',
        padding: '0.75rem 1rem',
        borderRadius: kullanici ? '1rem 1rem 0.25rem 1rem' : '1rem 1rem 1rem 0.25rem',
        background: kullanici ? 'var(--color-primary)' : '#f1f5f9',
        color: kullanici ? '#fff' : 'var(--color-text)',
        fontSize: '0.84rem',
        lineHeight: 1.6,
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
      }}>
        {gosterilen}
        {mesaj.dosyaAdi && (
          <div style={{
            marginTop: gosterilen ? '0.5rem' : 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.25rem 0.6rem',
            background: kullanici ? 'rgba(255,255,255,0.18)' : '#e2e8f0',
            borderRadius: '0.375rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: kullanici ? '#fff' : '#475569',
          }}>
            {mesaj.dosyaIkon || '📎'} {mesaj.dosyaAdi}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Risk seviyesi çıkarıcı (AgentPanel ile tutarlı) ───────────────────────
function riskCikar(metin) {
  if (!metin) return null
  const esles = metin.match(/R[İI]SK_SEV[İI]YES[İI]:\s*(d[üu][şs][üu]k|orta|y[üu]ksek|kritik)/i)
  return esles ? esles[1].toLowerCase() : null
}

// ── Sohbet Paneli ──────────────────────────────────────────────────────────
function SohbetPaneli({ ajan, onGeri, projectId }) {
  const [mesajlar, setMesajlar] = useState([])
  const [girdi, setGirdi] = useState('')
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState(null)
  const [dosya, setDosya] = useState(null)
  const [dosyaIcerik, setDosyaIcerik] = useState('')
  const [dosyaPdfBase64, setDosyaPdfBase64] = useState('')
  const mesajSonuRef = useRef(null)
  const dosyaInputRef = useRef(null)

  useEffect(() => {
    mesajSonuRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mesajlar, yukleniyor])

  function dosyaSec(e) {
    const f = e.target.files[0]
    if (!f) return

    const uzanti = f.name.split('.').pop().toLowerCase()

    if (uzanti === 'pdf') {
      const okulu = new FileReader()
      okulu.onload = ev => {
        setDosya(f)
        setDosyaIcerik('')
        setDosyaPdfBase64(ev.target.result)
      }
      okulu.readAsDataURL(f)
    } else if (uzanti === 'xlsx' || uzanti === 'xls') {
      const okulu = new FileReader()
      okulu.onload = ev => {
        try {
          const wb = XLSX.read(ev.target.result, { type: 'array' })
          const satirlar = []
          wb.SheetNames.forEach(sheetAdi => {
            const ws = wb.Sheets[sheetAdi]
            const csv = XLSX.utils.sheet_to_csv(ws)
            if (csv.trim()) {
              satirlar.push(`[Sayfa: ${sheetAdi}]\n${csv}`)
            }
          })
          setDosya(f)
          setDosyaIcerik(satirlar.join('\n\n'))
          setDosyaPdfBase64('')
        } catch {
          setDosya(f)
          setDosyaIcerik('(Excel dosyası okunamadı)')
          setDosyaPdfBase64('')
        }
      }
      okulu.readAsArrayBuffer(f)
    } else {
      const okulu = new FileReader()
      okulu.onload = ev => {
        setDosya(f)
        setDosyaIcerik(ev.target.result)
        setDosyaPdfBase64('')
      }
      okulu.readAsText(f)
    }

    e.target.value = ''
  }

  function dosyaKaldir() {
    setDosya(null)
    setDosyaIcerik('')
    setDosyaPdfBase64('')
  }

  async function gonder() {
    const metin = girdi.trim()
    if (!metin && !dosya) return
    setHata(null)

    // Dosya ikonunu belirle
    const dosyaIkon = dosya
      ? (dosya.name.endsWith('.pdf') ? '📄' : dosya.name.match(/\.xlsx?$/i) ? '📊' : '📎')
      : null

    // API'ye gönderilecek tam içerik (dosya verisi dahil, 12000 karakter sınırı)
    let tamMesaj = metin
    if (dosya && dosyaIcerik) {
      const kisaltilmis = dosyaIcerik.length > 12000
        ? dosyaIcerik.slice(0, 12000) + '\n\n[...içerik kesildi — dosya çok büyük]'
        : dosyaIcerik
      tamMesaj = `${metin}\n\n---\nYüklenen Dosya (${dosya.name}):\n${kisaltilmis}`
    } else if (dosya && dosyaPdfBase64) {
      tamMesaj = metin || '(PDF dosyası yüklendi, lütfen incele)'
    }

    // UI'da gösterilecek kısa metin (dosya içeriği gizli)
    const goruntulenen = metin || ''

    const yeniKullaniciMesaj = {
      role: 'user',
      content: tamMesaj,
      display: goruntulenen,
      dosyaAdi: dosya?.name || null,
      dosyaIkon,
    }
    const guncellenmis = [...mesajlar, yeniKullaniciMesaj]
    setMesajlar(guncellenmis)
    setGirdi('')
    setDosya(null)
    setDosyaIcerik('')
    const pdfKopya = dosyaPdfBase64
    setDosyaPdfBase64('')
    setYukleniyor(true)

    try {
      const prompt = AGENT_PROMPTS[ajan.id] || ajan.sistemPrompt
      const yanit = await claudeMesaj(prompt, guncellenmis, pdfKopya || null)
      setMesajlar(prev => [...prev, { role: 'assistant', content: yanit }])

      // Ajan yanıtını Supabase agent_reports tablosuna kaydet
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const riskSeviye = riskCikar(yanit)
        await insertAgentReport({
          project_id: projectId || 'genel',
          agent_role: ajan.id,
          input_data: { sohbet_mesaji: tamMesaj, mesaj_sayisi: guncellenmis.length },
          report_text: yanit,
          risk_level: riskSeviye,
          created_by: user?.id ?? null,
        })
      } catch (kayitHata) {
        // Kayıt hatası kullanıcı deneyimini bozmamalı — sadece konsola yaz
        console.warn('[TabEkip] agent_reports kayıt hatası:', kayitHata.message)
      }
    } catch (e) {
      setHata(e.message)
    } finally {
      setYukleniyor(false)
    }
  }

  function klavyeBasildi(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      gonder()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sohbet başlık */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.875rem',
        padding: '1rem 1.5rem',
        borderBottom: '1px solid var(--color-border)',
        background: '#fff',
        flexShrink: 0,
      }}>
        <button
          onClick={onGeri}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0.4rem 0.75rem',
            background: 'none',
            border: '1px solid var(--color-border)',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '0.78rem',
            color: 'var(--color-muted)',
            fontFamily: 'inherit',
            fontWeight: 500,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
        >
          ← Ajanlara Dön
        </button>
        <span style={{
          fontSize: '1.375rem',
          width: 40,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `${ajan.renk}18`,
          borderRadius: '0.5rem',
          flexShrink: 0,
        }}>
          {ajan.ikon}
        </span>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-text)' }}>{ajan.isim}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)', marginTop: '0.1rem' }}>{ajan.kategori}</div>
        </div>
      </div>

      {/* Mesaj alanı */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1.25rem 1.5rem',
        background: '#f8fafc',
      }}>
        {mesajlar.length === 0 && (
          <div style={{
            textAlign: 'center',
            color: 'var(--color-muted)',
            fontSize: '0.84rem',
            paddingTop: '3rem',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>{ajan.ikon}</div>
            <div style={{ fontWeight: 600, marginBottom: '0.375rem', color: 'var(--color-text)' }}>
              {ajan.isim} ile sohbet
            </div>
            <div style={{ maxWidth: 320, margin: '0 auto', lineHeight: 1.55 }}>
              {ajan.aciklama}
            </div>
          </div>
        )}
        {mesajlar.map((m, i) => (
          <MesajBalonu key={i} mesaj={m} />
        ))}
        {yukleniyor && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '0.75rem' }}>
            <div style={{
              padding: '0.75rem 1rem',
              borderRadius: '1rem 1rem 1rem 0.25rem',
              background: '#f1f5f9',
              color: 'var(--color-muted)',
              fontSize: '0.82rem',
              fontStyle: 'italic',
            }}>
              Yanıt bekleniyor...
            </div>
          </div>
        )}
        {hata && (
          <div style={{
            margin: '0.5rem 0',
            padding: '0.75rem 1rem',
            background: '#fee2e2',
            borderRadius: '0.5rem',
            fontSize: '0.82rem',
            color: '#dc2626',
          }}>
            Hata: {hata}
          </div>
        )}
        <div ref={mesajSonuRef} />
      </div>

      {/* Girdi alanı */}
      <div style={{
        padding: '1rem 1.5rem',
        borderTop: '1px solid var(--color-border)',
        background: '#fff',
        flexShrink: 0,
      }}>
        {dosya && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0.3rem 0.625rem',
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '0.375rem',
            fontSize: '0.75rem',
            color: '#1d4ed8',
            marginBottom: '0.625rem',
            maxWidth: '100%',
          }}>
            <span>
              {(() => {
                const ext = dosya.name.split('.').pop().toLowerCase()
                if (ext === 'xlsx' || ext === 'xls') return '📊'
                if (ext === 'pdf') return '📄'
                return '📎'
              })()}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
              {dosya.name} eklendi
            </span>
            <button
              onClick={dosyaKaldir}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#6b7280',
                padding: '0 0.1rem',
                fontSize: '0.875rem',
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
          <textarea
            value={girdi}
            onChange={e => setGirdi(e.target.value)}
            onKeyDown={klavyeBasildi}
            placeholder="Bir mesaj yazın... (Shift+Enter yeni satır, Enter gönderir)"
            rows={2}
            disabled={yukleniyor}
            style={{
              flex: 1,
              padding: '0.625rem 0.875rem',
              border: '1px solid var(--color-border)',
              borderRadius: '0.5rem',
              fontSize: '0.84rem',
              fontFamily: 'inherit',
              resize: 'none',
              lineHeight: 1.5,
              color: 'var(--color-text)',
              outline: 'none',
              background: yukleniyor ? '#f9fafb' : '#fff',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => { e.target.style.borderColor = 'var(--color-primary)' }}
            onBlur={e => { e.target.style.borderColor = 'var(--color-border)' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', flexShrink: 0 }}>
            <input
              ref={dosyaInputRef}
              type="file"
              accept=".txt,.md,.csv,.json,.xlsx,.xls,.pdf"
              onChange={dosyaSec}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => dosyaInputRef.current?.click()}
              disabled={yukleniyor}
              title="Dosya yükle (.txt, .md, .csv, .json, .xlsx, .pdf)"
              style={{
                padding: '0.5rem',
                background: '#f1f5f9',
                border: '1px solid var(--color-border)',
                borderRadius: '0.5rem',
                cursor: yukleniyor ? 'not-allowed' : 'pointer',
                fontSize: '1rem',
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 38,
                height: 38,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (!yukleniyor) e.currentTarget.style.background = '#e2e8f0' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9' }}
            >
              📎
            </button>
            <button
              onClick={gonder}
              disabled={yukleniyor || (!girdi.trim() && !dosya)}
              style={{
                padding: '0.5rem',
                background: yukleniyor || (!girdi.trim() && !dosya) ? '#e2e8f0' : ajan.renk,
                color: yukleniyor || (!girdi.trim() && !dosya) ? '#9ca3af' : '#fff',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: yukleniyor || (!girdi.trim() && !dosya) ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 38,
                height: 38,
                transition: 'background 0.15s',
              }}
            >
              &#9658;
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Ana bileşen ────────────────────────────────────────────────────────────
export default function TabEkip({ projectId }) {
  const [seciliKategori, setSeciliKategori] = useState('Tümü')
  const [seciliAjan, setSeciliAjan] = useState(null)

  const gorunenAjanlar = seciliKategori === 'Tümü'
    ? AGENT_CATALOG
    : AGENT_CATALOG.filter(a => a.kategori === seciliKategori)

  if (seciliAjan) {
    return (
      <div style={{
        background: '#fff',
        border: '1px solid var(--color-border)',
        borderRadius: '0.75rem',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 560,
      }}>
        <SohbetPaneli
          ajan={seciliAjan}
          onGeri={() => setSeciliAjan(null)}
          projectId={projectId}
        />
      </div>
    )
  }

  return (
    <div>
      {/* Başlık */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)', margin: '0 0 0.25rem' }}>
          AI Ajan Kadrosu
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', margin: 0 }}>
          {AGENT_CATALOG.length} ajan — bir ajana tıklayarak sohbet başlatın veya dosya yükleyin
        </p>
      </div>

      {/* Kategori tab bar */}
      <div style={{
        display: 'flex',
        gap: 2,
        marginBottom: '1.25rem',
        borderBottom: '1px solid var(--color-border)',
        overflowX: 'auto',
      }}>
        {KATEGORILER.map(k => (
          <button
            key={k}
            onClick={() => setSeciliKategori(k)}
            style={{
              padding: '0.5rem 0.875rem',
              border: 'none',
              borderBottom: seciliKategori === k ? '2px solid var(--color-primary)' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: seciliKategori === k ? 600 : 400,
              color: seciliKategori === k ? 'var(--color-primary)' : 'var(--color-muted)',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
              marginBottom: -1,
              fontFamily: 'inherit',
            }}
          >
            {k}
            {k !== 'Tümü' && (
              <span style={{
                marginLeft: '0.35rem',
                fontSize: '0.68rem',
                background: seciliKategori === k ? '#eff6ff' : '#f1f5f9',
                color: seciliKategori === k ? 'var(--color-primary)' : 'var(--color-muted)',
                padding: '0.1rem 0.4rem',
                borderRadius: 999,
                fontWeight: 600,
              }}>
                {AGENT_CATALOG.filter(a => a.kategori === k).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Ajan kartları grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: '1rem',
      }}>
        {gorunenAjanlar.map(ajan => (
          <AjanKart key={ajan.id} ajan={ajan} onSec={setSeciliAjan} />
        ))}
      </div>
    </div>
  )
}
