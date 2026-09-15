// `unresolved` yalnızca girdi boşsa veya bir UUID'yse döner (metne çevrilemeyen
// bir eski proje id'si) — çağıranlar bu durumda göstermek istedikleri kendi
// varsayılan etiketini geçebilir (ör. 'Bağlı Proje', '—'); varsayılan boş
// string, resolveProjectByAssignedId'nin aşağıdaki `label || assignedProjectId`
// deseniyle uyumlu kalsın diye.
export function projectIdLabel(projectId, { unresolved = '' } = {}) {
  if (!projectId || /^[0-9a-f-]{24,}$/i.test(String(projectId))) return unresolved
  return String(projectId)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\p{L}/gu, c => c.toLocaleUpperCase('tr-TR'))
}

function projectSearchTerm(projectId) {
  return String(projectId || '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function resolveProjectByAssignedId(supabase, assignedProjectId, columns = '*') {
  if (!assignedProjectId) return null

  const byId = await supabase
    .from('projects')
    .select(columns)
    .eq('id', assignedProjectId)
    .maybeSingle()

  if (byId.data) return byId.data

  const term = projectSearchTerm(assignedProjectId)
  if (term) {
    const byName = await supabase
      .from('projects')
      .select(columns)
      .ilike('name', `%${term}%`)
      .limit(1)
      .maybeSingle()

    if (byName.data) return byName.data
  }

  const label = projectIdLabel(assignedProjectId)
  return { id: assignedProjectId, name: label || assignedProjectId, location: null }
}
