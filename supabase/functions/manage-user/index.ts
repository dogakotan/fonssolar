import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2.57.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Yalnızca POST isteği desteklenir' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Yetkilendirme başlığı eksik' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const adminClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: { user: caller }, error: callerError } = await userClient.auth.getUser()
    if (callerError || !caller) return json({ error: 'Geçersiz veya süresi dolmuş oturum' }, 401)

    const { data: callerProfile } = await adminClient
      .from('profiles').select('role_key').eq('id', caller.id).single()
    if (callerProfile?.role_key !== 'admin') return json({ error: 'Yalnızca yönetici kullanıcı silebilir' }, 403)

    const body = await req.json()
    const action = body.action
    const userId = body.userId ?? body.user_id
    if (typeof userId !== 'string' || !userId) return json({ error: 'Kullanıcı kimliği zorunludur' }, 400)

    const { data: targetProfile } = await adminClient
      .from('profiles').select('id, email, full_name, role_key, project_id').eq('id', userId).maybeSingle()
    if (!targetProfile) return json({ error: 'Kullanıcı bulunamadı' }, 404)

    if (action === 'set-password') {
      const password = typeof body.password === 'string' ? body.password : ''
      const targetEmail = typeof body.targetEmail === 'string' ? body.targetEmail.trim().toLowerCase() : ''
      if (password.length < 8) return json({ error: 'Şifre en az 8 karakter olmalıdır' }, 400)
      if (userId === caller.id) return json({ error: 'Bu ekrandan kendi şifrenizi değiştiremezsiniz' }, 400)
      if (!targetEmail || targetProfile.email?.toLowerCase() !== targetEmail) {
        return json({ error: 'Seçilen kullanıcı kimliği doğrulanamadı; işlem iptal edildi' }, 409)
      }
      const { error: passwordError } = await adminClient.auth.admin.updateUserById(userId, { password })
      if (passwordError) return json({ error: passwordError.message }, 400)
      const { error: auditError } = await adminClient.from('user_management_audit').insert({
        actor_id: caller.id,
        target_user_id: userId,
        target_email: targetProfile.email,
        action: 'password_changed',
      })
      if (auditError) console.error('Şifre değişikliği günlüğe yazılamadı:', auditError.message)
      return json({ success: true }, 200)
    }

    if (action !== 'delete') return json({ error: 'Geçersiz işlem' }, 400)
    if (userId === caller.id) return json({ error: 'Kendi hesabınızı silemezsiniz' }, 400)

    const { error: profileDeleteError } = await adminClient.from('profiles').delete().eq('id', userId)
    if (profileDeleteError) return json({ error: 'Profil silinemedi: ' + profileDeleteError.message }, 400)

    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(userId)
    if (authDeleteError) {
      const { error: restoreError } = await adminClient.from('profiles').insert(targetProfile)
      if (restoreError) console.error('Auth silme hatası sonrası profil geri yüklenemedi:', userId, restoreError.message)
      return json({ error: authDeleteError.message }, 400)
    }

    return json({ success: true }, 200)
  } catch (error) {
    console.error('manage-user beklenmedik hata:', String(error))
    return json({ error: 'Kullanıcı silinirken beklenmedik bir hata oluştu' }, 500)
  }
})
