import { useRef, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { buildTemplateWorkbook, parseWbsAreaWorkbook } from '../../../../utils/wbsAreaExcel'
import { downloadBlob, XLSX_MIME } from '../../../../utils/downloadFile'
import { parseDetails, wbsAreaErrorMessage } from '../../../../utils/wbsAreaErrors'
import { Modal } from '../is-plani/GorevSiniflandirmaModals'
import { modalStyles as S } from '../is-plani/modalStyles'

// WBS/alan Excel importu (Karar 50): dosya istemcide okunur → import_wbs_areas önizleme → rapor → onay.
// Gerçek import hepsi ya da hiçbiri; dosyada olmayan kayıt silinmez; Activity ID etkisi varsa engellenir.

const RULE_TEXT = {
  required_missing: 'Kod veya ad boş',
  code_format: 'Kod biçime uymuyor',
  value_invalid: 'Geçersiz değer (Aktif / alan tipi)',
  discipline_unknown: 'Disiplin listede yok',
  duplicate_in_file: 'Dosyada tekrar ediyor',
  parent_missing: 'Üst kod ne dosyada ne projede var',
  self_parent: 'Kayıt kendi üstü',
  cycle: 'Üst zinciri döngü oluşturuyor',
  inactive_parent_active_child: 'Aktif kayıt pasif bir üstün altında',
  deactivate_with_active_children: 'Pasifleştirilen kaydın dosyada olmayan aktif alt kaydı var',
  link_area_missing: 'Bağdaki alan tanımlı değil',
  link_wbs_missing: "Bağdaki WBS tanımlı değil",
  row_limit: 'Sayfada 5.000\'den fazla satır',
  sheet_missing: 'Sayfa yok',
  header_mismatch: 'Kolon başlığı değiştirilmiş',
}
const ACTION_TEXT = { insert: 'eklenecek', update: 'güncellenecek', unchanged: 'değişmeyecek', error: 'hatalı' }

function Summary({ summary }) {
  if (!summary) return null
  const part = (label, x, keys) => (
    <div style={{ padding: 10, borderRadius: 9, background: 'var(--color-bg)' }}>
      <strong style={{ display: 'block', fontSize: 12.5 }}>{label}</strong>
      <span style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>{keys.map(k => `${x?.[k] ?? 0} ${ACTION_TEXT[k]}`).join(' · ')}</span>
    </div>
  )
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      {part('WBS', summary.wbs, ['insert', 'update', 'unchanged', 'error'])}
      {part('Alanlar', summary.areas, ['insert', 'update', 'unchanged', 'error'])}
      {part('Alan-WBS bağları', summary.links, ['insert', 'unchanged', 'error'])}
    </div>
  )
}

