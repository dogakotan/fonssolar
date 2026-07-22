import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2.57.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALLOWED_CREATOR_ROLES = ['admin', 'proje_yoneticisi']
const COMPANY_ROLES = ['admin', 'muhasebe', 'proje_yoneticisi']
const PROJECT_ROLES = ['santiye_sefi']

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

    const { data: callerProfile, error: profileLookupError } = await adminClient
      .from('profiles').select('role_key').eq('id', caller.id).single()
    if (profileLookupError || !ALLOWED_CREATOR_ROLES.includes(callerProfile?.role_key)) {
      return json({ error: 'Sadece admin veya proje yöneticisi kullanıcı davet edebilir' }, 403)
    }

    const body = await req.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : ''
    const roleKey = typeof body.role_key === 'string' ? body.role_key : ''
    const projectId = typeof body.project_id === 'string' && body.project_id ? body.project_id : null
    const password = typeof body.password === 'string' ? body.password : ''

    if (!email || !fullName || !roleKey || password.length < 8) {
      return json({ error: 'E-posta, ad soyad, rol ve en az 8 karakterlik şifre zorunludur' }, 400)
    }
    if (!COMPANY_ROLES.includes(roleKey) && !PROJECT_ROLES.includes(roleKey)) {
      return json({ error: 'Geçersiz kullanıcı rolü' }, 400)
    }
    if (COMPANY_ROLES.includes(roleKey) && projectId) {
      return json({ error: 'Şirket geneli kullanıcıya proje atanamaz' }, 400)
    }
    if (PROJECT_ROLES.includes(roleKey) && !projectId) {
      return json({ error: 'Proje bazlı kullanıcı için proje seçimi zorunludur' }, 400)
    }
    if (roleKey === 'admin' && callerProfile.role_key !== 'admin') {
      return json({ error: 'Yalnızca admin, admin rolünde kullanıcı davet edebilir' }, 403)
    }

    if (projectId) {
      const { data: project } = await adminClient.from('projects').select('id').eq('id', projectId).maybeSingle()
      if (!project) return json({ error: 'Seçilen proje bulunamadı' }, 400)
    }

    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role_key: roleKey, project_id: projectId },
    })
    if (createError) {
      console.error('createUser hata:', createError.message)
      return json({ error: createError.message || 'Kullanıcı oluşturulamadı' }, 400)
    }

    return json({
      success: true,
      message: 'Kullanıcı oluşturuldu',
      user: { id: createData.user.id, email, full_name: fullName, role_key: roleKey, project_id: projectId },
    }, 200)
  } catch (error) {
    console.error('create-user beklenmedik hata:', String(error))
    return json({ error: 'Kullanıcı oluşturulurken beklenmedik bir hata oluştu' }, 500)
  }
})
