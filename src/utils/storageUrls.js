import { supabase } from '../lib/supabase'

const SIGNED_URL_TTL_SECONDS = 60 * 60

export async function withSignedStorageUrls(bucket, rows = []) {
  if (!rows.length) return []

  const paths = rows.map(row => row?.storage_path).filter(Boolean)
  if (!paths.length) return rows.map(row => ({ ...row, signed_url: null }))

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)

  if (error) {
    console.error(`Signed URLs could not be created for ${bucket}:`, error)
    return rows.map(row => ({ ...row, signed_url: null }))
  }

  const urlsByPath = new Map((data || []).map(item => [item.path, item.signedUrl]))
  return rows.map(row => ({
    ...row,
    signed_url: row?.storage_path ? urlsByPath.get(row.storage_path) || null : null,
  }))
}
