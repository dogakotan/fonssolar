export function projectIdLabel(projectId) {
  if (!projectId || /^[0-9a-f-]{24,}$/i.test(String(projectId))) return ''
  return String(projectId)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\p{L}/gu, c => c.toLocaleUpperCase('tr-TR'))
}

export function projectSearchTerm(projectId) {
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
