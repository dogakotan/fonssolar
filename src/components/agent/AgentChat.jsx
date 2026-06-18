import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { AGENTS, getAgentById, getTabConfig } from './agentConfig'
import { fetchTabContext } from './agentContext'
import { supabase } from '../../lib/supabase'

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY

const TAB_LABEL = {
  genel:        'Genel Bakış',
  projeler:     'Projeler',
  'is-plani':   'İş Planı',
  'satin-alma': 'Satın Alma',
  ekip:         'Ekip',
  raporlar:     'AI Raporlar',
  finans:       'Finans',
  tickets:      'Ticket Sistemi',
}

// ─── Dosya tipi ───────────────────────────────────────────────────────────────
const ACCEPTED = '.pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png'
const IMG_TYPES  = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const PDF_TYPE   = 'application/pdf'
const EXCEL_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
]

// ─── Dosya → base64 ───────────────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ─── Excel/CSV → markdown tablo metni ────────────────────────────────────────
function excelToText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary' })
        const lines = []
        wb.SheetNames.slice(0, 3).forEach(name => {
          const ws = wb.Sheets[name]
          const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
          lines.push(`\n### Sayfa: ${name}`)
          data.slice(0, 60).forEach(row => {
            lines.push('| ' + row.map(c => String(c ?? '').replace(/\|/g, '\\|')).join(' | ') + ' |')
          })
          if (data.length > 60) lines.push(`_(... ${data.length - 60} satır daha)_`)
        })
        resolve(lines.join('\n'))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsBinaryString(file)
  })
}

// ─── Dosyayı Claude content bloğuna çevir ────────────────────────────────────
async function fileToContentBlock(file) {
  const type = file.type || ''

  if (IMG_TYPES.includes(type)) {
    const data = await fileToBase64(file)
    return {
      type: 'image',
      source: { type: 'base64', media_type: type, data },
    }
  }

  if (type === PDF_TYPE) {
    const data = await fileToBase64(file)
    return {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data },
    }
  }

  // Excel / CSV → metin olarak
  const text = await excelToText(file)
  return {
    type: 'text',
    text: `📎 Yüklenen dosya: **${file.name}**\n\n${text}`,
  }
}

// ─── Claude API ───────────────────────────────────────────────────────────────
async function callClaude(systemPrompt, messages) {
  const res = await fetch('/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: systemPrompt,
      messages,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `API hatası: ${res.status}`)
  }
  const data = await res.json()
  return data.content[0]?.text || ''
}

function greeting(agent) {
  return `Merhaba! **${agent.name}** olarak buradayım.\n${agent.description}.\n\nSoru sorabilir veya 📎 butonuyla **PDF, Excel veya fotoğraf** ekleyerek analiz isteyebilirsiniz.`
}

function renderMd(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<strong style="display:block;margin-top:6px;color:#185FA5">$1</strong>')
    .replace(/\n/g, '<br/>')
}

