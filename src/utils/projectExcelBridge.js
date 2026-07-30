import { supabase } from '../lib/supabase'

async function friendlyError(error, fallback) {
  const status = error?.context?.status
  if (status === 401) return new Error('Oturum süresi doldu, lütfen tekrar giriş yapın.')
  if (status === 403) return new Error('Bu projeye erişim yetkiniz yok.')
  let serverMessage = null
  try { serverMessage = (await error.context?.json())?.error } catch { /* body already consumed or not JSON */ }
  return new Error(serverMessage || error.message || fallback)
}

// mode: 'ask' (varsayılan, ilk deneme) | 'update' (kullanıcı "mevcut projeyi
// güncelle" dedi) | 'duplicate' (kullanıcı "yeni kopya olarak yükle" dedi).
// Proje ID zaten varken 'ask' ile çağrılırsa backend hiçbir şey yazmadan 409
// + {conflict:true} döner — burada bunu ayrı bir hata tipine çeviriyoruz ki
// çağıran taraf kullanıcıya seçim sorabilsin (bkz. TabProjeYonetimi.jsx).
export async function importProjectExcel(file, mode = 'ask') {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('mode', mode)
  const { data, error } = await supabase.functions.invoke('import-project-excel', { body: formData })
  if (error) {
    if (error?.context?.status === 409) {
      let body = null
      try { body = await error.context?.json() } catch { /* body already consumed or not JSON */ }
      if (body?.conflict) {
        const conflictError = new Error(`Bu Proje ID zaten kullanılıyor: ${body.existing_name || body.existing_id}`)
        conflictError.conflict = true
        conflictError.existingId = body.existing_id
        conflictError.existingName = body.existing_name
        throw conflictError
      }
    }
    throw await friendlyError(error, 'Excel içeri aktarılamadı')
  }
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
