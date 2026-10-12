import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

// Bir projenin WBS ağacı, alanları, alan-WBS bağları ve disiplin sözlüğü (Faz 1 Adım 5).
// `available` false ise Faz 1 tabloları (task_disciplines) bu veritabanında yok: ekranlar yeni özellikleri gizler
// (geriye dönük uyum: frontend, migration'dan önce yayına çıkarsa kırılmasın).
export function useProjectStructure(projectId) {
  const [state, setState] = useState({ loading: true, available: false, disciplines: [], wbs: [], areas: [], links: [], error: null })

  const load = useCallback(async () => {
    if (!projectId) { setState(s => ({ ...s, loading: false })); return }
    setState(s => ({ ...s, loading: true }))
    const [d, w, a, l] = await Promise.all([
      supabase.from('task_disciplines').select('discipline, id_code, label_tr, sort_order').order('sort_order'),
      supabase.from('project_wbs').select('id, wbs_code, name, parent_id, level, discipline, is_active, notes').eq('project_id', projectId).order('wbs_code'),
      supabase.from('project_areas').select('id, area_code, name, area_type, parent_id, is_active, notes').eq('project_id', projectId).order('area_code'),
      supabase.from('area_wbs').select('area_id, wbs_id').eq('project_id', projectId),
    ])
    const error = w.error || a.error || l.error
    setState({
      loading: false,
      available: !d.error,
      disciplines: d.data || [],
      wbs: w.data || [],
      areas: a.data || [],
      links: l.data || [],
      error,
    })
  }, [projectId])

  useEffect(() => { load() }, [load])

  const helpers = useMemo(() => buildStructureHelpers(state.wbs, state.areas, state.links), [state.wbs, state.areas, state.links])
  return { ...state, ...helpers, reload: load }
}

// Karar 38: bir WBS'in etkin alan kümesi = WBS'in ve bütün üst WBS'lerinin bağlı alanları.
// Küme boşsa "bağ tanımsız" (her alan kullanılabilir).
export function buildStructureHelpers(wbs, areas, links) {
  const wbsById = new Map(wbs.map(x => [x.id, x]))
  const areaById = new Map(areas.map(x => [x.id, x]))
  const linksByWbs = new Map()
  for (const k of links) {
    if (!linksByWbs.has(k.wbs_id)) linksByWbs.set(k.wbs_id, new Set())
    linksByWbs.get(k.wbs_id).add(k.area_id)
  }

  function wbsChain(wbsId) {
    const chain = []
    const seen = new Set()
    let cur = wbsById.get(wbsId)
    while (cur && !seen.has(cur.id)) {
      chain.push(cur)
      seen.add(cur.id)
      cur = cur.parent_id ? wbsById.get(cur.parent_id) : null
    }
    return chain
  }

  // { areaIds:Set, sources:Map(areaId → wbs_code), defined:boolean }
  function effectiveAreas(wbsId) {
    const areaIds = new Set()
    const sources = new Map()
    for (const node of wbsChain(wbsId)) {
      for (const id of linksByWbs.get(node.id) || []) {
        areaIds.add(id)
        if (!sources.has(id)) sources.set(id, node.wbs_code)
      }
    }
    return { areaIds, sources, defined: areaIds.size > 0 }
  }

  // 'undefined' | 'linked' | 'not_linked' (fn_wbs_chain_area_state'in istemci eşi)
  function chainState(wbsId, areaId) {
    if (!wbsId || !areaId) return null
    const eff = effectiveAreas(wbsId)
    if (!eff.defined) return 'undefined'
    return eff.areaIds.has(areaId) ? 'linked' : 'not_linked'
  }

  function depthOf(list, byId, id) {
    let d = 0
    let cur = byId.get(id)
    const seen = new Set()
    while (cur?.parent_id && !seen.has(cur.id)) { seen.add(cur.id); d += 1; cur = byId.get(cur.parent_id) }
    return d
  }

  // Ağaç sırası: üst → altlar (her seviye koda göre); { item, depth }
  function treeOrder(list) {
    const byId = new Map(list.map(x => [x.id, x]))
    const children = new Map()
    for (const x of list) {
      const p = x.parent_id && byId.has(x.parent_id) ? x.parent_id : null
      if (!children.has(p)) children.set(p, [])
      children.get(p).push(x)
    }
    const codeOf = x => x.wbs_code ?? x.area_code ?? ''
    for (const arr of children.values()) arr.sort((a, b) => codeOf(a).localeCompare(codeOf(b), 'tr-TR'))
    const out = []
    const walk = (parent, depth) => {
      for (const x of children.get(parent) || []) { out.push({ item: x, depth }); walk(x.id, depth + 1) }
    }
    walk(null, 0)
    return out
  }

  return {
    wbsById, areaById, linksByWbs, wbsChain, effectiveAreas, chainState, treeOrder,
    wbsDepth: id => depthOf(wbs, wbsById, id),
  }
}