// ─── Dosya ikonu ──────────────────────────────────────────────────────────────
function FileChip({ file, onRemove }) {
  const isImg = IMG_TYPES.includes(file.type)
  const isPdf = file.type === PDF_TYPE
  const icon  = isImg ? '🖼️' : isPdf ? '📄' : '📊'
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: '#F0F4FF', border: '1px solid #BFDBFE',
      borderRadius: 8, padding: '4px 8px', fontSize: 12, color: '#1D4ED8',
      maxWidth: 220,
    }}>
      <span>{icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
      <button
        onClick={onRemove}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontSize: 14, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
      >×</button>
    </div>
  )
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────────
export default function AgentChat({ activeTab, onClose, projectId, selectedDate }) {
  const [activeAgent,    setActiveAgent]    = useState(null)
  const [featuredAgents, setFeaturedAgents] = useState([])
  const [messages,       setMessages]       = useState([])
  const [history,        setHistory]        = useState([])
  const [input,          setInput]          = useState('')
  const [loading,        setLoading]        = useState(false)
  const [showPicker,     setShowPicker]     = useState(false)
  const [err,            setErr]            = useState(null)
  const [saving,         setSaving]         = useState(false)
  const [savedMsg,       setSavedMsg]       = useState(null)
  const [attachedFile,   setAttachedFile]   = useState(null)  // File nesnesi

  const bottomRef    = useRef(null)
  const inputRef     = useRef(null)
  const fileInputRef = useRef(null)
  const lastAssistantRef = useRef(null)

  // Tab değişince default ajanı yükle
  useEffect(() => {
    const config = getTabConfig(activeTab)
    const agent  = getAgentById(config.default)
    const feat   = config.featured.map(id => getAgentById(id)).filter(Boolean)
    setFeaturedAgents(feat)
    initAgent(agent)
  }, [activeTab])

  function initAgent(agent) {
    if (!agent) return
    setActiveAgent(agent)
    setMessages([{ id: 1, role: 'assistant', content: greeting(agent) }])
    setHistory([])
    setInput('')
    setAttachedFile(null)
    setErr(null)
    lastAssistantRef.current = null
  }

  function switchAgent(agent) { setShowPicker(false); initAgent(agent) }

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // ─── Dosya seçimi ──────────────────────────────────────────────────────────
  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    // 20 MB limit
    if (file.size > 20 * 1024 * 1024) {
      setErr('Dosya 20 MB\'den büyük olamaz.')
      return
    }
    setAttachedFile(file)
    setErr(null)
    e.target.value = ''
  }

  // ─── Gönder ────────────────────────────────────────────────────────────────
  async function send() {
    const text = input.trim()
    if ((!text && !attachedFile) || loading || !activeAgent) return
    setInput('')
    setErr(null)
    setSavedMsg(null)

    // Kullanıcı mesajı görünümü
    const displayText = text || (attachedFile ? `📎 ${attachedFile.name} analiz et` : '')
    const userMsg = { id: Date.now(), role: 'user', content: displayText }
    setMessages(m => [...m, userMsg])
    setLoading(true)

    const currentFile = attachedFile
    setAttachedFile(null)

    try {
      // 1. Supabase canlı context
      const liveContext = await fetchTabContext(activeTab, projectId, selectedDate)

      // 2. System prompt
      const systemPrompt = `${activeAgent.systemPrompt}

Aktif sekme: ${TAB_LABEL[activeTab] || activeTab}
Proje ID: ${projectId || 'genel'}
Fons Solar GES Dashboard üzerinde çalışıyorsun.
${selectedDate ? `⚠️ GEÇMİŞ TARİH MODU: Kullanıcı ${selectedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })} tarihini seçti. Yalnızca o tarihe kadar olan veriler gösterilmektedir. Yanıtlarında bunu belirt.` : ''}

Kullanıcı bir belge/fotoğraf eklediyse:
- İçeriği dikkatle analiz et
- Kendi rolün açısından yorumla
- Aşağıdaki Supabase verileriyle karşılaştır, fark/risk/uyumsuzluk varsa belirt
- Somut, eyleme dönük bulgular sun

Yanıtların net ve yapılandırılmış olsun (başlıklar kullanabilirsin).${liveContext}`

      // 3. Claude'a gönderilecek mesaj içeriği
      let userContent = []

      if (currentFile) {
        const block = await fileToContentBlock(currentFile)
        userContent.push(block)
      }

      if (text) {
        userContent.push({ type: 'text', text })
      } else if (currentFile) {
        userContent.push({
          type: 'text',
          text: `Yukarıdaki ${currentFile.name} dosyasını ${activeAgent.name} rolüyle analiz et. Supabase'deki mevcut proje verileriyle karşılaştır ve bulgularını raporla.`,
        })
      }

      // History'e ekle — API formatı (content array veya string)
      const historyMsg = { role: 'user', content: userContent.length === 1 && userContent[0].type === 'text'
        ? userContent[0].text
        : userContent
      }
      const newHistory = [...history, historyMsg]
      setHistory(newHistory)

      const reply = await callClaude(systemPrompt, newHistory)
      lastAssistantRef.current = reply

      setMessages(m => [...m, { id: Date.now() + 1, role: 'assistant', content: reply }])
      setHistory(h => [...h, { role: 'assistant', content: reply }])
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  // ─── Raporu kaydet ────────────────────────────────────────────────────────
  async function saveReport() {
    if (!lastAssistantRef.current || !activeAgent) return
    setSaving(true)
    setSavedMsg(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('agent_reports').insert({
        project_id: projectId || 'genel',
        agent_role: activeAgent.id,
        input_data: { tab: activeTab, messages: history.slice(-4) },
        report_text: lastAssistantRef.current,
        risk_level: null,
        created_by: user?.id || null,
      })
      if (error) throw error
      setSavedMsg('✓ Rapor kaydedildi')
    } catch (e) {
      setSavedMsg(`Hata: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const canSend = (input.trim() || attachedFile) && !loading
  if (!activeAgent) return null

  const pageLabel = TAB_LABEL[activeTab] || activeTab

  return (
    <div style={{
      position: 'fixed', bottom: 88, right: 24, zIndex: 200,
      width: 390, maxHeight: 580,
      background: '#fff', borderRadius: 16,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      border: '1px solid #E5E7EB',
    }}>

      {/* ── Header ─────────────────────────────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E5E7EB', flexShrink: 0 }}>
        <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            background: `${activeAgent.color}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
          }}>
            {activeAgent.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <button
              onClick={() => setShowPicker(p => !p)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
                {activeAgent.name}
              </span>
              <span style={{ fontSize: 10, color: '#9CA3AF', flexShrink: 0 }}>{showPicker ? '▲' : '▼'}</span>
            </button>
            <p style={{ fontSize: 11, color: '#10B981', margin: 0, fontWeight: 500 }}>● {pageLabel}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1, padding: 4, flexShrink: 0 }}>×</button>
        </div>

        {/* ── Geçmiş Tarih Bandı ───────────────────────── */}
        {selectedDate && (
          <div style={{
            background: '#FEF3C7', borderTop: '1px solid #FDE68A',
            padding: '5px 14px',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 11, color: '#92400E', fontWeight: 600 }}>
              {selectedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })} — Geçmiş Veri Modu
            </span>
          </div>
        )}

        {/* ── Agent Picker ─────────────────────────────── */}
        {showPicker && (
          <div style={{ padding: '0 14px 12px' }}>
            <p style={{ fontSize: 10, color: '#9CA3AF', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bu sayfa için önerilen</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {featuredAgents.map(a => (
                <button key={a.id} onClick={() => switchAgent(a)} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                  border: `1.5px solid ${activeAgent.id === a.id ? a.color : '#E5E7EB'}`,
                  background: activeAgent.id === a.id ? `${a.color}12` : '#fff',
                  color: activeAgent.id === a.id ? a.color : '#374151',
                  fontWeight: activeAgent.id === a.id ? 700 : 400, fontFamily: 'inherit',
                }}>
                  <span>{a.icon}</span><span>{a.short}</span>
                </button>
              ))}
            </div>
            <p style={{ fontSize: 10, color: '#9CA3AF', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tüm ajanlar</p>
            <div style={{ maxHeight: 148, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {AGENTS.map(a => (
                <button key={a.id} onClick={() => switchAgent(a)} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 8px', borderRadius: 8, fontSize: 11,
                  border: `1px solid ${activeAgent.id === a.id ? a.color : '#F3F4F6'}`,
                  background: activeAgent.id === a.id ? `${a.color}10` : '#F9FAFB',
                  color: '#374151', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                }}>
                  <span style={{ fontSize: 14 }}>{a.icon}</span>
                  <span style={{ fontWeight: activeAgent.id === a.id ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.short}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Mesajlar ──────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map(m => (
          <div key={m.id} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
            {m.role === 'assistant' && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: `${activeAgent.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                  {activeAgent.icon}
                </div>
                <div style={{ background: '#F3F4F6', borderRadius: '0 12px 12px 12px', padding: '8px 12px', fontSize: 13, lineHeight: 1.55, color: '#111827' }}
                  dangerouslySetInnerHTML={{ __html: renderMd(m.content) }}
                />
              </div>
            )}
            {m.role === 'user' && (
              <div style={{ background: activeAgent.color, color: '#fff', borderRadius: '12px 12px 0 12px', padding: '8px 12px', fontSize: 13, lineHeight: 1.55 }}>
                {m.content}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'flex-start', gap: 7 }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: `${activeAgent.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
              {activeAgent.icon}
            </div>
            <div style={{ background: '#F3F4F6', borderRadius: '0 12px 12px 12px', padding: '10px 14px' }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#9CA3AF', animation: 'pulse 1.2s ease-in-out infinite', animationDelay: `${i * 0.2}s`, display: 'inline-block' }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {err && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '8px 12px', fontSize: 12 }}>⚠️ {err}</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Raporu Kaydet ─────────────────────────────── */}
      {lastAssistantRef.current && (
        <div style={{ padding: '6px 14px', borderTop: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button onClick={saveReport} disabled={saving} style={{
            fontSize: 12, padding: '4px 12px', borderRadius: 6,
            border: '1px solid #D1D5DB', background: saving ? '#F9FAFB' : '#fff',
            color: saving ? '#9CA3AF' : '#374151', cursor: saving ? 'default' : 'pointer',
            fontFamily: 'inherit', fontWeight: 500,
          }}>
            {saving ? '⏳ Kaydediliyor…' : '💾 Raporu Kaydet'}
          </button>
          {savedMsg && <span style={{ fontSize: 12, color: savedMsg.startsWith('✓') ? '#16a34a' : '#dc2626' }}>{savedMsg}</span>}
        </div>
      )}

      {/* ── Dosya önizleme ────────────────────────────── */}
      {attachedFile && (
        <div style={{ padding: '4px 12px 0', flexShrink: 0 }}>
          <FileChip file={attachedFile} onRemove={() => setAttachedFile(null)} />
        </div>
      )}

      {/* ── Input ─────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid #E5E7EB', padding: '10px 12px', display: 'flex', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>

        {/* Dosya ekle butonu */}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Dosya ekle (PDF, Excel, Fotoğraf)"
          style={{
            width: 34, height: 34, borderRadius: 8, flexShrink: 0,
            background: attachedFile ? '#EFF6FF' : '#F9FAFB',
            border: `1px solid ${attachedFile ? '#BFDBFE' : '#E5E7EB'}`,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, color: attachedFile ? '#1D4ED8' : '#6B7280',
            transition: 'all 0.15s',
          }}
        >
          📎
        </button>

        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={attachedFile ? 'Dosya hakkında soru sor (opsiyonel)…' : `${activeAgent.short}'a sor…`}
          rows={1}
          style={{
            flex: 1, border: '1px solid #E5E7EB', borderRadius: 10, padding: '8px 12px',
            fontSize: 13, fontFamily: 'inherit', resize: 'none', outline: 'none',
            lineHeight: 1.5, maxHeight: 96, overflowY: 'auto', color: '#111827',
          }}
          onInput={e => {
            e.target.style.height = 'auto'
            e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px'
          }}
        />
        <button
          onClick={send}
          disabled={!canSend}
          style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            background: canSend ? activeAgent.color : '#E5E7EB',
            border: 'none', cursor: canSend ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, color: '#fff', transition: 'background 0.15s',
          }}
        >
          ↑
        </button>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
