import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../../context/AuthContext'
import { useScope } from '../../../../context/ScopeContext'
import { useDashboardData } from '../../../../hooks/useDashboardData'
import { fetchProfileNames } from '../../../../utils/profileNames'
import Pager from '../../../../components/ui/Pager'
import {
  visibleRegisterTabs, resolveRegisterTab, allColumns, defaultVisibleColumnKeys,
  sortRows, filterRows, paginate, personIdsIn, canViewRegister, getRegisterTab,
  statusOptions, filterByStatus,
} from '../../../../lib/register/registerConfig'
import RegisterDetailPanel from './RegisterDetailPanel'
import RegisterCell from './RegisterCell'
import './register.css'

const PROJECT_KEY = 'register-project'
const columnsKey = registerKey => `register-columns-${registerKey}`
const NO_ACCESS = 'Bu bölüme erişimin yok.'

function readStored(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
function writeStored(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* depolama kapalı */ }
}

// Register ekranı — yalnızca okuma (ekle/düzenle yok). İki kip:
//  - fixedRegister verilirse (menüdeki register-* sayfaları, /dashboard/register-rfi?kayit=<id>): tek register,
//    sekme şeridi yok. 'drawing' doküman listesinin çizim süzgecidir.
//  - verilmezse eski sekmeli görünüm (/dashboard/register?tur=<kod>&kayit=<id>); menüden kaldırılınca silinecek.
// Veri get_register_list / get_register_status_history'den (SECURITY INVOKER; Karar 6 görüntüleme matrisi).
export default function TabRegister({ fixedRegister = null }) {
  const { role } = useAuth()
  const { projects, loadingProjects } = useScope()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabs = useMemo(() => visibleRegisterTabs(role), [role])
  const requested = fixedRegister || searchParams.get('tur')
  const tab = fixedRegister
    ? (canViewRegister(role, fixedRegister) ? getRegisterTab(fixedRegister) : null)
    : resolveRegisterTab(role, requested)
  const drawingOnly = requested === 'drawing' && tab?.key === 'document'
  const registerKey = drawingOnly ? 'drawing' : tab?.key
  const recordId = searchParams.get('kayit')

  const [projectId, setProjectId] = useState(() => readStored(PROJECT_KEY, null))
  const effectiveProjectId = projects.length === 1
    ? projects[0].id
    : (projects.some(p => p.id === projectId) ? projectId : null)
  const project = projects.find(p => p.id === effectiveProjectId) || null

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState(() => tab?.defaultSort || { key: 'no', dir: 'desc' })
  const [page, setPage] = useState(0)
  const [visibleKeys, setVisibleKeys] = useState(() => (tab ? readStored(columnsKey(tab.key), defaultVisibleColumnKeys(tab)) : []))
  const [menuOpen, setMenuOpen] = useState(false)
  const [names, setNames] = useState(new Map())

  // Sekme değişince arama/sıralama/sayfa ve sütun seçimi o sekmeninkine döner.
  useEffect(() => {
    if (!tab) return
    setVisibleKeys(readStored(columnsKey(tab.key), defaultVisibleColumnKeys(tab)))
    setQuery('')
    setStatus('')
    setSort(tab.defaultSort || { key: 'no', dir: 'desc' })
    setPage(0)
    setMenuOpen(false)
  }, [tab?.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data, loading, error, refreshing } = useDashboardData(
    'get_register_list',
    { p_project_id: effectiveProjectId, p_register: registerKey },
    { enabled: Boolean(effectiveProjectId && registerKey) },
  )
  // useDashboardData önceki veriyi korur; başka sekme/projenin satırları bir an görünmesin. Yetkisiz yanıtta
  // register alanı yok; yenileme bitince gösterilir.
  const current = data && effectiveProjectId
    && (data.register === registerKey || (data.authorized === false && !refreshing))
    ? data : null
  const rows = useMemo(() => current?.rows || [], [current])

  useEffect(() => {
    if (!tab || rows.length === 0) return
    let active = true
    fetchProfileNames(personIdsIn(rows, tab)).then(map => { if (active) setNames(map) })
    return () => { active = false }
  }, [rows, tab])

  const columns = useMemo(() => (tab ? allColumns(tab) : []), [tab])
  const shownColumns = useMemo(() => columns.filter(c => c.fixed || visibleKeys.includes(c.key)), [columns, visibleKeys])
  const sortColumn = columns.find(c => c.key === sort.key) || columns[0]
  const filtered = useMemo(
    () => sortRows(filterRows(filterByStatus(rows, status), query, shownColumns, names), sortColumn, sort.dir, names),
    [rows, status, query, shownColumns, names, sortColumn, sort.dir],
  )
  const pageData = paginate(filtered, page)
  const selected = recordId ? rows.find(r => r.id === recordId) || null : null

  function setParams(next) {
    const params = new URLSearchParams(searchParams)
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v)
      else params.delete(k)
    }
    setSearchParams(params, { replace: true })
  }

  function selectProject(id) {
    setProjectId(id || null)
    writeStored(PROJECT_KEY, id || null)
    setPage(0)
    setParams({ kayit: null })
  }

  function toggleColumn(key) {
    const next = visibleKeys.includes(key) ? visibleKeys.filter(k => k !== key) : [...visibleKeys, key]
    setVisibleKeys(next)
    writeStored(columnsKey(tab.key), next)
  }

  function toggleSort(key) {
    setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  if (!tab) {
    return <div className="register-empty" role="status">{fixedRegister ? NO_ACCESS : 'Register kayıtlarını görme yetkiniz yok.'}</div>
  }

  const title = drawingOnly && fixedRegister ? 'Çizimler' : tab.label
  const options = statusOptions(tab)

  return (
    <div className="register-page">
      {!fixedRegister && (
        <div className="register-tabs" role="tablist" aria-label="Register türleri">
          {tabs.map(t => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.key === tab.key}
              className={`register-tab${t.key === tab.key ? ' active' : ''}`}
              onClick={() => setParams({ tur: t.key, kayit: null })}
            >{t.label}</button>
          ))}
        </div>
      )}

      <div className="register-head">
        <div>
          <h2 className="register-title">{title}</h2>
          <div className="register-subtitle">{drawingOnly && fixedRegister ? 'Çizim türündeki dokümanlar' : tab.subtitle}</div>
        </div>
        <div className="register-head-right">
          {projects.length > 1 && (
            <label className="register-field">
              <span>Proje</span>
              <select value={effectiveProjectId || ''} onChange={e => selectProject(e.target.value)}>
                <option value="">Proje seçin</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
          {project && current && current.authorized !== false && (
            current.prefix
              ? <span className="register-code" title="Register numaraları bu proje kodundan üretilir">Proje kodu: <b>{current.prefix}</b></span>
              : <span className="register-code warn">Bu projenin register kodu tanımlı değil; bu projede register numarası alınamaz.</span>
          )}
        </div>
      </div>

      {!effectiveProjectId ? (
        <div className="register-empty" role="status">
          {loadingProjects ? 'Projeler yükleniyor…' : 'Kayıtları görmek için bir proje seçin.'}
        </div>
      ) : (
        <>
          <div className="register-toolbar">
            <input
              type="search"
              className="register-search"
              placeholder="Numara, başlık, sorumlu… ara"
              aria-label="Kayıtlarda ara"
              value={query}
              onChange={e => { setQuery(e.target.value); setPage(0) }}
            />
            {options.length > 0 && (
              <select
                className="register-filter"
                aria-label="Durum süzgeci"
                value={status}
                onChange={e => { setStatus(e.target.value); setPage(0) }}
              >
                <option value="">Tüm durumlar</option>
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
            {tab.drawingFilter && !fixedRegister && (
              <div className="register-segment" role="group" aria-label="Doküman süzgeci">
                <button type="button" className={!drawingOnly ? 'active' : ''} aria-pressed={!drawingOnly}
                  onClick={() => setParams({ tur: 'document', kayit: null })}>Tümü</button>
                <button type="button" className={drawingOnly ? 'active' : ''} aria-pressed={drawingOnly}
                  onClick={() => setParams({ tur: 'drawing', kayit: null })}>Yalnızca çizimler</button>
              </div>
            )}
            <div className="register-colmenu">
              <button type="button" className="register-btn" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
                Sütunlar
              </button>
              {menuOpen && (
                <div className="register-colmenu-list" role="menu">
                  {columns.filter(c => !c.fixed).map(c => (
                    <label key={c.key} className="register-colmenu-item">
                      <input type="checkbox" checked={visibleKeys.includes(c.key)} onChange={() => toggleColumn(c.key)} />
                      {c.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && <div className="register-error" role="alert">{error}</div>}
          {current && current.authorized === false && (
            <div className="register-empty" role="status">
              {fixedRegister ? NO_ACCESS : "Bu register'ı bu projede görme yetkiniz yok."}
            </div>
          )}
          {loading && !current && !error && <div className="register-empty" role="status">Yükleniyor…</div>}

          {current?.authorized && rows.length === 0 && (
            <div className="register-empty" role="status">
              <strong>Bu projede henüz {drawingOnly ? 'çizim' : tab.key === 'risk' ? 'risk' : `${tab.label} kaydı`} yok.</strong>
              <span>Bu sürümde kayıtlar yalnızca görüntülenir; ekrandan kayıt eklenmez.</span>
            </div>
          )}

          {current?.authorized && rows.length > 0 && (
            <>
              <div className="register-table-wrap">
                <table className="register-table">
                  <thead>
                    <tr>
                      {shownColumns.map(c => (
                        <th key={c.key} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                          <button type="button" onClick={() => toggleSort(c.key)}>
                            {c.label}
                            <span className="register-sort" aria-hidden="true">
                              {sort.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                            </span>
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.items.map(row => (
                      <tr
                        key={row.id}
                        className={row.id === recordId ? 'selected' : ''}
                        tabIndex={0}
                        onClick={() => setParams({ kayit: row.id })}
                        onKeyDown={e => { if (e.key === 'Enter') setParams({ kayit: row.id }) }}
                      >
                        {shownColumns.map(c => <td key={c.key}><RegisterCell column={c} row={row} names={names} /></td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filtered.length === 0
                ? <div className="register-empty" role="status">Arama veya süzgeçle eşleşen kayıt yok.</div>
                : (
                  <div className="register-footer">
                    <span>{filtered.length} kayıt</span>
                    <Pager page={pageData.page} totalPages={pageData.totalPages} onChange={setPage} />
                  </div>
                )}
            </>
          )}
        </>
      )}

      {selected && (
        <RegisterDetailPanel
          tab={tab}
          registerKey={tab.key}
          row={selected}
          prefix={current?.prefix}
          names={names}
          onClose={() => setParams({ kayit: null })}
        />
      )}
    </div>
  )
}
