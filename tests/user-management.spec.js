import { test, expect } from '@playwright/test'
import { signIn } from './helpers.js'

async function invokeDelete(client, userId) {
  const { data, error } = await client.functions.invoke('manage-user', {
    body: { action: 'delete', userId },
  })
  return { data, error }
}

async function invokeSetPassword(client, userId, targetEmail, password) {
  return client.functions.invoke('manage-user', {
    body: { action: 'set-password', userId, targetEmail, password },
  })
}

test.describe('Kullanıcı silme güvenliği', () => {
  test('yönetici kullanıcı oluşturur, kullanıcı giriş yapar ve yönetici siler', async () => {
    const marker = Date.now()
    const email = `codex.user.${marker}@fonssolar.com`
    const password = `Test-${marker}!`
    const { client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD)

    const { data: staleProfiles } = await admin.from('profiles').select('id').like('email', 'codex.user.%@fonssolar.com')
    for (const stale of staleProfiles || []) await invokeDelete(admin, stale.id)

    const { data: created, error: createError } = await admin.functions.invoke('create-user', {
      body: {
        email,
        password,
        full_name: 'Geçici Kullanıcı Testi',
        role_key: 'muhasebe',
        project_id: null,
      },
    })
    expect(createError).toBeNull()
    expect(created?.user?.id).toBeTruthy()

    try {
      const { user } = await signIn(email, password)
      expect(user.id).toBe(created.user.id)

      const changedPassword = `Changed-${marker}!`
      const { error: passwordError } = await invokeSetPassword(admin, created.user.id, email, changedPassword)
      expect(passwordError).toBeNull()
      expect((await signIn(email, changedPassword)).user.id).toBe(created.user.id)
      expect((await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD)).user.id).toBeTruthy()

      const { error: deleteError } = await invokeDelete(admin, created.user.id)
      expect(deleteError).toBeNull()

      await expect(signIn(email, password)).rejects.toThrow()
    } finally {
      const { data: profile } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
      if (profile?.id) await invokeDelete(admin, profile.id)
    }
  })

  test('yönetici kendi hesabını silemez', async () => {
    const { client, user } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD)
    const { data, error } = await invokeDelete(client, user.id)

    expect(error).toBeTruthy()
    expect(data).toBeNull()
    expect(await client.auth.getUser()).toMatchObject({ data: { user: { id: user.id } } })
  })

  test('proje yöneticisi kullanıcı silemez', async () => {
    const { client } = await signIn(process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD)
    const { data, error } = await invokeDelete(client, '00000000-0000-0000-0000-000000000000')

    expect(error).toBeTruthy()
    expect(data).toBeNull()
  })
})
