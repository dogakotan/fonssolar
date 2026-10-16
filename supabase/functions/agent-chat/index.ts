import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2.57.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MODEL = 'gemini-3.5-flash'
const MAX_REQUEST_BYTES = 18 * 1024 * 1024
const MAX_MESSAGES = 40
const MAX_PARTS_PER_MESSAGE = 8
const MAX_TEXT_LENGTH = 100_000
const MAX_INLINE_DATA_LENGTH = 16 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function validateContents(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_MESSAGES) return false

  return value.every((message: unknown) => {
    if (!message || typeof message !== 'object') return false
    const record = message as Record<string, unknown>
    if (!['user', 'model'].includes(String(record.role))) return false
    if (!Array.isArray(record.parts) || record.parts.length < 1 || record.parts.length > MAX_PARTS_PER_MESSAGE) return false

    return record.parts.every((part: unknown) => {
      if (!part || typeof part !== 'object') return false
      const partRecord = part as Record<string, unknown>
      if (typeof partRecord.text === 'string') return partRecord.text.length <= MAX_TEXT_LENGTH
      const inlineData = partRecord.inlineData as Record<string, unknown> | undefined
      return Boolean(
        inlineData &&
        typeof inlineData.mimeType === 'string' &&
        ALLOWED_MIME_TYPES.has(inlineData.mimeType) &&
        typeof inlineData.data === 'string' &&
        inlineData.data.length <= MAX_INLINE_DATA_LENGTH &&
        /^[A-Za-z0-9+/]*={0,2}$/.test(inlineData.data),
      )
    })
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Only POST is supported' }, 405)

  const authorization = req.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
  if (!supabaseUrl || !supabaseAnonKey) return json({ error: 'Supabase auth is not configured' }, 500)
  if (!geminiApiKey) return json({ error: 'Gemini API key is not configured on the server' }, 503)

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return json({ error: 'Invalid or expired session' }, 401)

  const declaredLength = Number(req.headers.get('content-length') || 0)
  if (declaredLength > MAX_REQUEST_BYTES) return json({ error: 'Request is too large' }, 413)

  try {
    const rawBody = await req.text()
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return json({ error: 'Request is too large' }, 413)
    }

    const body = JSON.parse(rawBody)
    const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt : ''
    if (!systemPrompt || systemPrompt.length > MAX_TEXT_LENGTH || !validateContents(body.contents)) {
      return json({ error: 'Invalid chat request' }, 400)
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiApiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: body.contents,
          generationConfig: { maxOutputTokens: 1500, temperature: 0.7 },
        }),
      },
    )

    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      const status = response.status === 429 ? 429 : 502
      return json({ error: result?.error?.message || 'Gemini request failed' }, status)
    }

    const text = result?.candidates?.[0]?.content?.parts
      ?.filter((part: { text?: string }) => typeof part.text === 'string')
      .map((part: { text: string }) => part.text)
      .join('') || ''
    return json({ text })
  } catch (error) {
    console.error('agent-chat request failed:', String(error))
    return json({ error: 'Could not process the chat request' }, 400)
  }
})
