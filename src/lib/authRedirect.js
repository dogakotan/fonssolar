export function getAuthRedirectUrl(path = '/dashboard') {
  const configuredUrl = import.meta.env.VITE_APP_URL
  const origin = configuredUrl || (typeof window !== 'undefined' ? window.location.origin : '')

  if (!origin) return path

  return `${origin.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}
