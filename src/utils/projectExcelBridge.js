import { supabase } from '../lib/supabase'

async function friendlyError(error, fallback) {
  const status = error?.context?.status
  if (status === 401) return new Error('Oturum süresi doldu, lütfen tekrar giriş yapın.')
  if (status === 403) return new Error('Bu projeye erişim yetkiniz yok.')
  let serverMessage = null
  try { serverMessage = (await error.context?.json())?.error } catch { /* body already consumed or not JSON */ }
  return new Error(serverMessage || error.message || fallback)
}

export async function importProjectExcel(file) {
  const formData = new FormData()
  formData.append('file', file)
  const { data, error } = await supabase.functions.invoke('import-project-excel', { body: formData })
  if (error) throw await friendlyError(error, 'Excel içeri aktarılamadı')
  return data
}

export async function exportProjectExcelBlob(projectId) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-project-excel?project_id=${encodeURIComponent(projectId)}`,
    {
      headers: {
        Authorization: `Bearer ${session?.access_token || ''}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
    }
  )
  if (!res.ok) {
    if (res.status === 401) throw new Error('Oturum süresi doldu, lütfen tekrar giriş yapın.')
    if (res.status === 403) throw new Error('Bu projeye erişim yetkiniz yok.')
    let message = 'Excel dışa aktarılamadı'
    try { message = (await res.json())?.error || message } catch { /* not JSON */ }
    throw new Error(message)
  }
  return res.blob()
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function formatImportSummary(summary) {
  if (!summary) return ''
  return Object.entries(summary)
    .map(([table, counts]) => {
      const parts = []
      if (counts?.inserted != null) parts.push(`${counts.inserted} eklendi`)
      if (counts?.updated != null) parts.push(`${counts.updated} güncellendi`)
      return parts.length ? `${table}: ${parts.join(', ')}` : null
    })
    .filter(Boolean)
    .join('\n')
}