function Table({ rows, cols }) {
  return (
    <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{cols.map(c => <th key={c[0]} style={S.th}>{c[0]}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{cols.map(c => <td key={c[0]} style={S.td}>{c[1](r)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

export default function WbsAlanImportModal({ projectId, onClose, onImported }) {
  const fileRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const [payload, setPayload] = useState(null)
  const [parseErrors, setParseErrors] = useState([])
  const [report, setReport] = useState(null)
  const [written, setWritten] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function downloadTemplate() {
    const { default: ExcelJS } = await import('exceljs')
    const wb = buildTemplateWorkbook(ExcelJS)
    downloadBlob(await wb.xlsx.writeBuffer(), 'wbs-alan-sablonu.xlsx', XLSX_MIME)
  }

  async function pickFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setFileName(file.name)
    setReport(null)
    setWritten(null)
    setError('')
    setBusy(true)
    try {
      const { default: ExcelJS } = await import('exceljs')
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await file.arrayBuffer())
      const parsed = parseWbsAreaWorkbook(wb, file.name)
      setPayload(parsed.payload)
      setParseErrors(parsed.parseErrors)
      if (parsed.parseErrors.length === 0) await preview(parsed.payload)
    } catch (err) {
      setError(`Dosya okunamadı: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function preview(pl) {
    const { data, error: err } = await supabase.rpc('import_wbs_areas', { p_project_id: projectId, p_payload: pl, p_dry_run: true })
    if (err) { setError(wbsAreaErrorMessage(err)); return }
    setReport(data)
  }

  async function apply() {
    setBusy(true)
    setError('')
    const { data, error: err } = await supabase.rpc('import_wbs_areas', { p_project_id: projectId, p_payload: payload, p_dry_run: false })
    setBusy(false)
    if (err) {
      const detail = parseDetails(err)
      setError(wbsAreaErrorMessage(err))
      if (detail?.errors || detail?.aid_impact) await preview(payload) // durum değişmişse raporu tazele
      return
    }
    setWritten(data.written)
    onImported?.()
  }

  const s = report?.summary
  const canApply = s && s.error_count === 0 && s.aid_impact_count === 0 && !written
  const changes = (report?.items?.wbs || []).concat(report?.items?.areas || []).filter(x => x.action === 'update')

  return (
    <Modal title="WBS ve alanları Excel'den içe aktar" subtitle={fileName || 'Şablona göre doldurulmuş dosyayı seçin'} onClose={onClose} width={900}
      footer={<>
        <button type="button" style={{ ...S.btn, marginRight: 'auto' }} onClick={downloadTemplate}>Şablonu indir</button>
        <button type="button" style={S.btn} onClick={() => fileRef.current?.click()} disabled={busy}>{fileName ? 'Başka dosya seç' : 'Dosya seç'}</button>
        <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={pickFile} data-testid="wbs-alan-dosya" />
        <button type="button" style={S.btn} onClick={onClose} disabled={busy}>{written ? 'Kapat' : 'Vazgeç'}</button>
        {!written && <button type="button" style={{ ...S.btnP, opacity: canApply && !busy ? 1 : 0.55 }} onClick={apply} disabled={!canApply || busy}>Onayla ve içe aktar</button>}
      </>}>
      <p style={S.info}>Kayıtlar koda göre eşleşir. Dosyada olmayan kayıtlar silinmez; alan-WBS bağları yalnızca eklenir. Bir hata ya da Activity ID etkisi varsa hiçbir şey yazılmaz.</p>
      {busy && <p style={S.info}>İşleniyor…</p>}
      {error && <p style={S.err}>{error}</p>}
      {parseErrors.length > 0 && (
        <>
          <p style={S.err}>Dosya şablona uymuyor; önizleme yapılmadı.</p>
          <Table rows={parseErrors} cols={[['Sayfa', r => r.sheet], ['Satır', r => r.row ?? '—'], ['Sorun', r => RULE_TEXT[r.code] || r.code], ['Ayrıntı', r => r.message]]} />
        </>
      )}
      {written && <p style={{ ...S.warn, background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}>
        İçe aktarıldı: {written.wbs_inserted} WBS eklendi, {written.wbs_updated} güncellendi · {written.areas_inserted} alan eklendi, {written.areas_updated} güncellendi · {written.links_inserted} bağ eklendi.
      </p>}
      {report && (
        <>
          <Summary summary={s} />
          {report.errors?.length > 0 && (
            <>
              <strong style={{ fontSize: 13, color: '#991b1b' }}>Hatalar ({report.errors.length})</strong>
              <Table rows={report.errors} cols={[['Sayfa', r => r.sheet], ['Satır', r => r.row ?? '—'], ['Kural', r => RULE_TEXT[r.code] || r.code], ['Ayrıntı', r => r.message]]} />
            </>
          )}
          {report.aid_impact?.length > 0 && (
            <>
              <strong style={{ fontSize: 13, color: '#991b1b' }}>Bu değişiklikler Activity ID'li görevleri etkiliyor; import engellenir ({report.aid_impact.length})</strong>
              <Table rows={report.aid_impact} cols={[['Sayfa', r => r.sheet], ['Satır', r => r.row ?? '—'], ['Activity ID', r => r.activity_id], ['Açıklama', r => r.message]]} />
            </>
          )}
          {changes.length > 0 && (
            <>
              <strong style={{ fontSize: 13 }}>Güncellenecek kayıtlar</strong>
              <Table rows={changes} cols={[['Satır', r => r.row], ['Kod', r => r.code], ['Değişen alanlar', r => (r.changes || []).join(', ')]]} />
            </>
          )}
          {(report.not_in_file?.wbs?.length > 0 || report.not_in_file?.areas?.length > 0 || report.not_in_file?.links?.length > 0) && (
            <p style={S.info}>
              Dosyada olmayan kayıtlar silinmez:
              {report.not_in_file.wbs?.length > 0 && ` WBS: ${report.not_in_file.wbs.join(', ')}.`}
              {report.not_in_file.areas?.length > 0 && ` Alanlar: ${report.not_in_file.areas.join(', ')}.`}
              {report.not_in_file.links?.length > 0 && ` Bağlar: ${report.not_in_file.links.map(l => `${l.area_code}/${l.wbs_code}`).join(', ')}.`}
            </p>
          )}
          {!written && <p style={S.info}>Önizleme: hiçbir şey yazılmadı.</p>}
        </>
      )}
    </Modal>
  )
}
